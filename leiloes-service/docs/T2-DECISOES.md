# T2 — CI/CD e Observabilidade do `leiloes-service`

> Documento de estudo para a apresentação. Explica **o que** foi feito, **por que**
> cada decisão foi tomada, **como funciona** e **o que falta configurar** nas
> contas externas (GitHub, Render, Neon, SonarCloud).
>
> Escopo: só o `leiloes-service` (a parte do Thiago). O enunciado pede
> "1 microsserviço por aluno, cada serviço implantado separadamente (1 pipeline
> para cada)" — os outros serviços ficam com os colegas e não foram tocados.

---

## 1. Resumo em um minuto

| Requisito do T2 | Onde está | Em uma frase |
|---|---|---|
| 1. Git Flow (`main`, `develop`, `feature/*`) | branches `develop` e `feature/leiloes-service-cicd` | feature → PR → develop (DEV) → PR → main (HOMOL) |
| 2. CI: build, testes, Sonar | `.github/workflows/leiloes-service.yml`, job `ci` | `npm ci` + Jest com cobertura mínima de 50% + SonarCloud |
| 3. CD: develop→DEV, main→HOMOL, Render | jobs `deploy-dev` / `deploy-homol` + `leiloes-service/ci/deploy-render.sh` | o pipeline manda o Render rodar **a imagem exata** que acabou de testar e confere a versão no `/health` |
| 4. Swagger só em DEV | `src/config/ambiente.js`, `src/docs/openapi.js`, `src/app.js` | `APP_ENV=dev` → `/docs`; `APP_ENV=homol` → 404 |
| 6. Dockerfile, build automático, publicação | `leiloes-service/Dockerfile`, job `imagem` | build em todo push; publicação no GitHub Container Registry (GHCR) em develop/main |
| 7. Semantic Versioning | `version` do `package.json` (1.1.0) | imagens `1.1.0-dev.N` (DEV) e `1.1.0` (HOMOL) + tag git `leiloes-service-v1.1.0` |
| 8. Dependabot + secrets | `.github/dependabot.yml`; secrets em *Environments* | PRs automáticas de atualização; nenhuma senha no código |
| 9. Prometheus + Grafana | `src/observabilidade/metricas.js` + `leiloes-service/observabilidade/` | `/metrics` no serviço; Prometheus coleta; Grafana sobe com dashboard pronto |
| 10. 1 pipeline por serviço | filtro `paths: leiloes-service/**` | mudança em outro serviço não dispara este pipeline |
| 11. Entregáveis | este documento + README do serviço | URLs DEV/HOMOL saem da configuração do Render (seção 5) |

**Verificado localmente** (14/10/2026):
- 62 testes unitários passando, com cobertura de ~98% sobre os módulos medidos;
- `actionlint` sem erros no workflow;
- imagem Docker construída;
- script de deploy testado contra um Render falso (sucesso, timeout, hook inválido e sem secret);
- stack Prometheus + Grafana no ar, com as 10 consultas do dashboard validadas;
- teste ponta a ponta do grupo (`testes/testar-tudo.ps1`, 52 passos pelo Kong) **continua 52/52**.

**Depois da integração com a revisão do T1** (15/10/2026, branch
`feature/integracao-revisao-t1`):
- 96 testes unitários passando; a cobertura passou a ser medida sobre **todo o
  `src/`** (critério do T1, mínimo de 50%): 88% de linhas;
- o modo "serviço sozinho" (sem `USUARIOS_SERVICE_URL`) continua valendo: o leilão é cadastrado sem validar o leiloeiro e o cancelamento não tenta liberar reservas. O `gerar-trafego.ps1` agora assina um token de leiloeiro, exigido pela autorização do T1;
- as métricas guardam o prefixo da rota (`lembrarPrefixo`), porque com o
  tratamento de erros único do T1 um erro que sai do router perdia o `req.baseUrl`;
- validado também o ponta a ponta do T1 (72 passos) e a coleção Postman.

**Não verificado** (depende de contas que só você pode criar): a execução real
no GitHub Actions, o deploy no Render e a análise no SonarCloud. O passo a passo
está na seção 5.

---

## 2. Visão geral

