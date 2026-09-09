# Sistema de Leilão de Bois — Microsserviços

Parte inicial do Trabalho 1 (Microsserviços): **cadastro de leiloeiros e
licitantes** + **sistema de autenticação com Kong**.

## Arquitetura

```
                         ┌──────────────┐
   Cliente / Frontend ─▶ │  Kong (8000) │  ← API Gateway (padrão de microsserviços)
                         └──────┬───────┘
                 público        │        protegido por plugin JWT
              /auth/*           │        /leiloeiros/*  /licitantes/*
                 │              │
        ┌────────▼───────┐  ┌───▼─────────────┐
        │  auth-service   │  │ usuarios-service │
        │   (porta 3001)  │  │   (porta 3002)   │
        │  Postgres auth  │  │ Postgres usuarios│
        └────────┬────────┘  └──────────────────┘
                  │  cria perfil via HTTP interno
                  │  (USUARIOS_SERVICE_URL, chamada direta
                  │   ao container, sem passar pelo Kong)
                  └───────────────────────────▶ usuarios-service
```

- **auth-service**: cadastro de credenciais (e-mail/senha), login, emissão de
  JWT (HS256). Ao registrar um usuário, chama o `usuarios-service` via HTTP
  usando a variável de ambiente `USUARIOS_SERVICE_URL` para criar o perfil de
  domínio (leiloeiro ou licitante) — é assim que os dois serviços se
  comunicam, e o mesmo padrão (URL do serviço em variável de ambiente) deve
  facilitar a integração no Trabalho 2.
- **usuarios-service** (meu microsserviço individual): CRUD de **Leiloeiro**
  e **Licitante**, arquitetura em camadas (`routes → controllers → services →
  repositories → Postgres`).
- **Kong**: roda em modo *DB-less* (config declarativa em `kong/kong.yml`).
  É o único ponto de entrada exposto (porta `8000`). As rotas
  `/leiloeiros` e `/licitantes` exigem um JWT válido (plugin `jwt` do Kong);
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

## Como rodar

```bash
docker compose up --build
```

Serviços:
- Gateway (Kong): `http://localhost:8000`
- Admin API do Kong (dev): `http://localhost:8001`

> `auth-service` e `usuarios-service` **não** têm porta publicada no host —
> só são acessíveis pela rede interna do Docker ou através do Kong. Isso
> garante que o Kong é o único ponto de entrada real da aplicação.

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

## Testes automatizados

```bash
cd auth-service && npm install && npm test
cd usuarios-service && npm install && npm test
```

Ambos usam Jest com repositórios mockados (testando as regras de negócio em
`services/`) e reportam cobertura (`--coverage`), ficando acima dos 50%
exigidos.

## Variáveis de ambiente

Cada serviço tem um `.env.example`. No `docker-compose.yml` os valores já
vêm definidos; para rodar um serviço fora do Docker, copie o `.env.example`
para `.env` e ajuste `DB_HOST` etc.

## Próximos passos (grupo)

- Cadastro de Leilão (Evento) e de Lances — outros microsserviços do grupo.
- Acompanhamento ao vivo dos lances (provavelmente WebSockets ou Event-Driven,
  que conta como o 2º padrão de microsserviços exigido, junto com o API
  Gateway já implementado aqui via Kong).
- Padronizar as URLs dos novos serviços por variável de ambiente, seguindo o
  mesmo modelo usado entre `auth-service` e `usuarios-service`.
