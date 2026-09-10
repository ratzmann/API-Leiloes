# Sistema de Leilão de Bois — Microsserviços

Trabalho 1 (Microsserviços): **cadastro de leiloeiros e licitantes**,
**cadastro de leilão (evento)** e **sistema de autenticação com Kong**.

## Arquitetura

```
                              ┌──────────────┐
        Cliente / Frontend ─▶ │  Kong (8000) │  ← API Gateway (padrão de microsserviços)
                              └──────┬───────┘
                      público        │        protegido por plugin JWT
                   /auth/*           │        /leiloeiros/*  /licitantes/*  /leiloes/*
                      │              │
        ┌─────────────▼──┐  ┌────────▼─────────┐  ┌──────────────────┐
        │  auth-service  │  │ usuarios-service │  │  leiloes-service │
        │  (porta 3001)  │  │   (porta 3002)   │  │   (porta 3003)   │
        │ Postgres auth  │  │ Postgres usuarios│  │ Postgres leiloes │
        └────────┬───────┘  └────────▲─────────┘  └─────────┬────────┘
                 │                   │                      │
                 │ cria perfil       │  valida leiloeiro    │
                 │ (USUARIOS_SERVICE_URL)                   │
                 └───────────────────┴──────────────────────┘
             chamadas HTTP diretas ao container, pela rede interna do
             Docker (sem passar pelo Kong), sempre com a URL do destino
             vinda de variável de ambiente
```

- **auth-service**: cadastro de credenciais (e-mail/senha), login, emissão de
  JWT (HS256). Ao registrar um usuário, chama o `usuarios-service` via HTTP
  usando a variável de ambiente `USUARIOS_SERVICE_URL` para criar o perfil de
  domínio (leiloeiro ou licitante) — é assim que os dois serviços se
  comunicam, e o mesmo padrão (URL do serviço em variável de ambiente) deve
  facilitar a integração no Trabalho 2.
- **usuarios-service**: CRUD de **Leiloeiro** e **Licitante**, arquitetura em
  camadas (`routes → controllers → services → repositories → Postgres`).
- **leiloes-service**: cadastro de **Leilão (evento)** — o pregão em si, com
  lote, valores, período e ciclo de vida (`AGENDADO → ABERTO → ENCERRADO`).
  Mesma arquitetura em camadas, mais uma camada `clients/` para a comunicação
  REST com o `usuarios-service` (`USUARIOS_SERVICE_URL`), usada para validar o
  leiloeiro responsável antes de gravar o leilão. Detalhes em
  [`leiloes-service/README.md`](leiloes-service/README.md).
- **Kong**: roda em modo *DB-less* (config declarativa em `kong/kong.yml`).
  É o único ponto de entrada exposto (porta `8000`). As rotas
  `/leiloeiros`, `/licitantes` e `/leiloes` exigem um JWT válido (plugin `jwt` do Kong);
  a rota `/auth` (login/registro) é pública. O Kong valida a assinatura do
  token emitido pelo `auth-service` porque o `Consumer` `sistema-leilao`
  está configurado com o mesmo segredo HS256 (`JWT_SECRET`) usado para
  assinar os tokens.

## Regras de negócio implementadas (usuarios-service)

**Leiloeiro**
1. Nome, e-mail e registro profissional obrigatórios.
2. E-mail único.
3. Registro profissional (ex: `JUCESC-000123`) único e com formato validado.

**Licitante**
1. CPF validado (dígitos verificadores) e único.
2. E-mail único.
3. Limite de crédito nunca pode ser negativo.

## Regras de negócio implementadas (leiloes-service)

**Leilão (evento)**
1. Validação do evento: título, lote (≥ 1 boi), lance inicial e incremento
   mínimo maiores que zero (e incremento nunca maior que o lance inicial),
   datas ISO 8601 com fim depois do início e duração mínima de 30 minutos.
2. O leilão só é gravado se o `leiloeiroId` existir de fato — verificado por
   chamada REST ao `usuarios-service`.
3. Data de início obrigatoriamente no futuro.
4. Um leiloeiro não pode ter dois leilões ativos com períodos sobrepostos.
5. Ciclo de vida controlado: `AGENDADO → ABERTO → ENCERRADO`, com cancelamento
   permitido apenas enquanto não estiver encerrado.
6. Edição e exclusão só enquanto o leilão está `AGENDADO`.

## Como rodar

```bash
docker compose up --build
```

Serviços:
- Gateway (Kong): `http://localhost:8000`
- Admin API do Kong (dev): `http://localhost:8001`

> `auth-service`, `usuarios-service` e `leiloes-service` **não** têm porta
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
`401 Unauthorized` antes mesmo de a requisição chegar ao `usuarios-service`.

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
    "leiloeiroId": 1,
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
Depois, `PATCH /leiloes/1/abrir` coloca o pregão no ar e
`GET /leiloes/1/disponibilidade` informa se ele está aceitando lances.

## Testes automatizados

```bash
cd auth-service && npm install && npm test
cd usuarios-service && npm install && npm test
cd leiloes-service && npm install && npm test
```

Todos usam Jest com repositórios (e clients HTTP) mockados, testando as regras
de negócio em `services/`, e reportam cobertura (`--coverage`), ficando acima
dos 50% exigidos.

## Variáveis de ambiente

Cada serviço tem um `.env.example`. No `docker-compose.yml` os valores já
vêm definidos; para rodar um serviço fora do Docker, copie o `.env.example`
para `.env` e ajuste `DB_HOST` etc.

## Próximos passos (grupo)

- Cadastro de Lances — próximo microsserviço do grupo. Já existe o ponto de
  integração pronto: `GET /leiloes/:id/disponibilidade` no `leiloes-service`
  responde se o leilão está `ABERTO` e dentro do período, junto com
  `lanceInicial` e `incrementoMinimo` para validar o valor do lance.
- Acompanhamento ao vivo dos lances (provavelmente WebSockets ou Event-Driven,
  que conta como o 2º padrão de microsserviços exigido, junto com o API
  Gateway já implementado aqui via Kong).
- Padronizar as URLs dos novos serviços por variável de ambiente, seguindo o
  mesmo modelo já usado entre `auth-service`, `usuarios-service` e
  `leiloes-service`.
