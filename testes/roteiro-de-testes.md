# Roteiro de testes manuais (via curl)

Pré-requisito: `docker compose up --build` rodando. Tudo passa pela porta
8000 (Kong). Rode os comandos na ordem — cada passo usa o resultado do
anterior.

## 1. Healthchecks (confirma que Kong está roteando)
```bash
curl http://localhost:8000/auth/health
curl http://localhost:8000/leiloeiros   # deve dar 401 (sem token) -> prova que o Kong está protegendo
```

## 2. Registrar um licitante
```bash
curl -s -X POST http://localhost:8000/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Maria Souza",
    "email": "maria@example.com",
    "senha": "senha123",
    "papel": "LICITANTE",
    "dadosPerfil": { "cpf": "52998224725", "limiteCredito": 5000 }
  }' | tee resposta_registro.json
```
Guarde o campo `token` da resposta — é o JWT que você vai usar nos
próximos passos. Se quiser automatizar, extraia com `jq`:
```bash
TOKEN=$(cat resposta_registro.json | jq -r .token)
echo $TOKEN
```
(se não tiver `jq`, é só copiar o valor manualmente)

## 3. Testar rota protegida SEM token (deve dar 401)
```bash
curl -i http://localhost:8000/licitantes
```

## 4. Testar rota protegida COM token (deve dar 200 e listar)
```bash
curl http://localhost:8000/licitantes \
  -H "Authorization: Bearer $TOKEN"
```

## 5. Login (pra confirmar que autentica de novo com a senha certa)
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "maria@example.com", "senha": "senha123" }'
```

## 6. Login com senha errada (deve dar 401)
```bash
curl -i -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "maria@example.com", "senha": "errada" }'
```

## 7. Cadastro duplicado (deve dar 409 - e-mail já existe)
```bash
curl -i -X POST http://localhost:8000/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Maria Souza",
    "email": "maria@example.com",
    "senha": "outrasenha",
    "papel": "LICITANTE",
    "dadosPerfil": { "cpf": "11144477735" }
  }'
```

## 8. Registrar um leiloeiro e testar as regras dele
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

CPF/registro inválido de propósito (deve dar 400):
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

## 9. Ver, atualizar e apagar um registro
```bash
TOKEN_LEILOEIRO=... # token do passo 8

curl http://localhost:8000/leiloeiros/1 -H "Authorization: Bearer $TOKEN_LEILOEIRO"

curl -X PUT http://localhost:8000/leiloeiros/1 \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" \
  -H "Content-Type: application/json" \
  -d '{ "telefone": "47988887777" }'

curl -i -X DELETE http://localhost:8000/leiloeiros/1 \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO"
```

## 10. Testar o microsserviço de lances (lances-service)

### 10.1 Testar rota protegida sem token (deve dar 401)
```bash
curl -i http://localhost:8000/lances
```

### 10.2 Submeter o primeiro lance válido de um leilão
```bash
curl -X POST http://localhost:8000/lances \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "leilaoId": 1,
    "licitanteId": 1,
    "valor": 1000.00
  }'
```

### 10.3 Tentar cobrir o próprio lance consecutivo (deve dar 400)
```bash
curl -i -X POST http://localhost:8000/lances \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "leilaoId": 1,
    "licitanteId": 1,
    "valor": 1200.00
  }'
```

### 10.4 Submeter novo lance com outro licitante e valor menor ou igual (deve dar 400)
```bash
curl -i -X POST http://localhost:8000/lances \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "leilaoId": 1,
    "licitanteId": 2,
    "valor": 950.00
  }'
```

### 10.5 Submeter novo lance superior com outro licitante (deve dar 201)
```bash
curl -X POST http://localhost:8000/lances \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "leilaoId": 1,
    "licitanteId": 2,
    "valor": 1350.00
  }'
```

### 10.6 Consultar maior lance atual do leilão
```bash
curl http://localhost:8000/lances/leilao/1/maior \
  -H "Authorization: Bearer $TOKEN"
```

### 10.7 Consultar histórico completo de lances do leilão
```bash
curl http://localhost:8000/lances/leilao/1 \
  -H "Authorization: Bearer $TOKEN"
```

## 11. Ver logs se algo der errado
```bash
docker compose logs -f auth-service
docker compose logs -f usuarios-service
docker compose logs -f lances-service
docker compose logs -f kong
```

## 12. Inspecionar a config do Kong direto (Admin API, porta 8001)
```bash
curl http://localhost:8001/services
curl http://localhost:8001/routes
curl http://localhost:8001/consumers/sistema-leilao/jwt
```
Útil pra debugar se o plugin JWT está mesmo aplicado nas rotas certas.

