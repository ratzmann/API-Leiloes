# Sistema de Leilão de Bois — Microsserviços

Trabalho de Microsserviços: **cadastro de leiloeiros e licitantes**, **cadastro de leilão (evento)**, **registro e consulta de lances** + **sistema de autenticação com Kong**.

> 📘 **Explicação didática da arquitetura** (para quem está começando):
> [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). O código-fonte também está
> comentado passo a passo.

## Arquitetura

```
                         ┌──────────────┐
    Cliente / Frontend ─▶│  Kong (8000) │  ← API Gateway (padrão de microsserviços)
                         └──────┬───────┘
       ┌────────────────┬───────┴────────┬────────────────┐
    público      protegido (JWT)  protegido (JWT)  protegido (JWT)
    /auth/*      /leiloeiros/*       /leiloes/*       /lances/*
                 /licitantes/*
       │                │                │                │
       ▼                ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ auth-service │ │ usuarios-    │ │ leiloes-     │ │ lances-      │
│ (porta 3001) │ │ service(3002)│ │ service(3003)│ │ service(3003)│
│ Postgres auth│ │ Postgres usr │ │ Postgres lei │ │ Postgres lnc │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

   Comunicação REST entre os serviços (direto pela rede do Docker,
   sem passar pelo Kong, URL sempre vinda de variável de ambiente):

   auth-service     ──▶ usuarios-service   cria o perfil ao registrar
   leiloes-service  ──▶ usuarios-service   valida o leiloeiro do leilão
   lances-service   ──▶ leiloes-service    Saga passo 1: leilão aceita lances?
   lances-service   ──▶ usuarios-service   Saga passos 2 e 4: reserva e libera crédito
```

- **auth-service**: cadastro de credenciais (e-mail/senha), login, emissão de
  JWT (HS256). Ao registrar um usuário, chama o `usuarios-service` via HTTP
  usando a variável de ambiente `USUARIOS_SERVICE_URL` para criar o perfil de
  domínio (leiloeiro ou licitante).
- **usuarios-service**: CRUD de **Leiloeiro** e **Licitante**, arquitetura em
  camadas (`routes → controllers → services → repositories → Postgres`).
  Também controla o **crédito do licitante**: reservas e liberações usadas
  pela Saga de lances.
- **leiloes-service**: cadastro de **Leilão (evento)** — o pregão em si, com
  lote, valores, período e ciclo de vida (`AGENDADO → ABERTO → ENCERRADO`).
  Mesma arquitetura em camadas, mais uma camada `clients/` para a comunicação
  REST com o `usuarios-service` (`USUARIOS_SERVICE_URL`), usada para validar o
  leiloeiro responsável antes de gravar o leilão. Detalhes em
  [`leiloes-service/README.md`](leiloes-service/README.md).
- **lances-service**: Registro e consulta de **Lances** de leilões, com histórico,
  validação de maior lance atual e regras anti-lance repetido. Segue a mesma
  arquitetura em camadas (`routes → controllers → services → repositories → Postgres`),
  mais `clients/` (REST) e `sagas/`: é o **orquestrador da Saga** de registro de lance.
- **Kong**: roda em modo *DB-less* (config declarativa em `kong/kong.yml`).
  É o único ponto de entrada exposto (porta `8000`). As rotas
  `/leiloeiros`, `/licitantes`, `/leiloes` e `/lances` exigem um JWT válido (plugin `jwt` do Kong);
  a rota `/auth` (login/registro) é pública. O Kong valida a assinatura do
  token emitido pelo `auth-service` porque o `Consumer` `sistema-leilao`
  está configurado com o mesmo segredo HS256 (`JWT_SECRET`) usado para
  assinar os tokens. As rotas de reserva de crédito
  (`/licitantes/:id/reservas`) são internas e o Kong as bloqueia com `403`.

## Padrões de microsserviços

1. **API Gateway** — Kong, único ponto de entrada, com autenticação JWT.
2. **Saga (orquestrada, via REST)** — registro de lance, descrito abaixo.

## Saga: registro de lance

Cada serviço tem o próprio banco, então não existe uma transação única que
cubra "reservar o crédito do licitante" (banco do `usuarios-service`) e
"gravar o lance" (banco do `lances-service`). A Saga troca essa transação por
uma **sequência de transações locais**; se um passo falha, o orquestrador
executa as **compensações** dos passos que já tinham dado certo.

O orquestrador fica em
[`lances-service/src/sagas/registrarLanceSaga.js`](lances-service/src/sagas/registrarLanceSaga.js).

| # | Passo | Serviço | Tipo | Se falhar |
|---|---|---|---|---|
| 1 | `consultar-disponibilidade` | leiloes-service | leitura | recusa o lance (404 / 409); nada a desfazer |
| 2 | `reservar-credito` | usuarios-service | **compensável** | recusa o lance (404 / 409 crédito insuficiente) |
| 3 | `gravar-lance` | lances-service | **ponto sem volta** | **compensa o passo 2**: libera a reserva |
| 4 | `liberar-credito-superado` | usuarios-service | **repetível** | tenta 3 vezes; se não der, a saga fica `CONCLUIDA_COM_PENDENCIA` e pode ser reprocessada |

