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

CPF/registro inválido de propósito (deve dar 400 — e o usuário **não** fica criado:
o registro é desfeito, então o mesmo e-mail pode ser usado de novo):
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
pelo Kong. O leilão é criado **em nome do leiloeiro dono do token**: o campo
`leiloeiroId` pode ser omitido (se enviado, precisa ser o próprio).

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
# leilão em nome de OUTRO leiloeiro -> 403 (Regra 7: só em nome próprio)
curl -i -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d "{ \"leiloeiroId\": 9999, \"titulo\": \"Leilão sem dono\", \"quantidadeBois\": 10,
        \"lanceInicial\": 1000, \"incrementoMinimo\": 50,
        \"dataInicio\": \"$INICIO\", \"dataFim\": \"$FIM\" }"

# data no passado -> 400
curl -i -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d '{ "titulo": "Leilão no passado", "quantidadeBois": 10,
        "lanceInicial": 1000, "incrementoMinimo": 50,
        "dataInicio": "2020-01-01T10:00:00Z", "dataFim": "2020-01-01T14:00:00Z" }'

# incremento maior que o lance inicial -> 400
curl -i -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d "{ \"titulo\": \"Incremento absurdo\", \"quantidadeBois\": 10,
        \"lanceInicial\": 100, \"incrementoMinimo\": 500,
        \"dataInicio\": \"$INICIO\", \"dataFim\": \"$FIM\" }"

# mesmo leiloeiro, mesmo horário -> 409 (conflito de agenda)
curl -i -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d "{ \"titulo\": \"Leilão concorrente\", \"quantidadeBois\": 20,
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

Só o **próprio** leiloeiro altera ou apaga o seu cadastro: use o id do perfil
dele (`perfil.id` da resposta do registro do passo 8) com o token dele. Com o id
de outra pessoa a resposta é `403`. Criar perfis direto (`POST /leiloeiros`) é
bloqueado pelo Kong (`403`) — o caminho é `POST /auth/registrar`.
```bash
TOKEN_LEILOEIRO=... # token do passo 8
LEILOEIRO_ID=...    # perfil.id do passo 8

curl http://localhost:8000/leiloeiros/$LEILOEIRO_ID -H "Authorization: Bearer $TOKEN_LEILOEIRO"

curl -X PUT http://localhost:8000/leiloeiros/$LEILOEIRO_ID \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" \
  -H "Content-Type: application/json" \
  -d '{ "telefone": "47988887777" }'

# (rode o DELETE so no fim: os passos seguintes usam este leiloeiro)
curl -i -X DELETE http://localhost:8000/leiloeiros/$LEILOEIRO_ID \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO"
```

## 13. Testar o microsserviço de lances e a Saga (lances-service)

Registrar um lance dispara a **Saga orquestrada**: o `lances-service` consulta
o leilão no `leiloes-service`, reserva o crédito do licitante no
`usuarios-service`, grava o lance e libera o crédito de quem foi superado.
Por isso o lance precisa de um **leilão real, aberto e dentro do período**, e
de **licitantes reais com limite de crédito**.

> Para rodar tudo isso automaticamente: `powershell -ExecutionPolicy Bypass -File .\testes\testar-tudo.ps1` (passos 30 a 66).

**Autorização:** o lance é sempre dado em nome de quem está logado. Por isso
cada licitante usa o **próprio token** (`TOKEN_A`, `TOKEN_B`) e o
`licitanteId` não precisa ir no corpo. Um leiloeiro dando lance, ou um
licitante tentando agir por outro, recebe `403`.

### 13.1 Testar rota protegida sem token (deve dar 401)
```bash
curl -i http://localhost:8000/lances
```

### 13.2 Preparar: dois licitantes e um leilão que já começou
```bash
# CPFs precisam ser válidos e ainda não cadastrados — troque se der 409 no perfil
A=$(curl -s -X POST http://localhost:8000/auth/registrar -H "Content-Type: application/json" \
  -d '{"nome":"Licitante A","email":"a_saga@example.com","senha":"senha123","papel":"LICITANTE",
       "dadosPerfil":{"cpf":"11144477735","limiteCredito":5000}}')
B=$(curl -s -X POST http://localhost:8000/auth/registrar -H "Content-Type: application/json" \
  -d '{"nome":"Licitante B","email":"b_saga@example.com","senha":"senha123","papel":"LICITANTE",
       "dadosPerfil":{"cpf":"39053344705","limiteCredito":3000}}')
LICITANTE_A=$(echo "$A" | node -pe "JSON.parse(require('fs').readFileSync(0)).perfil.id")
LICITANTE_B=$(echo "$B" | node -pe "JSON.parse(require('fs').readFileSync(0)).perfil.id")
# cada licitante da lances com o proprio token (ele leva o perfilId)
TOKEN_A=$(echo "$A" | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
TOKEN_B=$(echo "$B" | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

# leilão que começa em 20 segundos (a data de início precisa estar no futuro)
INICIO=$(date -u -d "+20 seconds" +%Y-%m-%dT%H:%M:%SZ)
FIM=$(date -u -d "+2 hours" +%Y-%m-%dT%H:%M:%SZ)
LEILAO=$(curl -s -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d "{\"titulo\":\"Leilão ao vivo\",\"quantidadeBois\":10,
       \"lanceInicial\":1000,\"incrementoMinimo\":100,\"dataInicio\":\"$INICIO\",\"dataFim\":\"$FIM\"}" \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).id")
curl -s -X PATCH http://localhost:8000/leiloes/$LEILAO/abrir -H "Authorization: Bearer $TOKEN_LEILOEIRO"
sleep 22
curl -s http://localhost:8000/leiloes/$LEILAO/disponibilidade -H "Authorization: Bearer $TOKEN_LEILOEIRO"
# deve mostrar "aceitandoLances": true
```

