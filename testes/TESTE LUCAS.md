# Roteiro de Apresentação e Testes - API de Leilões

> **Antes de começar:** rode os comandos no **Git Bash** (não no PowerShell).
> O roteiro usa e-mails, CPF e ids `1` fixos, então funciona **uma vez, com os
> bancos vazios**: se já tiver ensaiado, zere com `docker compose down -v`
> antes do passo 1 (isso apaga todos os dados do sistema).

## 1. Subir aplicação

```bash
docker compose up --build
```

## 2. Health Check

```bash
curl http://localhost:8000/auth/health
```

## 3. Cadastrar usuário Licitante

```bash
curl -X POST http://localhost:8000/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Maria Silva",
    "email": "mariateste@example.com",
    "senha": "senha123",
    "papel": "LICITANTE",
    "dadosPerfil": { "cpf": "52998224725", "limiteCredito": 5000 }
  }'
```

TOKEN_LICITANTE: [Copiar token retornado aqui]

## 4. Cadastrar usuário Leiloeiro

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

TOKEN_LEILOEIRO: [Copiar token retornado aqui]

## 5. Teste de Autenticação

### 5.1. Login com senha errada (Deve retornar erro)

```bash
curl -i -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "mariateste@example.com", "senha": "errada" }'
```

### 5.2. Login correto

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "mariateste@example.com", "senha": "senha123" }'
```

### 5.3. Cadastro duplicado (Deve retornar erro)

```bash
curl -i -X POST http://localhost:8000/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Maria Souza",
    "email": "mariateste@example.com",
    "senha": "outrasenha",
    "papel": "LICITANTE",
    "dadosPerfil": { "cpf": "11144477735" }
  }'
```

## 6. Validação de Segurança (API Gateway / Kong)

### 6.1. Listar sem Token (Deve ser barrado pelo Gateway)

```bash
curl -i http://localhost:8000/licitantes
curl -i http://localhost:8000/leiloeiros
```

## 7. Consultas com Autenticação

### 7.1. Listar registros

```bash
# Listar Licitantes
curl http://localhost:8000/licitantes \
  -H "Authorization: Bearer <TOKEN_LICITANTE>"

# Listar Leiloeiros
curl http://localhost:8000/leiloeiros \
  -H "Authorization: Bearer <TOKEN_LEILOEIRO>"
```

### 7.2. Buscar por ID

```bash
# Buscar Licitante ID 1
curl http://localhost:8000/licitantes/1 \
  -H "Authorization: Bearer <TOKEN_LICITANTE>"

# Buscar Leiloeiro ID 1
curl http://localhost:8000/leiloeiros/1 \
  -H "Authorization: Bearer <TOKEN_LEILOEIRO>"
```

## 8. Atualização de Dados

```bash
# Atualizar Licitante
curl -X PUT http://localhost:8000/licitantes/1 \
  -H "Authorization: Bearer <TOKEN_LICITANTE>" \
  -H "Content-Type: application/json" \
  -d '{ "telefone": "47988887777" }'

# Atualizar Leiloeiro
curl -X PUT http://localhost:8000/leiloeiros/1 \
  -H "Authorization: Bearer <TOKEN_LEILOEIRO>" \
  -H "Content-Type: application/json" \
  -d '{ "telefone": "47911112222" }'
```

## 9. Testes de Validação / Erro

### 9.1. Cadastro com CPF inválido

```bash
curl -i -X POST http://localhost:8000/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Teste Invalido",
    "email": "invalido@example.com",
    "senha": "senha123",
    "papel": "LICITANTE",
    "dadosPerfil": { "cpf": "11111111111" }
  }'
```

### 9.2. Cadastro com Registro Profissional inválido

```bash
curl -i -X POST http://localhost:8000/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Outro Leiloeiro",
    "email": "outro@example.com",
    "senha": "senha123",
    "papel": "LEILOEIRO",
    "dadosPerfil": { "registroProfissional": "12345" }
  }'
```

## 10. Crédito do Licitante e Rota Interna de Reservas

### 10.1. Consultar crédito (Deve retornar 200)

```bash
curl http://localhost:8000/licitantes/1/credito \
  -H "Authorization: Bearer <TOKEN_LICITANTE>"
```

Resposta esperada: `limite`, `reservado` e `disponivel` (ex.: 5000, 0 e 5000).

### 10.2. Reservas são rota interna (Deve ser barrado pelo Gateway com 403)

As reservas de crédito só podem ser feitas e consultadas **entre os serviços**
(pela Saga de lances). Por isso o Kong bloqueia `/licitantes/:id/reservas`
para quem está fora, **mesmo com um token válido**.

```bash
curl -i http://localhost:8000/licitantes/1/reservas \
  -H "Authorization: Bearer <TOKEN_LICITANTE>"
```

Resposta esperada: `403 Forbidden` com
`{"erro": "Reservas de credito sao internas e so podem ser feitas pela Saga de lances."}`.

## 11. Exclusão de Registro (só depois da apresentação inteira)

> **Não rode este passo durante a apresentação.** O roteiro do Thiago usa o
> mesmo leiloeiro (Carlos, id 1). Apagar o cadastro remove o perfil, mas o
> login continua existindo: o Thiago recebe um token de um leiloeiro que não
> existe mais, e o cadastro do leilão falha (404). Deixe este passo para
> depois do Thiago e do Anderson, ou pule-o.

```bash
# Apagar Leiloeiro ID 1
curl -i -X DELETE http://localhost:8000/leiloeiros/1 \
  -H "Authorization: Bearer <TOKEN_LEILOEIRO>"
```
