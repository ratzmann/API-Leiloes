# Apresentação — Sistema de Leilão de Bois (Microsserviços)

Roteiro para os **15 minutos** do grupo, seguindo a divisão pedida no enunciado:

- **um aluno** apresenta o **serviço de autenticação** e o seu microsserviço de domínio;
- **os demais** apresentam os **padrões de microsserviços** usados e o seu microsserviço de domínio.

> Troque `<ALUNO 1>`, `<ALUNO 2>` e `<ALUNO 3>` pelos nomes. A divisão abaixo
> associa cada padrão ao serviço onde ele aparece mais (Kong protege
> `/leiloes`; a Saga mora no lances-service), mas pode ser trocada.

| Bloco | Quem | Conteúdo | Tempo |
|---|---|---|---|
| 0 | `<ALUNO 1>` | Abertura: o problema e o desenho geral | 1 min |
| 1 | `<ALUNO 1>` | **auth-service** + **usuarios-service** | 4 min |
| 2 | `<ALUNO 2>` | Padrão **API Gateway (Kong)** + **leiloes-service** | 4 min |
| 3 | `<ALUNO 3>` | Padrão **Saga orquestrada** + **lances-service** | 4 min |
| 4 | todos | Testes, requisitos atendidos e fechamento | 2 min |

---

## Antes de apresentar (checklist)

- [ ] Docker Desktop aberto e o sistema no ar: `docker compose up --build -d`
- [ ] Testes unitários passando: `powershell -ExecutionPolicy Bypass -File .\testes\testar-unitarios.ps1`
- [ ] Teste ponta a ponta passando: `powershell -ExecutionPolicy Bypass -File .\testes\testar-tudo.ps1` (61/61)
- [ ] Um terminal PowerShell aberto na raiz do projeto, já com o **bloco de preparação da demo** (abaixo) executado
- [ ] Abas abertas no editor: `docker-compose.yml`, `kong/kong.yml`, `docs/ARQUITETURA.md` e os arquivos citados em cada bloco

### Bloco de preparação da demo (rodar uma vez, antes de começar)

Cria um leiloeiro, dois licitantes e um leilão que começa em 1 minuto — os
comandos das demos usam essas variáveis. Rode-o **no mesmo terminal** da
apresentação, pelo menos 1 minuto antes do Bloco 3.

> Nas demos, rode **um comando por vez** (cada saída aparece formatada). Colando
> vários de uma vez, o PowerShell pode mostrar algumas respostas em branco.

```powershell
$api = "http://localhost:8000"
function Chamar($metodo, $rota, $corpo = $null, $token = $null, $extras = @{}) {
    $h = @{}; if ($token) { $h.Authorization = "Bearer $token" }; foreach ($k in $extras.Keys) { $h[$k] = $extras[$k] }
    $p = @{ Uri = "$api$rota"; Method = $metodo; Headers = $h; ContentType = "application/json" }
    if ($corpo) { $p.Body = ($corpo | ConvertTo-Json -Depth 5) }
    try { Invoke-RestMethod @p } catch { "HTTP $([int]$_.Exception.Response.StatusCode): $($_.ErrorDetails.Message)" }
}
function Cpf { $d = @(1..9 | % { Get-Random -Max 10 }); foreach ($n in 9,10) { $s = 0; for ($i = 0; $i -lt $n; $i++) { $s += $d[$i] * ($n + 1 - $i) }; $v = ($s * 10) % 11; if ($v -eq 10) { $v = 0 }; $d += $v }; $d -join "" }
$r = Get-Random

$leiloeiro = Chamar POST "/auth/registrar" @{ nome = "Carlos Pereira"; email = "carlos$r@demo.com"; senha = "senha123"; papel = "LEILOEIRO"; dadosPerfil = @{ registroProfissional = "JUCESC-$(Get-Random -Min 100000 -Max 999999)" } }
$maria = Chamar POST "/auth/registrar" @{ nome = "Maria Souza"; email = "maria$r@demo.com"; senha = "senha123"; papel = "LICITANTE"; dadosPerfil = @{ cpf = (Cpf); limiteCredito = 5000 } }
$joao  = Chamar POST "/auth/registrar" @{ nome = "Joao Lima"; email = "joao$r@demo.com"; senha = "senha123"; papel = "LICITANTE"; dadosPerfil = @{ cpf = (Cpf); limiteCredito = 3000 } }
$TL = $leiloeiro.token; $TM = $maria.token; $TJ = $joao.token

$agora = (Get-Date).ToUniversalTime()
$leilao = Chamar POST "/leiloes" @{ titulo = "Nelore - Lote 12"; quantidadeBois = 40; lanceInicial = 1000; incrementoMinimo = 100; dataInicio = $agora.AddMinutes(1).ToString("o"); dataFim = $agora.AddHours(2).ToString("o") } $TL
$L = $leilao.id
"leiloeiro $($leiloeiro.perfil.id) | Maria $($maria.perfil.id) | Joao $($joao.perfil.id) | leilao $L"
```

---