### 13.3 Recusas antes de mexer no crédito
```bash
# leilão inexistente -> 404 (Saga passo 1)
curl -i -X POST http://localhost:8000/lances -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" -d "{\"leilaoId\":99999999,\"valor\":1000}"

# abaixo do lance inicial -> 400
curl -i -X POST http://localhost:8000/lances -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" -d "{\"leilaoId\":$LEILAO,\"valor\":900}"

# crédito insuficiente (B tem R$ 3000) -> 409 (Saga passo 2)
curl -i -X POST http://localhost:8000/lances -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" -d "{\"leilaoId\":$LEILAO,\"valor\":3500}"
```

### 13.4 Caminho feliz: A dá o lance, B supera, o crédito de A é liberado
```bash
curl -s -X POST http://localhost:8000/lances -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" -d "{\"leilaoId\":$LEILAO,\"valor\":1000}"
curl -s http://localhost:8000/licitantes/$LICITANTE_A/credito -H "Authorization: Bearer $TOKEN_LEILOEIRO"
# reservado: 1000

curl -s -X POST http://localhost:8000/lances -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" -d "{\"leilaoId\":$LEILAO,\"valor\":1500}"
curl -s http://localhost:8000/licitantes/$LICITANTE_A/credito -H "Authorization: Bearer $TOKEN_LEILOEIRO"
# reservado: 0  (passo 4 liberou o crédito de quem foi superado)
```

### 13.5 Compensação: falha ao gravar o lance devolve o crédito
```bash
curl -s -X POST http://localhost:8000/lances -H "Authorization: Bearer $TOKEN_A" \
  -H "X-Simular-Falha: gravar-lance" \
  -H "Content-Type: application/json" -d "{\"leilaoId\":$LEILAO,\"valor\":2000}"
# 500 com "sagaId"

curl -s http://localhost:8000/lances/sagas/<SAGA_ID> -H "Authorization: Bearer $TOKEN_LEILOEIRO"
# status COMPENSADA; passos: reservar-credito OK, gravar-lance FALHOU, reservar-credito COMPENSADO
curl -s http://localhost:8000/licitantes/$LICITANTE_A/credito -H "Authorization: Bearer $TOKEN_LEILOEIRO"
# reservado: 0
```

### 13.6 Pendência e reprocessamento do passo repetível
```bash
curl -s -X POST http://localhost:8000/lances -H "Authorization: Bearer $TOKEN_A" \
  -H "X-Simular-Falha: liberar-credito-superado" \
  -H "Content-Type: application/json" -d "{\"leilaoId\":$LEILAO,\"valor\":2000}"
# 201 com "sagaStatus": "CONCLUIDA_COM_PENDENCIA" — o lance vale, mas o crédito de B ficou preso

curl -s -X POST http://localhost:8000/lances/sagas/<SAGA_ID>/reprocessar -H "Authorization: Bearer $TOKEN_LEILOEIRO"
# status CONCLUIDA; o crédito de B volta a 0 reservado
```

### 13.7 Consultar maior lance, histórico e bloqueio das reservas no Kong
```bash
curl -s http://localhost:8000/lances/leilao/$LEILAO/maior -H "Authorization: Bearer $TOKEN_LEILOEIRO"
curl -s http://localhost:8000/lances/leilao/$LEILAO -H "Authorization: Bearer $TOKEN_LEILOEIRO"

# reserva de crédito é interna: pelo gateway -> 403
curl -i -X POST http://localhost:8000/licitantes/$LICITANTE_A/reservas \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" -d '{"valor":10}'
```

### 13.8 Autorização: ninguém age em nome de outra pessoa (todos -> 403)
```bash
# leiloeiro tentando dar lance
curl -i -X POST http://localhost:8000/lances -H "Authorization: Bearer $TOKEN_LEILOEIRO" \
  -H "Content-Type: application/json" -d "{\"leilaoId\":$LEILAO,\"valor\":5000}"

# licitante A tentando dar lance em nome de B (e gastar o crédito dele)
curl -i -X POST http://localhost:8000/lances -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" -d "{\"leilaoId\":$LEILAO,\"licitanteId\":$LICITANTE_B,\"valor\":5000}"

# licitante tentando cadastrar leilão
curl -i -X POST http://localhost:8000/leiloes -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"titulo\":\"Leilão do licitante\",\"quantidadeBois\":10,\"lanceInicial\":1000,
       \"incrementoMinimo\":100,\"dataInicio\":\"$INICIO\",\"dataFim\":\"$FIM\"}"

# outro leiloeiro tentando cancelar o leilão (registre um segundo leiloeiro e use o token dele)
curl -i -X PATCH http://localhost:8000/leiloes/$LEILAO/cancelar -H "Authorization: Bearer $TOKEN_OUTRO_LEILOEIRO"
```

## 14. Ver logs se algo der errado
```bash
docker compose logs -f auth-service
docker compose logs -f usuarios-service
docker compose logs -f leiloes-service
docker compose logs -f lances-service
docker compose logs -f kong
```

## 15. Inspecionar a config do Kong direto (Admin API, porta 8001 — só na própria máquina)
```bash
curl http://localhost:8001/services
curl http://localhost:8001/routes
curl http://localhost:8001/consumers/sistema-leilao/jwt
```
Útil pra debugar se o plugin JWT está mesmo aplicado nas rotas certas.

