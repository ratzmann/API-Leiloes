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

## 9. Cadastrar um leilão (leiloes-service)

Use o token do leiloeiro do passo 8 — a rota `/leiloes` também é protegida
pelo Kong.

```bash
TOKEN_LEILOEIRO=... # token do passo 8

# sem token: deve dar 401 (Kong barra antes de chegar no serviço)
curl -i http://localhost:8000/leiloes

# datas dinâmicas (amanhã, das 14h às 17h) para o leilão ficar sempre no futuro
INICIO=$(date -u -d "+1 day 14:00" +%Y-%m-%dT%H:%M:%SZ)
FIM=$(date -u -d "+1 day 17:00" +%Y-%m-%dT%H:%M:%SZ)

curl -s -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" \
  -H "Content-Type: application/json" \
  -d "{
    \"leiloeiroId\": 1,
    \"titulo\": \"Leilão de Nelore - Lote 12\",
    \"descricao\": \"Bois nelore terminados a pasto, média de 18 arrobas.\",
    \"localEvento\": \"Parque de Exposições de Lages\",
    \"raca\": \"Nelore\",
    \"quantidadeBois\": 40,
    \"lanceInicial\": 5000,
    \"incrementoMinimo\": 100,
    \"dataInicio\": \"$INICIO\",
    \"dataFim\": \"$FIM\"
  }"
```
Deve dar `201` com o leilão criado e `status: "AGENDADO"`.

## 10. Testar as regras de negócio do leilão (todos devem falhar)

```bash
# leiloeiro que não existe -> 404 (o leiloes-service consultou o usuarios-service)
curl -i -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d "{ \"leiloeiroId\": 9999, \"titulo\": \"Leilão sem dono\", \"quantidadeBois\": 10,
        \"lanceInicial\": 1000, \"incrementoMinimo\": 50,
        \"dataInicio\": \"$INICIO\", \"dataFim\": \"$FIM\" }"

# data no passado -> 400
curl -i -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d '{ "leiloeiroId": 1, "titulo": "Leilão no passado", "quantidadeBois": 10,
        "lanceInicial": 1000, "incrementoMinimo": 50,
        "dataInicio": "2020-01-01T10:00:00Z", "dataFim": "2020-01-01T14:00:00Z" }'

# incremento maior que o lance inicial -> 400
curl -i -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d "{ \"leiloeiroId\": 1, \"titulo\": \"Incremento absurdo\", \"quantidadeBois\": 10,
        \"lanceInicial\": 100, \"incrementoMinimo\": 500,
        \"dataInicio\": \"$INICIO\", \"dataFim\": \"$FIM\" }"

# mesmo leiloeiro, mesmo horário -> 409 (conflito de agenda)
curl -i -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d "{ \"leiloeiroId\": 1, \"titulo\": \"Leilão concorrente\", \"quantidadeBois\": 20,
        \"lanceInicial\": 2000, \"incrementoMinimo\": 50,
        \"dataInicio\": \"$INICIO\", \"dataFim\": \"$FIM\" }"
```

## 11. Ciclo de vida do leilão

```bash
# listar (aceita ?status=ABERTO e ?leiloeiroId=1)
curl http://localhost:8000/leiloes -H "Authorization: Bearer $TOKEN_LEILOEIRO"

# editar enquanto está AGENDADO -> 200
curl -X PUT http://localhost:8000/leiloes/1 \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d '{ "quantidadeBois": 45 }'

# encerrar sem ter aberto -> 409 (transição inválida)
curl -i -X PATCH http://localhost:8000/leiloes/1/encerrar \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO"

# abrir o pregão -> 200, status ABERTO
curl -X PATCH http://localhost:8000/leiloes/1/abrir \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO"

# editar depois de aberto -> 409
curl -i -X PUT http://localhost:8000/leiloes/1 \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d '{ "titulo": "Não deveria passar" }'

# o que o serviço de lances vai consultar antes de aceitar um lance
curl http://localhost:8000/leiloes/1/disponibilidade \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO"

# encerrar -> 200; cancelar depois de encerrado -> 409
curl -X PATCH http://localhost:8000/leiloes/1/encerrar -H "Authorization: Bearer $TOKEN_LEILOEIRO"
curl -i -X PATCH http://localhost:8000/leiloes/1/cancelar -H "Authorization: Bearer $TOKEN_LEILOEIRO"
```

## 12. Ver, atualizar e apagar um registro
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

## 13. Testar o microsserviço de lances (lances-service)

### 13.1 Testar rota protegida sem token (deve dar 401)
```bash
curl -i http://localhost:8000/lances
```

### 13.2 Submeter o primeiro lance válido de um leilão
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

### 13.3 Tentar cobrir o próprio lance consecutivo (deve dar 400)
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

### 13.4 Submeter novo lance com outro licitante e valor menor ou igual (deve dar 400)
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

### 13.5 Submeter novo lance superior com outro licitante (deve dar 201)
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

### 13.6 Consultar maior lance atual do leilão
```bash
curl http://localhost:8000/lances/leilao/1/maior \
  -H "Authorization: Bearer $TOKEN"
```

### 13.7 Consultar histórico completo de lances do leilão
```bash
curl http://localhost:8000/lances/leilao/1 \
  -H "Authorization: Bearer $TOKEN"
```

## 14. Ver logs se algo der errado
```bash
docker compose logs -f auth-service
docker compose logs -f usuarios-service
docker compose logs -f leiloes-service
docker compose logs -f lances-service
docker compose logs -f kong
```

## 15. Inspecionar a config do Kong direto (Admin API, porta 8001)
```bash
curl http://localhost:8001/services
curl http://localhost:8001/routes
curl http://localhost:8001/consumers/sistema-leilao/jwt
```
Útil pra debugar se o plugin JWT está mesmo aplicado nas rotas certas.

