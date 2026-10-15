# Roteiro de apresentação: leiloes-service

Sistema de Leilão de Bois (microsserviços + Kong). Rodar tudo no **Git Bash**,
na ordem e **no mesmo terminal** (os passos guardam valores em variáveis).

> **Depois do roteiro do Lucas:** funciona na mesma base, desde que o passo 11
> dele (apagar o leiloeiro) **não** tenha sido executado. O Carlos já existe,
> então o cadastro do passo 2 responde 409 — é esperado, o login funciona.
>
> **Não precisa de Node:** os campos das respostas são extraídos com `sed`.

## 1. Preparação (fazer com antecedência)

Entrar na pasta do projeto (ajuste para o caminho da sua máquina):

```bash
cd "/c/Users/User/Desktop/UDESC/Devops/Trabalho 01/API-Leiloes"
```

Construir as imagens e subir os 9 contêineres em segundo plano. O `--build`
demora alguns minutos na primeira vez.

```bash
docker compose up --build -d
```

Listar os contêineres. Os 9 precisam aparecer como `Up` (4 bancos Postgres + 4
serviços Node + o Kong).

```bash
docker compose ps
```

Confirmar que o Kong está roteando. **Esperado:** `{"status":"ok","service":"auth-service"}`

```bash
curl -s http://localhost:8000/auth/health; echo
```

Se algum contêiner aparecer como `Exited` (acontece quando o PC suspende ou o
Docker Desktop reinicia), subir de novo e esperar uns 20 segundos:

```bash
docker compose up -d
```

## 2. Criar o leiloeiro e preparar as variáveis

Criar o leiloeiro. Se o e-mail já existir, responde 409 "já existe": pode
ignorar, o login abaixo funciona do mesmo jeito.

```bash
curl -s -X POST http://localhost:8000/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{"nome":"Carlos Pereira","email":"carlos@example.com","senha":"senha123","papel":"LEILOEIRO","dadosPerfil":{"registroProfissional":"JUCESC-000123"}}'; echo
```

Fazer login e guardar a resposta inteira na variável `R`:

```bash
R=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","senha":"senha123"}')
```

Extrair o token JWT (vale 2 horas) e guardar em `T`. O `sed` procura o trecho
`"token":"..."` na resposta e fica só com o valor:

```bash
T=$(echo "$R" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
```

Extrair o id do perfil do leiloeiro (`usuario.perfil_id`) e guardar em `ID`. É
esse número que vai no campo `leiloeiroId` do cadastro de leilão.

```bash
ID=$(echo "$R" | sed -n 's/.*"perfil_id":\([0-9]*\).*/\1/p')
```

Atalhos para não repetir o token em cada comando: `A` = cabeçalho de
autenticação; `J` = cabeçalho dizendo que o corpo é JSON.

```bash
A="Authorization: Bearer $T"; J="Content-Type: application/json"
```

Gerar uma data futura aleatória e a função que monta o corpo do leilão:

```bash
D=$(date -u -d "+$((RANDOM % 300 + 30)) days" +%Y-%m-%d)
corpo() { echo "{\"leiloeiroId\":$1,\"titulo\":\"Nelore Lote 12\",\"quantidadeBois\":40,\"lanceInicial\":5000,\"incrementoMinimo\":100,\"dataInicio\":\"${D}T14:00:00Z\",\"dataFim\":\"${D}T17:00:00Z\"}"; }
```

Confirmar que deu tudo certo. Deve imprimir o id do leiloeiro e a data (se o
`leiloeiroId` sair vazio, o login falhou: veja `echo "$R"`).

```bash
echo "pronto: leiloeiroId=$ID, leilao em $D"
```

## 3. Criando o leilão

**Sem token: o Kong barra antes de chegar no serviço — 401**

```bash
curl -i http://localhost:8000/leiloes; echo
```

> Falar: "esse 401 vem do gateway (plugin JWT do Kong), não do código do leiloes-service".