Detalhes de implementação:

- **Idempotência**: a reserva usa o id da saga como `referencia` (única); repetir a chamada devolve a mesma reserva. Liberar duas vezes não gera erro.
- **Concorrência**: a reserva trava o licitante (`SELECT ... FOR UPDATE`) e o passo 3 trava o leilão (`pg_advisory_xact_lock`) e confere a regra de valor de novo antes do `INSERT`.
- **Rastreabilidade**: cada execução fica na tabela `sagas_lance`, com status e todos os passos.
- **Demonstração da compensação**: com `SAGA_PERMITIR_FALHA_SIMULADA=true` (definido no `docker-compose.yml`), o header `X-Simular-Falha: gravar-lance` ou `X-Simular-Falha: liberar-credito-superado` força a falha naquele passo.

Status possíveis: `CONCLUIDA`, `CONCLUIDA_COM_PENDENCIA`, `FALHOU` (nada a
compensar), `COMPENSADA`, `FALHOU_COMPENSACAO`.

| Rota | O que faz |
|---|---|
| `POST /lances` | inicia a Saga; a resposta traz `sagaId` e `sagaStatus` (também nos erros) |
| `GET /lances/sagas` | últimas sagas executadas |
| `GET /lances/sagas/:id` | uma saga, passo a passo |
| `POST /lances/sagas/:id/reprocessar` | tenta de novo o passo 4 de uma saga pendente |
| `GET /licitantes/:id/credito` | limite, reservado e disponível do licitante |

## Regras de negócio implementadas

### usuarios-service

**Leiloeiro**
1. Nome, e-mail e registro profissional obrigatórios.
2. E-mail único.
3. Registro profissional (ex: `JUCESC-000123`) único e com formato validado.

**Licitante**
1. CPF validado (dígitos verificadores) e único.
2. E-mail único.
3. Limite de crédito nunca pode ser negativo.

**Crédito**
1. A soma das reservas ativas nunca ultrapassa o limite de crédito do licitante.
2. Reserva e liberação são idempotentes.

### leiloes-service

**Leilão (evento)**
1. Validação do evento: título, lote (≥ 1 boi), lance inicial e incremento
   mínimo maiores que zero (e incremento nunca maior que o lance inicial),
   datas ISO 8601 com fim depois do início e duração mínima de 30 minutos.
2. Data de início obrigatoriamente no futuro.
3. O leilão só é gravado se o `leiloeiroId` existir de fato — verificado por
   chamada REST ao `usuarios-service`.
4. Um leiloeiro não pode ter dois leilões ativos com períodos sobrepostos.
5. Ciclo de vida controlado: `AGENDADO → ABERTO → ENCERRADO`, com cancelamento
   permitido apenas enquanto não estiver encerrado.
6. Edição e exclusão só enquanto o leilão está `AGENDADO`.
7. **Autorização**: só um usuário com papel `LEILOEIRO` cadastra leilão, e
   sempre em nome próprio (o `leiloeiroId` vem do token; se enviado no corpo,
   precisa ser o próprio). Editar, mudar status e remover: só o **dono** do
   leilão. Violações → `403` (sem login → `401`). As rotas `GET` continuam livres.

### lances-service

**Lance**
1. Identificadores (`leilaoId`, `licitanteId`) e `valor` obrigatórios e válidos.
2. Valor do lance deve ser estritamente positivo (> 0).
3. O leilão precisa existir e estar aceitando lances (`ABERTO` e dentro do período), consultado no `leiloes-service`.
4. Primeiro lance ≥ lance inicial; os seguintes ≥ maior lance atual + incremento mínimo.
5. Licitante não pode cobrir o seu próprio lance consecutivo se já detém o maior lance atual.
6. O licitante precisa ter crédito disponível para o valor do lance (reservado no `usuarios-service`).
7. **Autorização**: só um usuário com papel `LICITANTE` dá lance, e sempre em
   nome próprio — o `licitanteId` vem do token; se enviado no corpo, precisa ser
   o próprio. Assim ninguém dá lance nem gasta o crédito de outra pessoa (`403`).

### Autorização pelo token

O token JWT emitido pelo `auth-service` leva `sub` (id do **usuário** no
auth-db), `papel` e `perfilId` (id do **leiloeiro/licitante** no
usuarios-service). O Kong confere a assinatura; os serviços usam `papel` e
`perfilId` para decidir **em nome de quem** a requisição pode agir. Tokens
emitidos antes desta regra não têm `perfilId`: basta fazer login de novo.

## Como rodar

```bash
docker compose up --build
```

Serviços:
- Gateway (Kong): `http://localhost:8000`
- Admin API do Kong (dev): `http://localhost:8001`