```
 feature/leiloes-service-cicd ──PR──▶ develop ──PR──▶ main
          │                             │                │
          ▼                             ▼                ▼
   ┌─────────────┐              ┌─────────────┐   ┌─────────────┐
   │ ci          │              │ ci          │   │ ci          │
   │ versao      │              │ versao      │   │ versao  (*) │
   │ imagem      │ build só     │ imagem ─────┼─▶ │ imagem ─────┼─▶ GHCR :1.1.0, :homol, :latest
   └─────────────┘              │ deploy-dev  │   │ deploy-homol│     + tag git leiloes-service-v1.1.0
                                └──────┬──────┘   └──────┬──────┘
                    GHCR :1.1.0-dev.N  │                 │
                                       ▼                 ▼
                              Render DEV          Render HOMOL
                              APP_ENV=dev         APP_ENV=homol
                              Swagger em /docs    sem Swagger
                                   │                    │
                                   └──── Neon Postgres ─┘  (bancos leiloes_dev / leiloes_homol)
                                   │                    │
                                   └──── /metrics ──────┴──▶ Prometheus ──▶ Grafana
 (*) em main, falha se a versão do package.json já foi publicada antes
```

---

## 3. Decisões (o que, por que e alternativas)

### D1. Base de código: `main`

- **O que:** o trabalho parte da `main` do repositório do grupo.
- **Por que:** pedido explícito. Existe um branch remoto
  `docs/comentarios-apresentacao`, 62 commits à frente e nunca mergeado, que
  **não** foi usado.

### D2. Git Flow

- **O que:**
  - `develop` foi criado a partir da `main`;
  - o trabalho foi feito em `feature/leiloes-service-cicd`;
  - promoção: `feature/* → develop → main`, sempre por Pull Request.
- **Por que:** é o modelo do enunciado (`main` = homologação, `develop` =
  desenvolvimento, `feature/*` = trabalho em andamento). Cada branch tem um papel
  no pipeline:

| Branch | O pipeline faz | Ambiente |
|---|---|---|
| `feature/**` | build + testes + Sonar + build da imagem (sem publicar) | nenhum |
| PR para `develop`/`main` | o mesmo, como verificação do PR | nenhum |
| `develop` | tudo acima + publica a imagem + deploy | **DEV** |
| `main` | tudo acima + valida a versão + tag git + deploy | **HOMOL** |

- Os branches `main` e `develop` já estão no GitHub com este trabalho.

### D3. Um workflow só, filtrado por pasta

- **O que:** `.github/workflows/leiloes-service.yml` com
  `paths: ['leiloes-service/**', '.github/workflows/leiloes-service.yml']`.
- **Por que:** o repositório é um *monorepo* (4 serviços na mesma árvore). O
  filtro de `paths` faz o pipeline rodar **só** quando o leiloes-service muda,
  atendendo ao "1 pipeline para cada serviço". Cada colega cria o próprio
  arquivo (`auth-service.yml` etc.) sem conflitar com este.
- **Alternativa descartada:** um pipeline único para todos os serviços. Ele
  violaria o requisito 10, e um erro num serviço bloquearia o deploy dos outros.

### D4. CI: Node 20, `npm ci`, Jest com cobertura mínima

- **O que:**
  - `npm ci` instala exatamente o `package-lock.json` (build reprodutível);
  - `npm test -- --ci` roda o Jest com cobertura;
  - o `package.json` tem `coverageThreshold` de 50%: se a cobertura cair, **o
    pipeline falha**;
  - o relatório de cobertura fica como artefato da execução.
- **Por que:** o T1 exigia cobertura mínima de 50%. Agora isso é garantido
  automaticamente, em vez de "conferido na mão".
- **Escopo da cobertura:** `app.js`, `config/`, `db/`, `docs/`,
  `observabilidade/`, `services/` e `utils/`, ou seja, regras de negócio e o
  código novo do T2. `controllers/`, `repositories/` e `routes/` já ficavam fora
  no T1 (são traduções finas de HTTP e SQL testadas pelo ponta a ponta). O
  Sonar usa o **mesmo** escopo (`sonar.coverage.exclusions`), para os dois
  números baterem.

### D5. SonarCloud (e não SonarQube)

- **O que:**
  - `SonarSource/sonarqube-scan-action@v7` com `projectBaseDir: leiloes-service`;
  - organização e chave do projeto vêm das variáveis do repositório
    (`SONAR_ORGANIZATION`, `SONAR_PROJECT_KEY`);
  - o token vem do secret `SONAR_TOKEN`.