## Bloco 0 — Abertura (`<ALUNO 1>`, 1 min)

**Falar:**
- O sistema: leilões de gado. Leiloeiros cadastram leilões; licitantes dão
  lances limitados ao seu crédito.
- Quatro microsserviços independentes, cada um com **o próprio banco**, um
  **API Gateway** (Kong) na frente e comunicação **REST** entre eles.

**Mostrar:** o desenho da seção 2 do [`ARQUITETURA.md`](ARQUITETURA.md) e o
[`docker-compose.yml`](../docker-compose.yml) (9 containers, só o Kong com `ports:`).

---

## Bloco 1 — Autenticação + usuarios-service (`<ALUNO 1>`, 4 min)

**Falar:**
- **auth-service** — registro e login. Senha guardada com **bcrypt** (hash).
  O login devolve um **JWT** com `sub`, `papel` e `perfilId`.
- No registro, o auth-service chama o usuarios-service por **REST** para criar
  o perfil (leiloeiro ou licitante) — primeira comunicação entre serviços.
- **usuarios-service** — leiloeiros, licitantes e **crédito** do licitante.
  Regras: CPF com dígitos verificadores, e-mail/CPF/registro únicos, limite
  ≥ 0, reservas nunca passam do limite, e **só o próprio usuário altera o seu
  cadastro** (o licitante não aumenta o próprio limite).
- Arquitetura em camadas: `routes → controllers → services → repositories`.

**Mostrar no código:**
- [`auth-service/src/services/authService.js`](../auth-service/src/services/authService.js) — `registrar` e `criarPerfilNoUsuariosService`
- [`auth-service/src/utils/jwt.js`](../auth-service/src/utils/jwt.js) — o conteúdo do token
- [`usuarios-service/src/services/creditoService.js`](../usuarios-service/src/services/creditoService.js) — `reservar` (transação + `FOR UPDATE`)

**Demo:**
```powershell
Chamar POST "/auth/login" @{ email = "maria$r@demo.com"; senha = "errada" }        # HTTP 401
Chamar GET "/licitantes/$($maria.perfil.id)/credito" $null $TM                    # limite 5000, disponível 5000
Chamar PUT "/licitantes/$($maria.perfil.id)" @{ limiteCredito = 999999 } $TM      # HTTP 403: não aumenta o próprio limite
Chamar PUT "/licitantes/$($joao.perfil.id)" @{ nome = "Invasor" } $TM             # HTTP 403: cadastro de outra pessoa
```

---

## Bloco 2 — API Gateway (Kong) + leiloes-service (`<ALUNO 2>`, 4 min)

**Falar (padrão API Gateway):**
- O **Kong** é o único ponto de entrada (porta 8000). Ele confere a assinatura
  e a validade do JWT (**plugin jwt**) antes de a requisição chegar aos serviços.
- Rotas **internas** bloqueadas com `403`: reservas de crédito e criação direta
  de perfis — só os próprios serviços chamam, pela rede do Docker.
- Os serviços não têm porta exposta: não dá para "pular" o gateway.

**Falar (leiloes-service):**
- Leilão com lote, valores, período e ciclo de vida
  `AGENDADO → ABERTO → ENCERRADO` (máquina de estados).
- Regras: dados coerentes e duração ≥ 30 min, início no futuro, **leiloeiro
  validado por REST no usuarios-service**, sem choque de agenda, edição só
  enquanto `AGENDADO`, e **só o leiloeiro dono** gerencia o leilão.

**Mostrar no código:**
- [`kong/kong.yml`](../kong/kong.yml) — services, plugin `jwt`, `request-termination` (403) e `consumers`
- [`leiloes-service/src/utils/validadores.js`](../leiloes-service/src/utils/validadores.js) — `TRANSICOES_PERMITIDAS`
- [`leiloes-service/src/services/leilaoService.js`](../leiloes-service/src/services/leilaoService.js) — `cadastrar`, `garantirLeiloeiroExiste`, `garantirDono`

**Demo:**
```powershell
Chamar GET "/leiloes"                                                            # HTTP 401: o Kong barra sem token
Chamar POST "/licitantes/$($maria.perfil.id)/reservas" @{ valor = 10 } $TM       # HTTP 403: rota interna
Chamar PATCH "/leiloes/$L/encerrar" $null $TL                                    # HTTP 409: não encerra sem abrir
Chamar PATCH "/leiloes/$L/abrir" $null $TM                                       # HTTP 403: licitante não abre leilão
Chamar PATCH "/leiloes/$L/abrir" $null $TL                                       # status ABERTO
```

---

## Bloco 3 — Saga orquestrada + lances-service (`<ALUNO 3>`, 4 min)

**Falar (padrão Saga):**
- Registrar um lance mexe em **três bancos**: o leilão (leiloes), o crédito
  (usuarios) e o lance (lances). Não existe transação única entre eles.
- A **Saga orquestrada** faz transações locais em sequência; se um passo
  falha, o orquestrador executa **compensações**:
  1. consultar o leilão → 2. **reservar crédito** → 3. gravar o lance →
  4. liberar o crédito de quem foi superado.
