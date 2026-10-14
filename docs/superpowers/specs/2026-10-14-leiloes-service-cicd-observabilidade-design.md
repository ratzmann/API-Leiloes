# T2 — CI/CD e Observabilidade do `leiloes-service` (design)

Data: 2026-10-14 · Autor do serviço: Thiago (leiloes-service)

## 1. Objetivo e escopo

O enunciado do T2 ("CI/CD e Observabilidade") pede, por aluno, **um microsserviço
com pipeline próprio**. Este design cobre **somente o `leiloes-service`**. Os
outros serviços (auth, usuarios, lances) ficam com os colegas e não são alterados.

Requisitos do enunciado → como cada um é atendido:

| # | Requisito | Atendimento |
|---|---|---|
| 1 | Git Flow: `main` (homol), `develop` (dev), `feature/*` | branches `develop` e `feature/leiloes-service-cicd`; PR feature→develop→main |
| 2 | CI no GitHub Actions: build, testes, SonarQube/SonarCloud | workflow `.github/workflows/leiloes-service.yml`, job `ci` |
| 3 | CD: develop→DEV, main→HOMOL, Render | jobs `deploy-dev` e `deploy-homol` (deploy hook do Render com a imagem exata) |
| 4 | DEV com Swagger; HOMOL sem Swagger | `APP_ENV` decide; `/docs` só existe em DEV |
| 6 | Dockerfile, build automático, publicação da imagem | job `imagem`: build sempre, push no GHCR em develop/main |
| 7 | Semantic Versioning | versão do `package.json`; tags de imagem e tag git `leiloes-service-vX.Y.Z` |
| 8 | Dependabot + secrets do GitHub | `.github/dependabot.yml`; secrets em *Environments* `dev`/`homol` |
| 9 | Prometheus + Grafana | `/metrics` (prom-client) + stack em `leiloes-service/observabilidade/` com dashboard provisionado |
| 10 | 1 pipeline por serviço | workflow com filtro `paths: leiloes-service/**` |
| 11 | Entregáveis: repo, pipeline, URLs, dashboards, README | README do serviço + `docs/T2-DECISOES.md` |

Fora do escopo: pipelines dos colegas, alterações no Kong, mudança de regras de
negócio do leilão.

## 2. Base de código

A base é a `main` (pedido explícito). O branch remoto
`docs/comentarios-apresentacao` não é usado.

## 3. Arquitetura

```
feature/*  ──PR──▶  develop  ──PR──▶  main
   │                   │                │
   ▼                   ▼                ▼
  [ci]           [ci]→[imagem]→[deploy-dev]     [ci]→[versao]→[imagem]→[deploy-homol]
                       │            │                    │           │
                       ▼            ▼                    ▼           ▼
                 GHCR :X.Y.Z-dev.N  Render DEV     GHCR :X.Y.Z     Render HOMOL
                                    (Swagger on)   tag git          (Swagger off)

Render DEV/HOMOL ──/metrics──▶ Prometheus ──▶ Grafana (dashboard provisionado)
       │
       └──▶ Postgres gerenciado (Neon: bancos leiloes_dev e leiloes_homol)
```

### 3.1 Workflow `leiloes-service.yml`

Gatilhos: `push` em `main`, `develop`, `feature/**` e `pull_request` para
`main`/`develop`, sempre filtrados por `leiloes-service/**` e pelo próprio
arquivo do workflow; também `workflow_dispatch`.

Jobs:

1. **`ci`**: checkout (fetch-depth 0), Node 20, `npm ci`, `npm test`
   (Jest com cobertura `lcov`, mínimo de 50% garantido por `coverageThreshold`),
   depois SonarCloud (`SonarSource/sonarqube-scan-action@v7`, `projectBaseDir:
   leiloes-service`). Se o secret `SONAR_TOKEN` não existir, a análise é pulada
   com um aviso (o pipeline não quebra antes de a conta existir).
2. **`versao`**: lê `version` do `package.json`, valida o formato SemVer e
   calcula as tags. Em `main`, se a tag git `leiloes-service-vX.Y.Z` já existir
   em **outro** commit, falha com a mensagem "atualize a versão" (garante que
   cada versão publicada é imutável). Saídas: `versao`, `tag_imagem`.