> `auth-service`, `usuarios-service`, `leiloes-service` e `lances-service` **não** têm porta
> publicada no host — só são acessíveis pela rede interna do Docker ou através
> do Kong. Isso garante que o Kong é o único ponto de entrada real da
> aplicação.

## Fluxo de uso (via Kong, porta 8000)

### 1. Registrar um licitante
```bash
curl -X POST http://localhost:8000/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Maria Souza",
    "email": "maria@example.com",
    "senha": "senha123",
    "papel": "LICITANTE",
    "dadosPerfil": { "cpf": "52998224725", "limiteCredito": 5000 }
  }'
```
Resposta inclui `token` (JWT) já pronto para uso.

### 2. Login
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "maria@example.com", "senha": "senha123" }'
```

### 3. Consultar licitantes (rota protegida pelo Kong)
```bash
curl http://localhost:8000/licitantes \
  -H "Authorization: Bearer <TOKEN_RECEBIDO>"
```
Sem o header `Authorization` (ou com token inválido), o Kong responde
`401 Unauthorized` antes mesmo de a requisição chegar ao serviço interno.

### 4. Registrar um leiloeiro
```bash
curl -X POST http://localhost:8000/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Carlos Pereira",
    "email": "carlos@example.com",
    "senha": "senha123",
    "papel": "LEILOEIRO",
    "dadosPerfil": { "registroProfissional": "JUCESC-000123", "telefone": "47999998888" }
  }'
```

### 5. Cadastrar um leilão (rota protegida pelo Kong)
```bash
curl -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer <TOKEN_DO_LEILOEIRO>" \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Leilão de Nelore - Lote 12",
    "localEvento": "Parque de Exposições de Lages",
    "raca": "Nelore",
    "quantidadeBois": 40,
    "lanceInicial": 5000,
    "incrementoMinimo": 100,
    "dataInicio": "2026-10-01T14:00:00Z",
    "dataFim": "2026-10-01T18:00:00Z"
  }'
```
O leilão é criado em nome do leiloeiro dono do token (o `leiloeiroId` pode ser
omitido; se enviado, precisa ser o próprio). Depois, `PATCH /leiloes/1/abrir`
(só o dono) coloca o pregão no ar e `GET /leiloes/1/disponibilidade` informa
se ele está aceitando lances.

### 6. Registrar um lance (inicia a Saga)
O leilão precisa estar `ABERTO` e dentro do período. Use o token do **próprio
licitante**: o lance é sempre dado em nome de quem está logado (um leiloeiro,
ou um licitante tentando agir por outro, recebe `403`).
```bash
curl -X POST http://localhost:8000/lances \
  -H "Authorization: Bearer <TOKEN_DO_LICITANTE>" \
  -H "Content-Type: application/json" \
  -d '{
    "leilaoId": 1,
    "valor": 5000.00
  }'

# a mesma chamada, forçando a compensação (crédito reservado é devolvido)
curl -X POST http://localhost:8000/lances \
  -H "Authorization: Bearer <TOKEN_DO_LICITANTE>" \
  -H "X-Simular-Falha: gravar-lance" \
  -H "Content-Type: application/json" \
  -d '{ "leilaoId": 1, "valor": 5100.00 }'

# acompanhar a saga (o sagaId vem na resposta)
curl http://localhost:8000/lances/sagas/<SAGA_ID> \
  -H "Authorization: Bearer <TOKEN_RECEBIDO>"
```

### 7. Consultar lances de um leilão e maior lance atual
```bash
# Todos os lances do leilão 1
curl http://localhost:8000/lances/leilao/1 \
  -H "Authorization: Bearer <TOKEN_RECEBIDO>"

# Maior lance atual do leilão 1
curl http://localhost:8000/lances/leilao/1/maior \
  -H "Authorization: Bearer <TOKEN_RECEBIDO>"
```

## Testes automatizados

```bash
cd auth-service && npm install && npm test
cd usuarios-service && npm install && npm test
cd leiloes-service && npm install && npm test
cd lances-service && npm install && npm test
```

Todos usam Jest com repositórios (e clients HTTP) mockados, testando as regras
de negócio em `services/` (e a Saga em `sagas/`), e reportam cobertura
(`--coverage`), ficando acima dos 50% exigidos.

Ponta a ponta, com a stack no ar (PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File .\testes\testar-tudo.ps1
```
57 passos pelo Kong: autenticação, usuários, leilões, a Saga de lances —
caminho feliz, recusas, compensação, pendência e reprocessamento — e a
autorização (ninguém age em nome de outra pessoa).

## Variáveis de ambiente

Cada serviço tem um `.env.example`. No `docker-compose.yml` os valores já
vêm definidos; para rodar um serviço fora do Docker, copie o `.env.example`
para `.env` e ajuste `DB_HOST` etc.

## Próximos passos (grupo)

- Acompanhamento ao vivo dos lances (WebSockets ou Event-Driven).
- Encerramento do pregão como Saga: ao encerrar, confirmar o crédito do
  vencedor e liberar eventuais reservas remanescentes.