- Falha no passo 3 → **compensa** o passo 2 (devolve o crédito).
  Falha no passo 4 → tenta 3× e fica **pendente**, com reprocessamento.
- Idempotência (a reserva usa o id da saga), travas contra concorrência e o
  histórico de cada saga na tabela `sagas_lance`.

**Falar (lances-service):**
- Regras: primeiro lance ≥ lance inicial; depois ≥ maior + incremento; ninguém
  cobre o próprio lance; precisa ter crédito; e **só o licitante logado dá lance,
  em nome próprio**.

**Mostrar no código:**
- [`lances-service/src/sagas/registrarLanceSaga.js`](../lances-service/src/sagas/registrarLanceSaga.js) — o cabeçalho resume a Saga; depois `executar`
- [`lances-service/src/services/regrasDoLance.js`](../lances-service/src/services/regrasDoLance.js)

**Demo** (o leilão precisa já ter começado — criado com início em 1 minuto):
```powershell
Chamar POST "/lances" @{ leilaoId = $L; valor = 1000 } $TL                      # HTTP 403: leiloeiro não dá lance
Chamar POST "/lances" @{ leilaoId = $L; valor = 1000 } $TM                      # 201, sagaStatus CONCLUIDA
Chamar POST "/lances" @{ leilaoId = $L; valor = 3500 } $TJ                      # HTTP 409: crédito insuficiente (João tem 3000)
Chamar POST "/lances" @{ leilaoId = $L; valor = 1500 } $TJ                      # 201: João supera Maria
Chamar GET "/licitantes/$($maria.perfil.id)/credito" $null $TM                  # reservado 0: passo 4 devolveu o crédito

# compensação: força a falha no passo 3 (gravar o lance)
Chamar POST "/lances" @{ leilaoId = $L; valor = 2000 } $TM @{ "X-Simular-Falha" = "gravar-lance" }  # HTTP 500 com sagaId
(Chamar GET "/lances/sagas" $null $TM)[0] | Select-Object id, status             # status COMPENSADA
((Chamar GET "/lances/sagas" $null $TM)[0]).passos | Format-Table passo, resultado # o passo a passo, com o COMPENSADO
Chamar GET "/licitantes/$($maria.perfil.id)/credito" $null $TM                  # reservado 0: crédito devolvido
```

---

## Bloco 4 — Testes, requisitos e fechamento (todos, 2 min)

**Falar:**
- **Testes unitários** (Jest) em cada serviço, com banco e rede trocados por
  mocks; testes de regras (services, Saga) e da camada HTTP (supertest).
  Cobertura sobre todo o `src/`: auth 87%, usuarios 75%, leiloes 72%,
  lances 74% — o `npm test` falha se cair abaixo de 50%.
- **Teste ponta a ponta**: 61 passos reais pelo Kong.

**Mostrar:** a saída do `testar-unitarios.ps1` (resumo com os 4 serviços).

**Requisitos do enunciado:**

| Requisito | Onde está |
|---|---|
| 1 microsserviço de domínio por aluno, independente | usuarios, leiloes, lances — código, banco e Dockerfile próprios |
| ≥ 3 regras de negócio por serviço | README, seção "Regras de negócio" |
| Arquitetura interna definida | camadas em todos os serviços (seção 4 do `ARQUITETURA.md`) |
| Testes com cobertura ≥ 50% | `testar-unitarios.ps1` (72% a 87%) |
| ≥ 2 padrões de microsserviços | API Gateway (Kong) e Saga orquestrada |
| Serviço de autenticação | auth-service (bcrypt + JWT, validado pelo Kong) |
| Formato de comunicação | REST (HTTP + JSON) |
| Serviços se comunicam | auth→usuarios, leiloes→usuarios, lances→leiloes e usuarios |
| Docker | um Dockerfile por serviço + `docker-compose.yml` |

**Próximos passos** (se perguntarem): papel de administrador, remoção de
cadastros em uso, acompanhamento ao vivo dos lances (WebSockets/eventos).

---

## Perguntas prováveis

| Pergunta | Resposta curta |
|---|---|
| Por que um banco por serviço? | Independência: cada serviço evolui e sobe sozinho; ninguém depende do esquema do outro. |
| Se os serviços só decodificam o token, dá para forjar um? | Não pelo caminho normal: o Kong confere a assinatura antes, e os serviços não têm porta exposta. |
| O que acontece se o usuarios-service cair no meio da Saga? | Timeout de 3 s → erro 503; se já havia reserva, a Saga tenta compensar e registra o resultado em `sagas_lance`. |
| Dois lances iguais ao mesmo tempo? | O passo 3 trava o leilão (`pg_advisory_xact_lock`) e confere o valor de novo antes do `INSERT`. |
| Por que Saga orquestrada e não coreografada? | O fluxo tem ordem e compensações claras; um orquestrador central deixa isso explícito e rastreável. |
| Timeout e novas tentativas são Circuit Breaker? | Não — não há "circuito aberto". Seria uma evolução. |