- **Por que:** o SonarCloud é gratuito para repositório público e não exige
  servidor próprio. O SonarQube precisaria de um servidor no ar 24 h, o que é
  mais custo e mais coisa para dar errado.
- **Por que organização e chave em *variáveis*, não fixas no arquivo:** o
  repositório é do Lucas (`ratzmann`). Assim você pode usar uma organização
  **sua** no SonarCloud sem depender dele.
- **Se ainda não estiver configurado:** o passo é **pulado com um aviso
  amarelo**, e build, testes e imagem continuam obrigatórios. Dá para subir o
  código antes de criar a conta, e o pipeline não fica vermelho por falta de
  configuração.
- O quality gate é **informativo** (não bloqueia o pipeline). Bloquear exigiria
  80% de cobertura em código novo, o padrão do Sonar, que não é exigência do
  trabalho.

### D6. Semantic Versioning com a versão no `package.json`

- **O que:** a fonte da verdade é o campo `version` do `leiloes-service/package.json`
  (foi de `1.0.0` para `1.1.0`).

| Branch | Tags da imagem | Exemplo |
|---|---|---|
| `develop` | `X.Y.Z-dev.<nº da execução>`, `dev`, `sha-<commit>` | `1.1.0-dev.14` |
| `main` | `X.Y.Z`, `homol`, `latest`, `sha-<commit>` | `1.1.0` |
| outros | `X.Y.Z-build.<nº>` (só build, não publica) | — |

- Em `main` o pipeline também cria a **tag git** `leiloes-service-v1.1.0`.
- **Por que 1.1.0:** pela SemVer, `MAJOR.MINOR.PATCH` sobe o MINOR quando se
  adiciona funcionalidade **compatível** (métricas, Swagger, `DATABASE_URL`)
  sem quebrar a API existente. MAJOR seria uma quebra de contrato; PATCH, só
  correção.
- **Por que `-dev.N` no DEV:** é uma *pre-release* válida pela SemVer. Ela
  ordena **antes** de `1.1.0` e deixa claro que não é versão final.
- **Imutabilidade:** em `main`, se a tag `leiloes-service-vX.Y.Z` já existir em
  **outro** commit, o job `versao` falha com "suba a versão no package.json".
  Uma mesma versão nunca aponta para dois códigos diferentes. Isso é o que dá
  sentido ao versionamento.
- **Prefixo `leiloes-service-` na tag:** num monorepo cada serviço tem a sua
  versão; uma tag `v1.1.0` sem prefixo seria ambígua.
- **Alternativa descartada:** semantic-release/Conventional Commits automáticos.
  É mais "mágico", difícil de explicar e depende do padrão de commits do grupo
  inteiro.

### D7. Imagem Docker no GitHub Container Registry (GHCR)

- **O que:** a imagem vai para `ghcr.io/ratzmann/leiloes-service`. O login usa o
  `GITHUB_TOKEN` automático do Actions, com permissão `packages: write` só nesse
  job.
- **Por que GHCR e não Docker Hub:**
  - não precisa criar conta nem guardar senha de outro serviço;
  - a imagem fica ligada ao repositório (label `org.opencontainers.image.source`).
- **Mudanças no Dockerfile:**
  - `npm ci --omit=dev`: build reprodutível, sem dependências de teste;
  - `USER node`: o processo **não roda como root** (se alguém explorar uma
    falha, não ganha root no container);
  - `HEALTHCHECK` no `/health`;
  - `ARG VERSAO_IMAGEM`: o pipeline grava a versão completa (ex.: `1.1.0-dev.14`)
    dentro da imagem, e o serviço mostra essa versão no `/health` e nas métricas;
  - `.dockerignore` deixa testes, cobertura e docs fora da imagem.

### D8. Deploy no Render por *deploy hook* com a imagem exata

- **O que:** dois serviços no Render, `leiloes-service-dev` e
  `leiloes-service-homol`, do tipo **Existing Image** (imagem pronta do GHCR).
  O pipeline:
  1. chama o deploy hook com `imgURL=ghcr.io/ratzmann/leiloes-service:1.1.0-dev.14`;
  2. faz um **smoke test**: consulta `/health` a cada 10 s, por até 10 minutos,
     até a resposta trazer `"versao": "1.1.0-dev.14"`;
  3. se a versão não aparecer, o job falha (deploy não confirmado).