3. **`imagem`**: build da imagem com Buildx em todo evento (valida o Dockerfile).
   Push no GHCR (`ghcr.io/<dono>/leiloes-service`) só em push para
   `develop`/`main`:
   - develop: `X.Y.Z-dev.<run_number>`, `dev`, `sha-<curto>`;
   - main: `X.Y.Z`, `homol`, `latest`, `sha-<curto>`.
   Em main, cria a tag git `leiloes-service-vX.Y.Z`.
4. **`deploy-dev`** (develop) / **`deploy-homol`** (main): usam o *GitHub
   Environment* `dev`/`homol`. Chamam o deploy hook do Render com
   `imgURL=<imagem:tag>` (deploya exatamente a imagem testada) e depois fazem
   um *smoke test*: consultam `<URL>/health` até a resposta trazer a versão
   esperada (timeout 10 min). Sem o secret do hook, o job é pulado com aviso.

Permissões mínimas: `contents: read` por padrão; `packages: write` só no job
`imagem`; `contents: write` só para criar a tag em main.

### 3.2 Configuração por ambiente (`src/config/ambiente.js`)

Lê as variáveis de ambiente **uma vez** e expõe:

| Campo | Variável | Padrão |
|---|---|---|
| `nome` | `APP_ENV` | `local` |
| `versao` | (package.json) | — |
| `swaggerHabilitado` | `SWAGGER_ENABLED` (`true`/`false`) | `true` se `APP_ENV` for `local` ou `dev`; `false` em qualquer outro (fail-closed) |
| `validarLeiloeiro` | `VALIDAR_LEILOEIRO` | `true` |

`VALIDAR_LEILOEIRO=false` existe porque, no Render, o `leiloes-service` sobe
sozinho (sem o `usuarios-service` dos colegas). No DEV ele pode ser desligado
para a demonstração; no HOMOL o padrão é validar (com `USUARIOS_SERVICE_URL`
apontando para o usuarios-service publicado, quando existir). Quando desligado,
a Regra 3 é pulada e o serviço registra um aviso no log.

### 3.3 Banco de dados

- `config/db.js` aceita `DATABASE_URL` (string de conexão do provedor) e
  `DB_SSL=true`; sem ela, continua usando `DB_HOST`/`DB_PORT`/... (Docker Compose
  inalterado).
- `src/db/migrar.js` executa o `init.sql` (idempotente, `IF NOT EXISTS`) ao
  iniciar, com 10 tentativas a cada 2 s. Necessário porque no Render não há o
  `docker-entrypoint-initdb.d` do Postgres local.
- Provedor recomendado: **Neon** (free, não expira; um projeto com dois bancos
  `leiloes_dev` e `leiloes_homol`). O Postgres free do Render serve, mas expira
  em 30 dias e permite um só por conta.

### 3.4 Swagger (somente DEV)

- `swagger-ui-express` + especificação OpenAPI 3 escrita à mão em
  `src/docs/openapi.js` (sem dependência de YAML).
- Rotas `/docs` (UI) e `/docs/openapi.json`, montadas **apenas** quando
  `swaggerHabilitado`. Em HOMOL, `/docs` cai no 404 padrão.

### 3.5 Métricas (`src/observabilidade/metricas.js`)

`prom-client` com registro próprio e labels padrão `service="leiloes-service"`,
`ambiente=<APP_ENV>`, `versao=<X.Y.Z>`:

- métricas padrão do Node (CPU, memória, event loop, GC) com prefixo `leiloes_`;
- `leiloes_http_requisicoes_total{metodo,rota,status}` (contador);
- `leiloes_http_duracao_segundos{metodo,rota,status}` (histograma);
- `leiloes_cadastrados_total` (contador de negócio);
- `leiloes_mudancas_status_total{status}` (contador de negócio).

A label `rota` usa o **padrão** da rota (`/leiloes/:id`), não a URL real, para
não explodir a cardinalidade; rota inexistente vira `nao_encontrada`. O próprio
`/metrics` não é contado. Endpoint `GET /metrics` (texto Prometheus).

### 3.6 Stack de observabilidade (`leiloes-service/observabilidade/`)

`docker-compose.yml` próprio com:

- `leiloes-db` + `leiloes-service` (build local, `APP_ENV=local`) — permite a
  demo mesmo sem internet;
