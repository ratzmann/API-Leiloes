# Roteiro de testes manuais (via curl)

## Antes de começar

- **Onde rodar:** num terminal **bash** — o **Git Bash** no Windows (vem junto
  com o Git para Windows e já traz `curl`, `date`, `grep` e `sed`) ou o
  terminal do Linux. No macOS o `date -d` não existe: instale o `coreutils`
  (`brew install coreutils`) e troque `date` por `gdate`.
- **Não rode no PowerShell nem no Prompt de Comando:** a sintaxe é de bash
  (`$TOKEN`, `$(...)`, `\` no fim da linha) e, no Windows PowerShell 5, `curl`
  é um apelido do `Invoke-WebRequest`. **No Windows com PowerShell, use as demos
  do [`docs/APRESENTACAO.md`](../docs/APRESENTACAO.md) ou o
  [`testar-tudo.ps1`](testar-tudo.ps1)** (que roda tudo sozinho).
- **Não precisa de Node nem de `jq`:** os campos das respostas (token, ids) são
  extraídos com `grep` e `sed` (função `campo`, no passo 0).
- **Acentos:** no Git Bash, o `curl` (versão para Windows) estraga os acentos
  escritos direto no comando (`-d "..."`): o `ã` chega ao servidor como `�`.
  Por isso os dados dos exemplos não têm acento. Para enviar texto acentuado,
  passe o corpo pela entrada padrão: `echo '{"titulo":"Leilão"}' | curl ... -d @-`.
- **Sistema no ar:** `docker compose up --build`. Tudo passa pelo Kong, na
  porta 8000.
- **Na ordem e no mesmo terminal:** cada passo guarda resultados em variáveis
  (`$TOKEN`, `$LEILAO`...) que os próximos usam. Se fechar o terminal, recomece
  do passo 0.
- **Pode repetir quantas vezes quiser:** e-mails, CPFs e registros
  profissionais mudam a cada execução, então não dá `409` de duplicidade.

## 0. Preparar o terminal
```bash
# sufixo unico (segundos desde 1970): deixa e-mails e registros diferentes a cada execucao
SUFIXO=$(date +%s)

# extrai um campo da resposta JSON, sem jq nem Node:
#   echo "$RESPOSTA" | campo token      -> eyJhbGciOi...
#   echo "$RESPOSTA" | campo perfil_id  -> 7
# (o grep acha o trecho "campo":valor, o head fica com o primeiro e o sed tira o nome e as aspas)
campo() { grep -oE "\"$1\":\"?[^\",}]*" | head -n 1 | sed -E "s/^\"$1\":\"?//"; }

# gera um CPF valido (com os 2 digitos verificadores) e diferente a cada chamada
gerar_cpf() {
  local d=() i soma
  for i in 0 1 2 3 4 5 6 7 8; do d[i]=$((RANDOM % 10)); done
  soma=0; for i in 0 1 2 3 4 5 6 7 8; do soma=$((soma + d[i] * (10 - i))); done
  d[9]=$((soma * 10 % 11 % 10))
  soma=0; for i in 0 1 2 3 4 5 6 7 8 9; do soma=$((soma + d[i] * (11 - i))); done
  d[10]=$((soma * 10 % 11 % 10))
  printf '%s' "${d[@]}"
}
```

## 1. Healthchecks (confirma que Kong está roteando)
```bash
curl http://localhost:8000/auth/health
curl http://localhost:8000/leiloeiros   # deve dar 401 (sem token) -> prova que o Kong está protegendo
```

## 2. Registrar um licitante
```bash
RESPOSTA=$(curl -s -X POST http://localhost:8000/auth/registrar \
  -H "Content-Type: application/json" \
  -d "{
    \"nome\": \"Maria Souza\",
    \"email\": \"maria_$SUFIXO@example.com\",
    \"senha\": \"senha123\",
    \"papel\": \"LICITANTE\",
    \"dadosPerfil\": { \"cpf\": \"$(gerar_cpf)\", \"limiteCredito\": 5000 }
  }")
echo "$RESPOSTA"
```
A resposta traz `usuario`, `perfil` e `token` — o JWT que você vai usar nos
próximos passos. Guarde-o numa variável:
```bash
TOKEN=$(echo "$RESPOSTA" | campo token)
echo "$TOKEN"
```
(se a variável ficar vazia, o registro falhou: veja o `echo "$RESPOSTA"` acima)

## 3. Testar rota protegida SEM token (deve dar 401)
```bash
curl -i http://localhost:8000/licitantes
```

## 4. Testar rota protegida COM token (deve dar 200 e listar)
```bash
curl http://localhost:8000/licitantes \
  -H "Authorization: Bearer $TOKEN"
```
Maria aparece com todos os dados; os outros licitantes, só com `id` e `nome` (LGPD).

## 5. Login (pra confirmar que autentica de novo com a senha certa)
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d "{ \"email\": \"maria_$SUFIXO@example.com\", \"senha\": \"senha123\" }"
```

## 6. Login com senha errada (deve dar 401)
```bash
curl -i -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d "{ \"email\": \"maria_$SUFIXO@example.com\", \"senha\": \"errada\" }"
```

## 7. Cadastro duplicado (deve dar 409 - e-mail já existe)
```bash
curl -i -X POST http://localhost:8000/auth/registrar \
  -H "Content-Type: application/json" \
  -d "{
    \"nome\": \"Maria Souza\",
    \"email\": \"maria_$SUFIXO@example.com\",
    \"senha\": \"outrasenha\",
    \"papel\": \"LICITANTE\",
    \"dadosPerfil\": { \"cpf\": \"$(gerar_cpf)\" }
  }"
```

## 8. Registrar um leiloeiro e testar as regras dele
```bash
# registro profissional no formato ORGAO-NUMERO; ${SUFIXO: -6} = os 6 ultimos digitos do sufixo
RESPOSTA=$(curl -s -X POST http://localhost:8000/auth/registrar \
  -H "Content-Type: application/json" \
  -d "{
    \"nome\": \"Carlos Pereira\",
    \"email\": \"carlos_$SUFIXO@example.com\",
    \"senha\": \"senha123\",
    \"papel\": \"LEILOEIRO\",
    \"dadosPerfil\": { \"registroProfissional\": \"JUCESC-${SUFIXO: -6}\", \"telefone\": \"47999998888\" }
  }")
echo "$RESPOSTA"

# token e id do perfil do leiloeiro: usados nos passos 9 a 13
TOKEN_LEILOEIRO=$(echo "$RESPOSTA" | campo token)
LEILOEIRO_ID=$(echo "$RESPOSTA" | campo perfil_id)
echo "leiloeiro $LEILOEIRO_ID"
```

CPF inválido de propósito (deve dar 400 — e o usuário **não** fica criado:
o registro é desfeito, então o mesmo e-mail pode ser usado de novo; por isso
este passo dá 400 em toda execução, e não 409):
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
# sem token: deve dar 401 (Kong barra antes de chegar no serviço)
curl -i http://localhost:8000/leiloes

# datas dinâmicas (amanhã, das 14h às 17h, horário UTC) para o leilão ficar sempre no futuro
INICIO=$(date -u -d "+1 day 14:00" +%Y-%m-%dT%H:%M:%SZ)
FIM=$(date -u -d "+1 day 17:00" +%Y-%m-%dT%H:%M:%SZ)

RESPOSTA=$(curl -s -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" \
  -H "Content-Type: application/json" \
  -d "{
    \"titulo\": \"Leilao de Nelore - Lote 12\",
    \"descricao\": \"Bois nelore terminados a pasto, media de 18 arrobas.\",
    \"localEvento\": \"Parque de Exposicoes de Lages\",
    \"raca\": \"Nelore\",
    \"quantidadeBois\": 40,
    \"lanceInicial\": 5000,
    \"incrementoMinimo\": 100,
    \"dataInicio\": \"$INICIO\",
    \"dataFim\": \"$FIM\"
  }")
echo "$RESPOSTA"

# id do leilão criado: usado no passo 11
LEILAO_AGENDADO=$(echo "$RESPOSTA" | campo id)
echo "leilão $LEILAO_AGENDADO"
```
A resposta traz o leilão criado, com `status: "AGENDADO"` (HTTP `201`).

## 10. Testar as regras de negócio do leilão (todos devem falhar)

```bash
# leilão em nome de OUTRO leiloeiro -> 403 (Regra 7: só em nome próprio)
curl -i -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d "{ \"leiloeiroId\": 9999, \"titulo\": \"Leilao sem dono\", \"quantidadeBois\": 10,
        \"lanceInicial\": 1000, \"incrementoMinimo\": 50,
        \"dataInicio\": \"$INICIO\", \"dataFim\": \"$FIM\" }"

# data no passado -> 400
curl -i -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d '{ "titulo": "Leilao no passado", "quantidadeBois": 10,
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
  -d "{ \"titulo\": \"Leilao concorrente\", \"quantidadeBois\": 20,
        \"lanceInicial\": 2000, \"incrementoMinimo\": 50,
        \"dataInicio\": \"$INICIO\", \"dataFim\": \"$FIM\" }"
```

## 11. Ciclo de vida do leilão

```bash
# listar (aceita ?status=ABERTO e ?leiloeiroId=...)
curl "http://localhost:8000/leiloes?leiloeiroId=$LEILOEIRO_ID" -H "Authorization: Bearer $TOKEN_LEILOEIRO"

# editar enquanto está AGENDADO -> 200
curl -X PUT http://localhost:8000/leiloes/$LEILAO_AGENDADO \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d '{ "quantidadeBois": 45 }'

# encerrar sem ter aberto -> 409 (transição inválida)
curl -i -X PATCH http://localhost:8000/leiloes/$LEILAO_AGENDADO/encerrar \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO"

# abrir o pregão -> 200, status ABERTO
curl -X PATCH http://localhost:8000/leiloes/$LEILAO_AGENDADO/abrir \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO"

# editar depois de aberto -> 409
curl -i -X PUT http://localhost:8000/leiloes/$LEILAO_AGENDADO \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d '{ "titulo": "Nao deveria passar" }'

# o que o serviço de lances vai consultar antes de aceitar um lance
# ("aceitandoLances": false, porque o período só começa amanhã)
curl http://localhost:8000/leiloes/$LEILAO_AGENDADO/disponibilidade \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO"

# encerrar -> 200; cancelar depois de encerrado -> 409
curl -X PATCH http://localhost:8000/leiloes/$LEILAO_AGENDADO/encerrar -H "Authorization: Bearer $TOKEN_LEILOEIRO"
curl -i -X PATCH http://localhost:8000/leiloes/$LEILAO_AGENDADO/cancelar -H "Authorization: Bearer $TOKEN_LEILOEIRO"
```

## 12. Ver e atualizar um cadastro

Só o **próprio** leiloeiro altera ou apaga o seu cadastro: o id do perfil dele
(`LEILOEIRO_ID`, do passo 8) com o token dele. Com o token de outra pessoa a
resposta é `403`. Criar perfis direto (`POST /leiloeiros`) é bloqueado pelo
Kong (`403`) — o caminho é `POST /auth/registrar`. (O `DELETE` fica para o
passo 13.10: os passos seguintes ainda usam este leiloeiro.)
```bash
curl http://localhost:8000/leiloeiros/$LEILOEIRO_ID -H "Authorization: Bearer $TOKEN_LEILOEIRO"

curl -X PUT http://localhost:8000/leiloeiros/$LEILOEIRO_ID \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" \
  -H "Content-Type: application/json" \
  -d '{ "telefone": "47988887777" }'

# Maria (licitante) tentando alterar o cadastro do leiloeiro -> 403
curl -i -X PUT http://localhost:8000/leiloeiros/$LEILOEIRO_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "telefone": "00000000000" }'

# criar perfil direto, sem passar pelo /auth/registrar -> 403 (bloqueado no Kong)
curl -i -X POST http://localhost:8000/leiloeiros \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" \
  -H "Content-Type: application/json" \
  -d '{ "nome": "Atalho" }'
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
# licitante A (limite R$ 5000)
RESPOSTA=$(curl -s -X POST http://localhost:8000/auth/registrar -H "Content-Type: application/json" \
  -d "{\"nome\":\"Licitante A\",\"email\":\"a_saga_$SUFIXO@example.com\",\"senha\":\"senha123\",\"papel\":\"LICITANTE\",
       \"dadosPerfil\":{\"cpf\":\"$(gerar_cpf)\",\"limiteCredito\":5000}}")
LICITANTE_A=$(echo "$RESPOSTA" | campo perfil_id)
TOKEN_A=$(echo "$RESPOSTA" | campo token)   # cada licitante dá lances com o próprio token

# licitante B (limite R$ 3000)
RESPOSTA=$(curl -s -X POST http://localhost:8000/auth/registrar -H "Content-Type: application/json" \
  -d "{\"nome\":\"Licitante B\",\"email\":\"b_saga_$SUFIXO@example.com\",\"senha\":\"senha123\",\"papel\":\"LICITANTE\",
       \"dadosPerfil\":{\"cpf\":\"$(gerar_cpf)\",\"limiteCredito\":3000}}")
LICITANTE_B=$(echo "$RESPOSTA" | campo perfil_id)
TOKEN_B=$(echo "$RESPOSTA" | campo token)
echo "licitantes $LICITANTE_A e $LICITANTE_B"

# leilão que começa em 20 segundos (a data de início precisa estar no futuro)
INICIO=$(date -u -d "+20 seconds" +%Y-%m-%dT%H:%M:%SZ)
FIM=$(date -u -d "+2 hours" +%Y-%m-%dT%H:%M:%SZ)
RESPOSTA=$(curl -s -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO" -H "Content-Type: application/json" \
  -d "{\"titulo\":\"Leilao ao vivo\",\"quantidadeBois\":10,
       \"lanceInicial\":1000,\"incrementoMinimo\":100,\"dataInicio\":\"$INICIO\",\"dataFim\":\"$FIM\"}")
LEILAO=$(echo "$RESPOSTA" | campo id)
echo "leilão $LEILAO"

curl -s -X PATCH http://localhost:8000/leiloes/$LEILAO/abrir -H "Authorization: Bearer $TOKEN_LEILOEIRO"
sleep 22   # espera o período do leilão começar
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
RESPOSTA=$(curl -s -X POST http://localhost:8000/lances -H "Authorization: Bearer $TOKEN_A" \
  -H "X-Simular-Falha: gravar-lance" \
  -H "Content-Type: application/json" -d "{\"leilaoId\":$LEILAO,\"valor\":2000}")
echo "$RESPOSTA"
# 500 com "sagaId"
SAGA=$(echo "$RESPOSTA" | campo sagaId)

curl -s http://localhost:8000/lances/sagas/$SAGA -H "Authorization: Bearer $TOKEN_LEILOEIRO"
# status COMPENSADA; passos: reservar-credito OK, gravar-lance FALHOU, reservar-credito COMPENSADO
curl -s http://localhost:8000/licitantes/$LICITANTE_A/credito -H "Authorization: Bearer $TOKEN_LEILOEIRO"
# reservado: 0
```

### 13.6 Pendência e reprocessamento do passo repetível
```bash
RESPOSTA=$(curl -s -X POST http://localhost:8000/lances -H "Authorization: Bearer $TOKEN_A" \
  -H "X-Simular-Falha: liberar-credito-superado" \
  -H "Content-Type: application/json" -d "{\"leilaoId\":$LEILAO,\"valor\":2000}")
echo "$RESPOSTA"
# 201 com "sagaStatus": "CONCLUIDA_COM_PENDENCIA" — o lance vale, mas o crédito de B ficou preso
SAGA=$(echo "$RESPOSTA" | campo sagaId)
curl -s http://localhost:8000/licitantes/$LICITANTE_B/credito -H "Authorization: Bearer $TOKEN_LEILOEIRO"
# reservado: 1500 (o lance de B já foi superado, mas o crédito dele ainda está preso)

curl -s -X POST http://localhost:8000/lances/sagas/$SAGA/reprocessar -H "Authorization: Bearer $TOKEN_LEILOEIRO"
# status CONCLUIDA
curl -s http://localhost:8000/licitantes/$LICITANTE_B/credito -H "Authorization: Bearer $TOKEN_LEILOEIRO"
# reservado: 0
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
  -d "{\"titulo\":\"Leilao do licitante\",\"quantidadeBois\":10,\"lanceInicial\":1000,
       \"incrementoMinimo\":100,\"dataInicio\":\"$INICIO\",\"dataFim\":\"$FIM\"}"

# outro leiloeiro tentando cancelar o leilão (registra um segundo leiloeiro e usa o token dele)
RESPOSTA=$(curl -s -X POST http://localhost:8000/auth/registrar -H "Content-Type: application/json" \
  -d "{\"nome\":\"Outro Leiloeiro\",\"email\":\"outro_$SUFIXO@example.com\",\"senha\":\"senha123\",\"papel\":\"LEILOEIRO\",
       \"dadosPerfil\":{\"registroProfissional\":\"JUCEPR-${SUFIXO: -6}\"}}")
TOKEN_OUTRO_LEILOEIRO=$(echo "$RESPOSTA" | campo token)
curl -i -X PATCH http://localhost:8000/leiloes/$LEILAO/cancelar -H "Authorization: Bearer $TOKEN_OUTRO_LEILOEIRO"
```

### 13.9 Cancelar o leilão devolve o crédito reservado (Regra 8)
```bash
# A tem 2000 reservados (é o maior lance)
curl -s http://localhost:8000/licitantes/$LICITANTE_A/credito -H "Authorization: Bearer $TOKEN_LEILOEIRO"

# o dono cancela o leilão -> 200, status CANCELADO
curl -s -X PATCH http://localhost:8000/leiloes/$LEILAO/cancelar -H "Authorization: Bearer $TOKEN_LEILOEIRO"

curl -s http://localhost:8000/licitantes/$LICITANTE_A/credito -H "Authorization: Bearer $TOKEN_LEILOEIRO"
# reservado: 0 (o cancelamento liberou as reservas do leilão)
```

### 13.10 Apagar o próprio cadastro (por último)
```bash
# o leiloeiro apaga o próprio cadastro -> 204; consultar de novo -> 404
curl -i -X DELETE http://localhost:8000/leiloeiros/$LEILOEIRO_ID \
  -H "Authorization: Bearer $TOKEN_LEILOEIRO"
curl -i http://localhost:8000/leiloeiros/$LEILOEIRO_ID -H "Authorization: Bearer $TOKEN_LEILOEIRO"
```

## 14. Ver logs se algo der errado
```bash
# o -f fica acompanhando o log; Ctrl+C para sair
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