- **Por que imagem pronta, e não o Render buildar o Dockerfile:**
  - o que roda em DEV/HOMOL é **byte a byte** a imagem que passou nos testes;
  - "build once, deploy many": a mesma imagem poderia ir de DEV para HOMOL;
  - assim a "publicação da imagem" (requisito 6) e o deploy (requisito 3) se
    conectam de verdade.
- **Por que conferir a versão no smoke test (e não só "respondeu 200"):** logo
  após o hook, a versão **antiga** ainda está no ar e responderia 200. Comparar
  a versão é a prova de que a versão nova subiu.
- **Por que *GitHub Environments* (`dev`, `homol`):**
  - cada ambiente tem o próprio secret `RENDER_DEPLOY_HOOK_URL` e a própria
    variável `RENDER_URL`;
  - o GitHub mostra o histórico de deploys e o link do ambiente;
  - dá para exigir **aprovação manual** antes do deploy em HOMOL (opcional,
    `GUIA-CONFIGURACAO.md`, etapa 6.2), bom para mostrar na apresentação.
- **Sem o secret do hook:** o deploy é pulado com aviso (mesma lógica do Sonar).

### D9. Banco: `DATABASE_URL` + migração ao iniciar + Neon

- **O que:**
  - `config/db.js` aceita `DATABASE_URL` (+ `DB_SSL=true`) e, sem ela, continua
    com as `DB_*` do docker-compose;
  - `src/db/migrar.js` roda o `init.sql` antes de abrir a porta, com 10
    tentativas a cada 2 s.
- **Por que a migração:** no docker-compose quem cria a tabela é o próprio
  Postgres (`docker-entrypoint-initdb.d`). Num banco gerenciado não existe isso:
  ele chega vazio. Como o `init.sql` é todo `IF NOT EXISTS`, rodar a cada início
  é seguro. As tentativas cobrem o banco ainda subindo (ou "acordando", nos
  planos free).
- **Por que Neon:** Postgres gratuito que **não expira**. Um projeto comporta
  vários bancos, um por ambiente (`leiloes_dev` e `leiloes_homol`). O Postgres
  free do Render expira em 30 dias e só permite um por conta.
- **Database per service continua valendo:** cada ambiente tem o seu banco e só
  o leiloes-service acessa.

### D10. Configuração por ambiente e Swagger só no DEV

- **O que:** `src/config/ambiente.js` lê as variáveis **uma vez** e entrega
  `{ nome, versao, swaggerHabilitado }` ao resto do código.

| Situação | `nome` | Swagger |
|---|---|---|
| `APP_ENV=dev` (Render DEV) | `dev` | **ligado** em `/docs` |
| `APP_ENV=homol` (Render HOMOL) | `homol` | desligado (404) |
| rodando com `npm start` sem `APP_ENV` | `local` | ligado |
| **dentro da imagem sem `APP_ENV`** (esqueceram a variável) | `desconhecido` | **desligado** |
| `SWAGGER_ENABLED=true/false` | — | força ligado/desligado |

- **Por que "fail-closed":** se alguém esquecer `APP_ENV` no HOMOL, o Swagger
  **não** aparece. Na dúvida, desligado. O docker-compose do grupo (T1) cai
  nesse caso, e lá o Swagger fica desligado, o que é correto, pois o Kong nem
  roteia `/docs`.
- **Como o Swagger fica realmente ausente no HOMOL:** a rota `/docs` **nem é
  registrada** (`if (ambiente.swaggerHabilitado)` no `app.js`); não é só
  escondida. Quem acessa recebe o mesmo 404 de qualquer rota inexistente.
- **Swagger escrito à mão** (`src/docs/openapi.js`, OpenAPI 3.0.3), sem
  anotações no código e sem biblioteca de YAML. Documenta todas as rotas, os
  corpos e os códigos de erro (400/404/409/503) com as regras de negócio.
- **`app.js` virou uma fábrica `criarApp(ambiente)`:** os testes criam um app
  "DEV" e um "HOMOL" no mesmo processo e provam que `/docs` responde 200 num e
  404 no outro.

### D11. Validação do leiloeiro fora do Docker Compose

