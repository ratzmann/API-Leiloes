# Roteiro de apresentação: lances-service e Saga

Sistema de Leilão de Bois (microsserviços + Kong). Rodar tudo no **Git Bash**,
na ordem e **no mesmo terminal** (os passos guardam valores em variáveis).

> **Funciona sozinho ou depois do Lucas e do Thiago**, na mesma base (desde que
> o passo 11 do Lucas, que apaga o leiloeiro, não tenha sido executado). Os
> cadastros do passo 2 respondem 409 se a pessoa já existir — é esperado, o
> login logo abaixo funciona do mesmo jeito.
>
> **Pode repetir:** o roteiro termina cancelando o leilão, o que devolve todo o
> crédito reservado. Se parar no meio, rode o passo 12 (cancelar) antes de
> começar de novo.
>
> **Não precisa de Node:** os campos das respostas são extraídos com `sed`.

## 1. Preparação (fazer com antecedência)

Na pasta do projeto, subir os 9 contêineres e conferir que o Kong responde.
**Esperado:** `{"status":"ok","service":"auth-service"}`

```bash
docker compose up --build -d
```

```bash
curl -s http://localhost:8000/auth/health; echo
```

As falhas simuladas dos passos 8 e 9 (header `X-Simular-Falha`) só funcionam
porque o `docker-compose.yml` liga `SAGA_PERMITIR_FALHA_SIMULADA: "true"` no
lances-service — é um recurso só para demonstração.

## 2. Usuários e atalhos

Atalhos: `J` = cabeçalho dizendo que o corpo é JSON; `login` faz o login e
devolve a resposta; `tok` e `pid` extraem dela o token e o id do perfil.

```bash
J="Content-Type: application/json"
login() { curl -s -X POST http://localhost:8000/auth/login -H "$J" -d "{\"email\":\"$1\",\"senha\":\"senha123\"}"; }
tok() { sed -n 's/.*"token":"\([^"]*\)".*/\1/p'; }
pid() { sed -n 's/.*"perfil_id":\([0-9]*\).*/\1/p'; }
```

Cadastrar o leiloeiro e os dois licitantes: Maria com R$ 5000 de limite e João
com R$ 3000 (409 se já existirem: pode ignorar).

```bash
curl -s -X POST http://localhost:8000/auth/registrar -H "$J" \
  -d '{"nome":"Carlos Pereira","email":"carlos@example.com","senha":"senha123","papel":"LEILOEIRO","dadosPerfil":{"registroProfissional":"JUCESC-000123"}}'; echo
curl -s -X POST http://localhost:8000/auth/registrar -H "$J" \
  -d '{"nome":"Maria Silva","email":"mariateste@example.com","senha":"senha123","papel":"LICITANTE","dadosPerfil":{"cpf":"52998224725","limiteCredito":5000}}'; echo
curl -s -X POST http://localhost:8000/auth/registrar -H "$J" \
  -d '{"nome":"Joao Lima","email":"joao@example.com","senha":"senha123","papel":"LICITANTE","dadosPerfil":{"cpf":"39053344705","limiteCredito":3000}}'; echo
```

Login dos três. Cada licitante dá lances com o **próprio token** (o lance é
sempre em nome de quem está logado).

```bash
R=$(login carlos@example.com);     TL=$(echo "$R" | tok)
R=$(login mariateste@example.com); TM=$(echo "$R" | tok); MARIA=$(echo "$R" | pid)
R=$(login joao@example.com);       TJ=$(echo "$R" | tok); JOAO=$(echo "$R" | pid)
echo "pronto: Maria=$MARIA, Joao=$JOAO"
```

Mais dois atalhos: `lance <token> <valor>` dá um lance no leilão `$L` e mostra
a resposta com o código HTTP; `credito <token> <id>` mostra o crédito do
licitante (`limite`, `reservado` e `disponivel`).

```bash
lance() { curl -s -w '  -> HTTP %{http_code}\n' -X POST http://localhost:8000/lances -H "Authorization: Bearer $1" -H "$J" -d "{\"leilaoId\":$L,\"valor\":$2}"; }
credito() { curl -s http://localhost:8000/licitantes/$2/credito -H "Authorization: Bearer $1"; echo; }
```

## 3. Leilão ao vivo

Um lance precisa de um leilão **ABERTO e dentro do período**. O leiloeiro cria
um leilão que começa em 20 segundos (a data de início precisa estar no futuro)
e o abre:

```bash
INICIO=$(date -u -d "+20 seconds" +%Y-%m-%dT%H:%M:%SZ); FIM=$(date -u -d "+1 hour" +%Y-%m-%dT%H:%M:%SZ)
RESP=$(curl -s -X POST http://localhost:8000/leiloes -H "Authorization: Bearer $TL" -H "$J" \
  -d "{\"titulo\":\"Leilao ao vivo\",\"quantidadeBois\":10,\"lanceInicial\":1000,\"incrementoMinimo\":100,\"dataInicio\":\"$INICIO\",\"dataFim\":\"$FIM\"}")
L=$(echo "$RESP" | sed -n 's/^{"id":\([0-9]*\).*/\1/p'); echo "leilao $L"
curl -s -X PATCH http://localhost:8000/leiloes/$L/abrir -H "Authorization: Bearer $TL"; echo
```

Esperar o horário de início e conferir. **Esperado:** `"aceitandoLances": true`

```bash
sleep 25
curl -s http://localhost:8000/leiloes/$L/disponibilidade -H "Authorization: Bearer $TL"; echo
```

> Falar: é exatamente esta consulta que o lances-service faz no **passo 1 da
> Saga**, por HTTP, antes de aceitar qualquer lance.

## 4. Sem token: o Kong barra — 401

```bash
curl -s -w '  -> HTTP %{http_code}\n' http://localhost:8000/lances
```

## 5. Recusas no passo 1 da Saga (nada foi reservado)

**Regra 3: leilão que não existe — 404**

```bash
curl -s -w '  -> HTTP %{http_code}\n' -X POST http://localhost:8000/lances -H "Authorization: Bearer $TM" -H "$J" \
  -d '{"leilaoId":99999999,"valor":1000}'
```

**Regra 4: abaixo do lance inicial (R$ 1000) — 400**

```bash
lance "$TM" 900
```

> Falar: a Saga fica com status `FALHOU` — falhou antes de reservar crédito,
> então não há nada a desfazer. O `sagaId` volta junto com o erro.

## 6. Crédito insuficiente: passo 2 da Saga — 409

**Regra 6:** João tem R$ 3000 de limite e tenta R$ 3500. O usuarios-service
recusa a reserva e o crédito dele continua intacto (`reservado: 0`).

```bash
lance "$TJ" 3500
credito "$TJ" $JOAO
```

## 7. Caminho feliz: os 4 passos da Saga

**Maria dá o primeiro lance — 201, `"sagaStatus":"CONCLUIDA"`.** O valor fica
reservado no crédito dela (`reservado: 1000`, `disponivel: 4000`).

```bash
lance "$TM" 1000
credito "$TM" $MARIA
```

**Regra 5: Maria cobrindo o próprio lance — 400**

```bash
lance "$TM" 1200
```

**Regra 4: João abaixo do incremento mínimo — 400** (o mínimo agora é
1000 + 100 = R$ 1100)

```bash
lance "$TJ" 1050
```

**João supera com R$ 1500 — 201.** No passo 4, a Saga libera o crédito de quem
foi superado: Maria volta a `reservado: 0` e João fica com `reservado: 1500`.

```bash
R=$(lance "$TJ" 1500); echo "$R"
SAGA=$(echo "$R" | sed -n 's/.*"sagaId":\([0-9]*\).*/\1/p')
credito "$TM" $MARIA
credito "$TJ" $JOAO
```

A saga desse lance, passo a passo (`consultar-disponibilidade`,
`reservar-credito`, `gravar-lance` e `liberar-credito-superado`, todos `OK`):

```bash
curl -s http://localhost:8000/lances/sagas/$SAGA -H "Authorization: Bearer $TL"; echo
```

## 8. Compensação: falha ao gravar o lance devolve o crédito

Simulamos uma falha no **passo 3** (gravar o lance), **depois** de o crédito já
ter sido reservado no passo 2. **Esperado:** `500` com `sagaId`.

```bash
R=$(curl -s -w '  -> HTTP %{http_code}' -X POST http://localhost:8000/lances -H "Authorization: Bearer $TM" -H "$J" \
  -H "X-Simular-Falha: gravar-lance" -d "{\"leilaoId\":$L,\"valor\":2000}"); echo "$R"
SAGA=$(echo "$R" | sed -n 's/.*"sagaId":\([0-9]*\).*/\1/p')
```

A saga ficou `COMPENSADA`: reserva `OK`, gravação `FALHOU`, reserva
`COMPENSADO` (devolvida). O crédito da Maria voltou a `reservado: 0`.

```bash
curl -s http://localhost:8000/lances/sagas/$SAGA -H "Authorization: Bearer $TL"; echo
credito "$TM" $MARIA
```

> Falar: é o coração do padrão Saga — sem transação única entre bancos, cada
> passo que deu certo tem uma **ação de compensação** que o desfaz.

## 9. Pendência e reprocessamento do passo 4