**Cadastrar o leilão e guardar o id em `L` — 201, `"status":"AGENDADO"`**

```bash
RESP=$(curl -s -X POST http://localhost:8000/leiloes -H "$A" -H "$J" -d "$(corpo $ID)"); echo "$RESP"
L=$(echo "$RESP" | sed -n 's/^{"id":\([0-9]*\).*/\1/p'); echo "leilao $L"
```

## 4. Testando as regras de negócio

**Regra 4: agenda exclusiva do leiloeiro — 409**
Mesmo corpo de novo: o mesmo leiloeiro teria dois eventos no mesmo horário.

```bash
curl -i -X POST http://localhost:8000/leiloes -H "$A" -H "$J" -d "$(corpo $ID)"; echo
```

**Regra 7: leilão em nome de outro leiloeiro — 403**
O leilão é sempre do leiloeiro dono do token: um `leiloeiroId` diferente do
próprio é barrado antes de qualquer outra validação.

```bash
curl -i -X POST http://localhost:8000/leiloes -H "$A" -H "$J" -d "$(corpo 9999)"; echo
```

> Se perguntarem da **Regra 3** (o leiloeiro precisa existir): ela é conferida
> por uma chamada HTTP ao usuarios-service (`GET /leiloeiros/:id`) antes de
> gravar — mostrar `garantirLeiloeiroExiste` em
> `leiloes-service/src/services/leilaoService.js`. Pela API ela só aparece se o
> perfil do próprio leiloeiro tiver sido apagado (responde 404), porque a
> Regra 7 já barra ids de outras pessoas.

**Regra 2: data de início no passado — 400**

```bash
curl -i -X POST http://localhost:8000/leiloes -H "$A" -H "$J" \
  -d '{"leiloeiroId":1,"titulo":"Leilao no passado","quantidadeBois":10,"lanceInicial":1000,"incrementoMinimo":50,"dataInicio":"2020-01-01T10:00:00Z","dataFim":"2020-01-01T14:00:00Z"}'; echo
```

> Se perguntarem do `leiloeiroId: 1` fixo: a autorização (Regra 7) vem primeiro
> e só aceita o próprio id — funciona porque o Carlos é o leiloeiro 1. Depois
> dela, as validações baratas (dados e data) rodam antes da chamada HTTP ao
> usuarios-service, então a data é recusada sem consultar o outro serviço.

**Regra 1: incremento mínimo maior que o lance inicial — 400**

```bash
curl -i -X POST http://localhost:8000/leiloes -H "$A" -H "$J" \
  -d "{\"leiloeiroId\":$ID,\"titulo\":\"Incremento absurdo\",\"quantidadeBois\":10,\"lanceInicial\":100,\"incrementoMinimo\":500,\"dataInicio\":\"${D}T20:00:00Z\",\"dataFim\":\"${D}T23:00:00Z\"}"; echo
```

**Regra 5: encerrar um leilão que nunca foi aberto — 409**
Transição inválida; a mensagem mostra a transição recusada.

```bash
curl -i -X PATCH http://localhost:8000/leiloes/$L/encerrar -H "$A"; echo
```

**Abrir o pregão: AGENDADO → ABERTO — 200, `"status":"ABERTO"`**

```bash
curl -s -X PATCH http://localhost:8000/leiloes/$L/abrir -H "$A"; echo
```

**Regra 6: editar depois de aberto — 409**
Já existem lances calculados sobre o lance inicial publicado.

```bash
curl -i -X PUT http://localhost:8000/leiloes/$L -H "$A" -H "$J" \
  -d '{"titulo":"Nao deveria passar"}'; echo
```

## 5. Verificando a disponibilidade

```bash
curl -s http://localhost:8000/leiloes/$L/disponibilidade -H "$A"; echo
```

> Vai responder `"aceitandoLances": false`, e isso está certo. A regra exige
> status ABERTO **e** o horário atual dentro de `dataInicio`/`dataFim`. O status
> é ABERTO, mas o pregão é numa data futura, então o lances-service recusaria
> lance agora.