- No Render o leiloes-service sobe **sozinho**, sem o usuarios-service dos
  colegas. O código do T1 já tratava isso: com `USUARIOS_SERVICE_URL` **vazia**,
  a Regra 3 (consultar o leiloeiro) é pulada (`leilaoService.js`,
  `garantirLeiloeiroExiste`).
- **Decisão:** DEV sem a variável, para a demo independente. HOMOL recebe a URL
  do usuarios-service publicado pelo colega, se e quando existir. Não foi
  preciso nenhuma variável nova.

### D12. Métricas Prometheus (`/metrics`)

- **Biblioteca:** `prom-client`, a padrão do ecossistema Node.
- **Métricas expostas:**

| Métrica | Tipo | Para quê |
|---|---|---|
| `leiloes_http_requisicoes_total{metodo,rota,status}` | contador | tráfego e erros |
| `leiloes_http_duracao_segundos{metodo,rota,status}` | histograma | latência (p95) |
| `leiloes_cadastrados_total` | contador | **negócio:** leilões criados |
| `leiloes_mudancas_status_total{status}` | contador | **negócio:** ciclo de vida (Regra 5) |
| `leiloes_process_*`, `leiloes_nodejs_*` | padrão | CPU, memória, event loop, GC |

- Todas as métricas levam os rótulos `service`, `ambiente` e `versao`. O
  Grafana separa DEV/HOMOL/local e mostra **qual versão está em qual ambiente**.
- **Cuidado com cardinalidade:** o rótulo `rota` usa o **padrão** da rota
  (`/leiloes/:id`), nunca a URL real (`/leiloes/42`). Com a URL real, cada id
  viraria uma série nova e o Prometheus "explodiria" (problema clássico).
  Rotas inexistentes viram `nao_encontrada`. Há teste para isso.
- O próprio `/metrics` **não** é contado, para o scrape do Prometheus a cada
  15 s não poluir o gráfico de tráfego.
- **Contadores de negócio no `service`:** só somam depois que o repositório
  gravou. Cadastro recusado não conta (há testes dos dois casos).
- **`/metrics` é público:** expõe só números agregados, sem dado pessoal. Em
  produção real ficaria atrás de rede interna ou autenticação. Ver seção 8.

### D13. Prometheus + Grafana em docker-compose próprio

- **O que:** `leiloes-service/observabilidade/` sobe 4 containers:
  - Postgres;
  - uma cópia **local** do leiloes-service;
  - Prometheus (lê `local`, `dev` e `homol` a cada 15 s);
  - Grafana com datasource e dashboard **provisionados**: sobe pronto, sem
    clicar em nada.
- **Por que local, e não Grafana Cloud:**
  - zero conta extra;
  - a demo funciona mesmo sem internet (alvo `local`);
  - os arquivos de configuração ficam versionados no repositório, o que é
    "infraestrutura como código" para mostrar.
- **Por que uma cópia local do serviço junto:** garante gráficos na
  apresentação mesmo que o Render esteja fora ou "dormindo".
  `gerar-trafego.ps1` movimenta os gráficos com cadastros, aberturas,
  cancelamentos e erros 400/404/409 de propósito.
- **Dashboard "leiloes-service"** (filtro por ambiente no topo):
  - serviço no ar por alvo e versão no ar por ambiente;
  - leilões cadastrados no período e taxa de erro 5xx;
  - requisições/s por rota e respostas por status HTTP;
  - latência p95 e mudanças de status;
  - memória e event loop lag.

### D14. Segurança: Dependabot, secrets e menor privilégio

- **Dependabot** (`.github/dependabot.yml`):
  - npm e Docker do leiloes-service, mais as GitHub Actions;
  - semanal, com PRs para o `develop`, que passam pelo pipeline como qualquer
    mudança;
  - o arquivo é único por repositório, então cada colega acrescenta as próprias
    entradas.
- **Secrets:**

| Nome | Onde | Tipo |
|---|---|---|
| `SONAR_TOKEN` | repositório | secret |
| `SONAR_ORGANIZATION`, `SONAR_PROJECT_KEY` | repositório | variável (não é segredo) |
| `RENDER_DEPLOY_HOOK_URL` | environment `dev` e `homol` | secret (quem tem a URL faz deploy) |
| `RENDER_URL` | environment `dev` e `homol` | variável |
| `DATABASE_URL` | **só no Render** | — nunca passa pelo GitHub |