Agora a falha simulada é no **passo 4** (liberar o crédito de quem foi
superado). O lance **vale** (`201`), mas a saga termina
`CONCLUIDA_COM_PENDENCIA`: o crédito do João ficou preso.

```bash
R=$(curl -s -w '  -> HTTP %{http_code}' -X POST http://localhost:8000/lances -H "Authorization: Bearer $TM" -H "$J" \
  -H "X-Simular-Falha: liberar-credito-superado" -d "{\"leilaoId\":$L,\"valor\":2000}"); echo "$R"
SAGA=$(echo "$R" | sed -n 's/.*"sagaId":\([0-9]*\).*/\1/p')
credito "$TJ" $JOAO
```

O passo 4 é **repetível** (não desfaz o lance): basta reprocessar a saga. Ela
vira `CONCLUIDA` e o João volta a `reservado: 0`.

```bash
curl -s -X POST http://localhost:8000/lances/sagas/$SAGA/reprocessar -H "Authorization: Bearer $TL"; echo
credito "$TJ" $JOAO
```

## 10. Maior lance e histórico

Maior lance: Maria, R$ 2000. Histórico: 3 lances gravados (1000, 1500 e 2000 —
o da compensação não foi gravado).

```bash
curl -s http://localhost:8000/lances/leilao/$L/maior -H "Authorization: Bearer $TL"; echo
curl -s http://localhost:8000/lances/leilao/$L -H "Authorization: Bearer $TL"; echo
```

## 11. Autorização: ninguém age em nome de outra pessoa — 403

**Regra 7:** leiloeiro tentando dar lance.

```bash
lance "$TL" 5000
```

Maria tentando dar lance em nome do João (e gastar o crédito dele):

```bash
curl -s -w '  -> HTTP %{http_code}\n' -X POST http://localhost:8000/lances -H "Authorization: Bearer $TM" -H "$J" \
  -d "{\"leilaoId\":$L,\"licitanteId\":$JOAO,\"valor\":5000}"
```

Reservar crédito direto, pulando a Saga: a rota é **interna** e o Kong bloqueia.

```bash
curl -s -w '  -> HTTP %{http_code}\n' -X POST http://localhost:8000/licitantes/$MARIA/reservas \
  -H "Authorization: Bearer $TM" -H "$J" -d '{"valor":10}'
```

## 12. Cancelar o leilão devolve o crédito

Maria tem R$ 2000 reservados (é o maior lance). O leiloeiro cancela o leilão e
o leiloes-service pede ao usuarios-service para liberar todas as reservas dele
(Regra 8 do leilão; Regra 3 do crédito). **Esperado:** `CANCELADO` e depois
`reservado: 0`.

```bash
credito "$TM" $MARIA
curl -s -X PATCH http://localhost:8000/leiloes/$L/cancelar -H "Authorization: Bearer $TL"; echo
credito "$TM" $MARIA
```

## 13. Olhando nos bancos

Cada serviço tem o próprio banco: os lances e as sagas ficam no `lances-db`; as
reservas de crédito, no `usuarios-db`.

```bash
docker exec lances-db psql -U lances_user -d lances_db -c "SELECT id, leilao_id, licitante_id, valor, saga_id, reserva_id FROM lances WHERE leilao_id = $L ORDER BY id;"
docker exec lances-db psql -U lances_user -d lances_db -c "SELECT id, licitante_id, valor, status, erro FROM sagas_lance WHERE leilao_id = $L ORDER BY id;"
docker exec usuarios-db psql -U usuarios_user -d usuarios_db -c "SELECT id, licitante_id, valor, referencia, status, leilao_id FROM reservas_credito WHERE leilao_id = $L ORDER BY id;"
```

> `referencia` identifica a saga que fez a reserva (ex.: `saga-4`) e é
> `UNIQUE`: a mesma saga nunca cria duas reservas (idempotência — Regra 2 do
> crédito). Todas aparecem como `LIBERADA`: devolvidas quando a pessoa foi
> superada, pela compensação ou pelo cancelamento. Os passos de cada saga ficam
> gravados na coluna `passos` (JSON) da tabela `sagas_lance`.

Para entrar no psql interativo pelo Git Bash, use `winpty` na frente:

```bash
winpty docker exec -it lances-db psql -U lances_user -d lances_db
```

## 14. Testes unitários

As regras do lance e a Saga são testadas sem banco e sem rede, com mocks
(`tests/regrasDoLance.test.js` e `tests/registrarLanceSaga.test.js`). Com Node
instalado:

```bash
cd lances-service; npm test; cd ..
```

Sem Node (roda o Jest dentro do Docker, os 4 serviços, com resumo):

```bash
powershell.exe -ExecutionPolicy Bypass -File ./testes/testar-unitarios.ps1
```