- `prometheus` (scrape a cada 15 s: `local`, `dev` e `homol`; os dois últimos via
  HTTPS nas URLs do Render);
- `grafana` com datasource e dashboard **provisionados** (sobe pronto);
- script `gerar-trafego.ps1` para movimentar os gráficos na apresentação.

Dashboard "leiloes-service": serviço no ar (`up`) por ambiente, requisições/s
por rota, taxa de erro 5xx, latência p95, leilões cadastrados, mudanças de
status, memória e event loop lag. Variável `ambiente` para filtrar.

### 3.7 Docker

Dockerfile: `npm ci --omit=dev`, usuário não-root `node`, `HEALTHCHECK` em
`/health`, copia `src/` e `package.json` (a versão é lida dele). `.dockerignore`
para não levar `node_modules`, `coverage`, `tests`.

### 3.8 `/health`

Passa a devolver `{ status, service, versao, ambiente }`; é o que o Render usa
como health check e o que o smoke test do pipeline confere.

### 3.9 Segurança

- `.github/dependabot.yml`: `npm` e `docker` em `/leiloes-service`,
  `github-actions` em `/`, semanal, `target-branch: develop`.
- Secrets: `SONAR_TOKEN` (repositório); `RENDER_DEPLOY_HOOK_URL` (um por
  Environment). Variáveis não secretas: `SONAR_ORGANIZATION`,
  `SONAR_PROJECT_KEY` (repositório), `RENDER_URL` (por Environment).
- Credenciais do banco ficam só no Render (nunca no GitHub nem no repositório).

### 3.10 Restrições conhecidas (decididas)

- **Acesso do Render à imagem**: o pacote no GHCR pertence ao dono do
  repositório (`ratzmann`). Caminho 1: o dono torna o pacote público. Caminho 2
  (não depende de ninguém): no Render, cadastrar uma *Registry Credential* com um
  PAT do Thiago com escopo `read:packages`. O `imgURL` do deploy hook só pode
  trocar a **tag**; o resto da URL tem que ser igual à imagem configurada no
  serviço do Render.
- **Plano free do Render** "dorme" após 15 min sem tráfego; o primeiro acesso
  leva ~1 min. O scrape do Prometheus a cada 15 s o mantém acordado durante a
  apresentação. O smoke test tolera isso (timeout de 10 min).
- **`/metrics` público**: aceitável para o trabalho (só números agregados, sem
  dados pessoais); em produção ficaria atrás do gateway ou de autenticação.

## 4. Tratamento de erros

- Falha de banco no boot: `migrar` tenta 10 vezes; esgotou → `exit 1` (o Render
  reinicia o container e mostra o erro no log).
- Pipeline sem secrets: os passos de Sonar e deploy são pulados com `::warning::`,
  sem falhar; build, testes e imagem continuam obrigatórios.
- Versão repetida em main: `versao` falha antes de publicar a imagem.
- Smoke test sem a versão esperada em 10 min: o deploy falha.

## 5. Testes

Jest + supertest (já no projeto):

- `ambiente.test.js`: padrões e overrides de `APP_ENV`, `SWAGGER_ENABLED`,
  `VALIDAR_LEILOEIRO`;
- `app.test.js`: `/health` com versão e ambiente; `/docs` 200 em DEV e 404 em
  HOMOL; `/metrics` com as métricas e a rota padronizada;
- `metricas.test.js`: contadores de negócio e normalização da rota;
- `db.test.js`: escolha entre `DATABASE_URL` e `DB_*`, SSL;
- `migrar.test.js`: retry e desistência;
- `leilaoService.test.js`: casos novos de `validarLeiloeiro=false` e incremento
  dos contadores.

`coverageThreshold` global de 50% (exigência do T1) passa a ser verificado no CI.
`collectCoverageFrom` inclui os módulos novos.

## 6. Entrega e git

- Branches locais `develop` (criado a partir da `main`) e
  `feature/leiloes-service-cicd`. **Nada é enviado ao GitHub automaticamente**:
  o push e os PRs ficam documentados para o Thiago executar.
- Commits pequenos, mensagens em português, sem co-autoria.
- Documento final `leiloes-service/docs/T2-DECISOES.md`: decisões e motivos,
  como cada peça funciona, passo a passo de configuração (GHCR, Render, Neon,
  SonarCloud, secrets) e roteiro de apresentação.