- **`npm audit` no CI:** o job `ci` falha se houver vulnerabilidade **crítica**
  conhecida nas dependências de produção (as que vão para a imagem). Na revisão
  final, o `npm audit` achou 1 crítica (`proxy-addr`) e 2 moderadas (`qs`), que
  vinham do Express e já existiam na `main`. Foram corrigidas com `npm audit fix`
  (só o `package-lock.json` mudou; 62/62 testes continuam passando).
  O corte é "crítica" e não "qualquer" para um aviso moderado novo não travar a
  entrega; essas o Dependabot resolve por PR.
- **Menor privilégio no workflow:** permissão padrão `contents: read`. Só o job
  `imagem` ganha `packages: write` (publicar) e `contents: write` (criar a tag).
- O `.env.example` perdeu `JWT_SECRET`/`JWT_ISSUER`: o leiloes-service **não**
  usa o segredo (só decodifica o token; quem valida a assinatura é o Kong).
  Menos segredo espalhado.

### D15. Commits e o que **não** foi feito

- Commits pequenos, em português (`feat(leiloes): ...`, `ci(leiloes): ...`),
  sem co-autoria.
- A pasta `coverage/` do leiloes-service é versionada na `main` (herança do T1)
  e os testes a regeram. Ela foi restaurada antes de cada commit, para não
  misturar arquivos gerados no diff. Removê-la do git é uma decisão do grupo.
- Não foram alterados os outros serviços, o Kong nem o `docker-compose.yml` da raiz.

---

## 4. Como cada peça funciona (para explicar)

### 4.1 O pipeline, job a job

1. **`ci`**: checkout com histórico completo → Node 20 com cache do npm →
   `npm ci` → `npm audit` (falha com vulnerabilidade crítica) → `npm test` (falha se algum teste falhar ou a cobertura ficar
   < 50%) → guarda o relatório de cobertura → SonarCloud.
2. **`versao`**: lê o `package.json`, valida o formato `X.Y.Z` e decide as tags
   e o ambiente. Em `main`, confere se a versão já foi publicada. Escreve um
   resumo na página da execução.
3. **`imagem`**: só começa se `ci` **e** `versao` passaram. Build com Buildx e
   cache do GitHub. Em develop/main faz login no GHCR e publica; em main cria a
   tag git.
4. **`deploy-dev`** ou **`deploy-homol`**: dependem da imagem publicada. Rodam
   `ci/deploy-render.sh` dentro do environment certo.

O encadeamento por `needs:` garante que **nada é publicado nem implantado se um
teste falhar**.

### 4.2 Por dentro do serviço (requisição chegando)

```
requisição ─▶ medirRequisicoes (inicia cronômetro)
           ─▶ express.json ─▶ extrairUsuario
           ─▶ /health | /metrics | /docs (só DEV) | /leiloes/... (routes → controller → service → repository)
           ─▶ resposta enviada ─▶ 'finish' ─▶ soma no contador e no histograma com a rota padronizada
```

### 4.3 Inicialização

`server.js` → `carregarAmbiente()` → `migrar()` (cria a tabela, com novas
tentativas) → `criarApp(ambiente).listen(PORT)`. O log mostra, por exemplo,
`leiloes-service 1.1.0-dev.14 (dev) ouvindo na porta 10000 - swagger em /docs`.
O Render define a `PORT` sozinho.

---

## 5. Passo a passo para colocar no ar

O checklist completo, clique a clique, está em
**[`GUIA-CONFIGURACAO.md`](GUIA-CONFIGURACAO.md)**: permissão de admin,
GitHub Actions, GHCR, Neon, Render (DEV e HOMOL), SonarCloud,
secrets/variáveis/environments, Dependabot, proteção de branches, Grafana e
tabela de problemas comuns.

---

## 6. Roteiro de apresentação (≈ 5 min)

1. **Contexto (30 s):** cada aluno tem um pipeline para o próprio serviço. O
   meu é o `leiloes-service`, filtrado por `paths`.
2. **Git Flow (30 s):** mostre os branches e a PR feature → develop. "Toda
   mudança passa por PR; develop vai para DEV e main vai para HOMOL."
3. **Pipeline (1 min 30 s):** abra uma execução no GitHub Actions e mostre o
   grafo `ci → versao → imagem → deploy`.
   - em `ci`: testes e cobertura (falha abaixo de 50%) e o SonarCloud;
   - em `versao`: o resumo com a versão SemVer;
   - em `imagem`: o pacote no GHCR com as tags;
   - em `deploy`: o smoke test esperando a versão nova no `/health`.