## 6. Extras

Mostrar o banco com o status ABERTO gravado:

```bash
docker exec leiloes-db psql -U leiloes_user -d leiloes_db -c "SELECT id, leiloeiro_id, titulo, status, data_inicio, data_fim FROM leiloes ORDER BY id;"
```

> `leiloeiro_id` é só um número, sem chave estrangeira: o leiloeiro mora em
> outro banco (usuarios-db). Por isso a Regra 3 consulta o outro serviço por
> HTTP. Esse é o argumento de "um banco por microsserviço".

**Transição válida ABERTO → ENCERRADO (caminho feliz da Regra 5) — 200**

```bash
curl -s -X PATCH http://localhost:8000/leiloes/$L/encerrar -H "$A"; echo
```

Testes unitários com cobertura (regras testadas sem banco e sem rede, com
mocks). Com Node instalado:

```bash
cd leiloes-service; npm test; cd ..
```

Sem Node (roda o Jest dentro do Docker, os 4 serviços, com resumo):

```bash
powershell.exe -ExecutionPolicy Bypass -File ./testes/testar-unitarios.ps1
```

## 7. Acessando os bancos

Cada serviço tem seu próprio Postgres. Credenciais (do `docker-compose.yml`):

| Contêiner | Usuário | Banco | Tabelas |
|---|---|---|---|
| leiloes-db | leiloes_user | leiloes_db | leiloes |
| auth-db | auth_user | auth_db | usuarios |
| usuarios-db | usuarios_user | usuarios_db | leiloeiros, licitantes, reservas_credito |
| lances-db | lances_user | lances_db | lances, sagas_lance |

### Modo interativo (entrar no psql)

No Git Bash, o modo interativo (`-it`) precisa do `winpty` na frente:

```bash
winpty docker exec -it leiloes-db psql -U leiloes_user -d leiloes_db
```

Dentro do psql:

```sql
\dt                 -- lista as tabelas
\d leiloes          -- estrutura e constraints da tabela
SELECT id, leiloeiro_id, titulo, status, data_inicio, data_fim FROM leiloes ORDER BY id;
\q                  -- sair
```

### SELECT direto, sem entrar no psql

Com `-c` não é preciso `-it` (nem `winpty`).

leiloes-db

```bash
docker exec leiloes-db psql -U leiloes_user -d leiloes_db -c "SELECT id, leiloeiro_id, titulo, quantidade_bois, lance_inicial, incremento_minimo, status, data_inicio, data_fim FROM leiloes ORDER BY id;"
```

auth-db (a senha fica só como hash)

```bash
docker exec auth-db psql -U auth_user -d auth_db -c "SELECT id, nome, email, papel, perfil_id, criado_em FROM usuarios ORDER BY id;"
```

usuarios-db

```bash
docker exec usuarios-db psql -U usuarios_user -d usuarios_db -c "SELECT id, usuario_id, nome, email, registro_profissional FROM leiloeiros ORDER BY id;"
docker exec usuarios-db psql -U usuarios_user -d usuarios_db -c "SELECT id, usuario_id, nome, email, cpf, limite_credito FROM licitantes ORDER BY id;"
docker exec usuarios-db psql -U usuarios_user -d usuarios_db -c "SELECT id, licitante_id, valor, referencia, status FROM reservas_credito ORDER BY id;"
```

lances-db

```bash
docker exec lances-db psql -U lances_user -d lances_db -c "SELECT id, leilao_id, licitante_id, valor, criado_em FROM lances ORDER BY id;"
docker exec lances-db psql -U lances_user -d lances_db -c "SELECT id, leilao_id, licitante_id, valor, status, erro FROM sagas_lance ORDER BY id;"
```

Para ver a ligação entre os bancos: `perfil_id` em `auth-db.usuarios` aponta
para `id` em `usuarios-db.leiloeiros`, que é o `leiloeiro_id` em
`leiloes-db.leiloes`.