4. **Ambientes (1 min):** abra os dois `/health` (versão `1.1.0-dev.N` × `1.1.0`).
   Abra `/docs` no DEV (Swagger) e no HOMOL (404). "Mesma imagem; o que muda é
   a variável `APP_ENV`, e o padrão é desligado se alguém esquecer."
5. **Observabilidade (1 min):** rode `gerar-trafego.ps1` e mostre no Grafana o
   tráfego por rota, os erros 400/404/409, a latência p95, os contadores de
   negócio e a versão de cada ambiente. Explique a rota padronizada (`/leiloes/:id`).
6. **Segurança (30 s):** Dependabot abrindo PR no develop; secrets por
   environment; banco só no Render; container sem root.

## 7. Perguntas prováveis

- **Por que a imagem é gerada no GitHub, e não no Render?** Para implantar a
  mesma imagem que foi testada. Se o Render buildasse, seria outro build, que
  poderia sair diferente.
- **Como você garante que o deploy deu certo?** O smoke test compara a versão
  do `/health` com a tag da imagem. Se em 10 min não bater, o job falha.
- **E se alguém esquecer de subir a versão?** O job `versao` da `main` falha
  antes de publicar, porque a tag git daquela versão já existe em outro commit.
- **Por que o Swagger não fica no HOMOL?** HOMOL simula produção: documentação
  interativa expõe a superfície da API e permite chamadas fáceis. Em DEV ela
  ajuda quem está desenvolvendo.
- **O que é cardinalidade e por que importa?** Cada combinação de rótulos é uma
  série guardada pelo Prometheus. Com a URL real, cada id criaria uma série nova
  sem limite. Usamos o padrão da rota.
- **Por que DEV e HOMOL usam bancos diferentes?** Para isolar: testes em DEV
  não podem sujar os dados de homologação.
- **O Render free "dorme" — e aí?** Após 15 min sem acesso ele hiberna e o
  primeiro acesso demora cerca de 1 min. O smoke test tolera isso, e o
  Prometheus, lendo a cada 15 s, o mantém acordado durante a apresentação.
  **Abra as URLs alguns minutos antes de apresentar.**
- **Por que o pipeline não falha sem Sonar ou Render configurados?** Para o
  código poder subir antes das contas existirem. Os passos aparecem como
  avisos, e build, testes e imagem continuam obrigatórios.

## 8. Limitações conhecidas

- `/metrics` é público nas URLs do Render (só números agregados). Em produção:
  rede interna ou autenticação.
- O Prometheus/Grafana roda na máquina de quem apresenta, não na nuvem.
- O quality gate do Sonar é informativo, não bloqueante.
- O HOMOL só valida o leiloeiro se `USUARIOS_SERVICE_URL` apontar para o
  usuarios-service publicado pelo colega.
- Execução real no GitHub, Render e SonarCloud **não** foi testada (depende das
  contas). O script de deploy foi testado contra um servidor falso, e o
  workflow passou no `actionlint`.

## 9. Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `.github/workflows/leiloes-service.yml` | pipeline CI/CD |
| `.github/dependabot.yml` | atualizações automáticas |
| `leiloes-service/ci/deploy-render.sh` | deploy + smoke test |
| `leiloes-service/sonar-project.properties` | configuração do Sonar |
| `leiloes-service/Dockerfile`, `.dockerignore` | imagem |
| `leiloes-service/src/config/ambiente.js` | dev/homol/local, Swagger, versão |
| `leiloes-service/src/config/db.js`, `src/db/migrar.js` | banco em nuvem e criação da tabela |
| `leiloes-service/src/docs/openapi.js` | especificação do Swagger |
| `leiloes-service/src/observabilidade/metricas.js` | métricas Prometheus |
| `leiloes-service/src/app.js`, `src/server.js` | montagem e inicialização |
| `leiloes-service/observabilidade/` | Prometheus, Grafana, dashboard, gerador de tráfego |
| `leiloes-service/tests/*.test.js` | 96 testes (9 arquivos, depois da integração com o T1) |
| `docs/superpowers/specs/…-design.md`, `docs/superpowers/plans/…md` | spec e plano usados para construir |
