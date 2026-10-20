# T2 — CI/CD e Observabilidade do `auth-service` e do `usuarios-service` (design)

Data: 2026-10-14 · Autor dos serviços: Lucas (auth-service e usuarios-service)

## 1. Objetivo e escopo

Aplicar ao `auth-service` e ao `usuarios-service` **o mesmo pacote de T2** que o
Thiago entregou no `leiloes-service`
([design dele](2026-10-14-leiloes-service-cicd-observabilidade-design.md)). A
regra é **espelhar**: mesma estrutura de pastas, mesmos nomes de arquivo, mesmo
pipeline e mesmas decisões. O que muda está descrito na seção 3, junto com o motivo.

Requisitos do enunciado e como cada um é atendido (vale para os dois serviços;
`<s>` é `auth-service` ou `usuarios-service`, e `<p>` é `auth` ou `usuarios`):

| # | Requisito | Atendimento |
|---|---|---|
| 1 | Git Flow | `feature/auth-usuarios-cicd` → PR → `develop` → PR → `main` |
| 2 | CI: build, testes, SonarCloud | `.github/workflows/<s>.yml`, job `ci` (`npm ci`, `npm audit`, Jest com cobertura ≥ 50%, Sonar) |
| 3 | CD develop→DEV, main→HOMOL, Render | jobs `deploy-dev` / `deploy-homol` + `<s>/ci/deploy-render.sh` (deploy hook com a imagem exata + smoke test no `/health`) |
| 4 | Swagger só em DEV | `APP_ENV` decide; `/docs` só existe em `local`/`dev` |
| 6 | Dockerfile, build, publicação | job `imagem`: build sempre; push no GHCR em develop/main |
| 7 | SemVer | `version` do `package.json` → **1.1.0**; imagens `1.1.0-dev.N` / `1.1.0`; tag git `<s>-v1.1.0` |
| 8 | Dependabot + secrets | entradas npm e docker para os dois serviços em `.github/dependabot.yml`; secrets em *Environments* |
| 9 | Prometheus + Grafana | `/metrics` (prom-client) + stack em `<s>/observabilidade/` com dashboard provisionado |
| 10 | 1 pipeline por serviço | dois workflows, cada um com filtro `paths: <s>/**` |
| 11 | Entregáveis | README de cada serviço + `<s>/docs/T2-DECISOES.md`; um `GUIA-CONFIGURACAO.md` para os dois, em `usuarios-service/docs/` |

Fora do escopo: `leiloes-service` e `lances-service`, o Kong, o
`docker-compose.yml` raiz, as regras de negócio e as PRs do Dependabot já abertas.

## 2. Base de código

O branch `feature/auth-usuarios-cicd` sai de `develop` (que hoje é igual a
`main`). Push e PRs ficam a cargo do Lucas.

## 3. Arquitetura (por serviço)

### 3.1 Workflows `auth-service.yml` e `usuarios-service.yml`

Os dois são cópias de `leiloes-service.yml`, com os mesmos jobs `ci → versao →
imagem → deploy-dev | deploy-homol`, as mesmas regras de tag e a mesma trava de
versão já publicada em `main`. As diferenças são estas:

- `SERVICO`, `paths`, `working-directory`, `context`, artefato de cobertura e
  escopo de cache (`scope=<s>`) são do próprio serviço.
- **Environments com prefixo:** `auth-dev`, `auth-homol`, `usuarios-dev` e
  `usuarios-homol`. Os environments `dev` e `homol` já pertencem ao leiloes, e
  o secret `RENDER_DEPLOY_HOOK_URL` tem o mesmo nome em todos. Se os serviços
  dividissem o environment, um sobrescreveria o hook do outro.
- **Sonar:** usa o secret `SONAR_TOKEN` e a variável `SONAR_ORGANIZATION`, que
  são compartilhados no repositório, e a chave do projeto vem de
  `SONAR_PROJECT_KEY_AUTH` / `SONAR_PROJECT_KEY_USUARIOS`. Sem configuração, a
  análise é pulada com *warning*, como no leiloes.

### 3.2 Configuração por ambiente (`src/config/ambiente.js`)

É uma cópia do leiloes: `APP_ENV` (`local` | `dev` | `homol`), `SWAGGER_ENABLED`
para forçar ligado ou desligado, e `VERSAO_IMAGEM` (gravada no build) com o
`package.json` como fallback. Sem `APP_ENV` dentro da imagem, o ambiente é
`desconhecido` e o Swagger fica desligado.

### 3.3 Banco de dados

- `src/config/db.js` aceita `DATABASE_URL` + `DB_SSL` (Neon), mantendo as
  variáveis `DB_*` do docker-compose, e exporta `opcoesDeConexao`.
- `src/db/migrar.js`:
  - **auth:** o arquivo é novo, e o `server.js` passa a migrar antes de abrir a porta;
  - **usuarios:** o arquivo já existe e ganha o parâmetro `banco` (injeção, para testar), como no leiloes.
- Os bancos no Neon são `auth_dev`, `auth_homol`, `usuarios_dev` e `usuarios_homol`.

### 3.4 `app.js` como fábrica + Swagger

`criarApp(ambiente)` substitui o `app` singleton. A ordem dos middlewares é a do
leiloes: métricas → json → (`extrairUsuario` no usuarios) → `/health` →
`/metrics` → `/docs` (se habilitado) → rotas → 404.

- O `/health` passa a devolver `{ status, service, versao, ambiente }`. No auth,
  ele sai do `authRoutes` e vai para o `app.js`, como no leiloes.
- O OpenAPI é escrito à mão em `src/docs/openapi.js`:
  - **auth:** `POST /registrar`, `POST /login`, `GET /health`;
  - **usuarios:** CRUD de `/leiloeiros` e `/licitantes`, mais `credito` e `reservas`.

### 3.5 Métricas (`src/observabilidade/metricas.js`)

A estrutura é a mesma do leiloes: um registro próprio, métricas padrão do Node
com prefixo `<p>_`, `<p>_http_requisicoes_total` e
`<p>_http_duracao_segundos` (com rótulos `metodo`/`rota`/`status`, usando o
padrão da rota), rótulos fixos `service`/`ambiente`/`versao`, e o próprio
`/metrics` fora da contagem.

Métricas de negócio:

| Serviço | Métrica | Rótulos | Onde é incrementada |
|---|---|---|---|
| auth | `auth_registros_total` | `papel` | `authService.registrar` (sucesso) |
| auth | `auth_logins_total` | `resultado` = `sucesso` \| `falha` | `authService.login` |
| usuarios | `usuarios_cadastros_total` | `tipo` = `leiloeiro` \| `licitante` | `cadastrar` dos services |
| usuarios | `usuarios_reservas_credito_total` | `operacao` = `reservada` \| `liberada` | `creditoService` (reserva nova / liberação) |

### 3.6 Stack de observabilidade (`<s>/observabilidade/`)

É uma cópia da pasta do leiloes: banco + cópia local do serviço + Prometheus +
Grafana (anônimo como Viewer, dashboard como home), alvos local/DEV/HOMOL em
`prometheus.yml` e `gerar-trafego.ps1`. O dashboard segue o JSON do leiloes,
trocando prefixos e painéis de negócio.

As **portas de host** são diferentes, para poder subir junto com a stack do leiloes:

| Stack | Serviço | Prometheus | Grafana |
|---|---|---|---|
| leiloes (existente) | 3003 | 9090 | 3000 |
| auth | 3001 | 9091 | 3011 |
| usuarios | 3002 | 9092 | 3012 |

A cópia local do auth roda sem `USUARIOS_SERVICE_URL`. O registro funciona e o
perfil fica nulo, que é o comportamento que já existe.

### 3.7 Docker

O Dockerfile fica igual ao do leiloes: `npm ci --omit=dev`, `USER node`,
`ARG/ENV VERSAO_IMAGEM`, `HEALTHCHECK` com wget no `/health` e a porta própria.
Também entram `.dockerignore` e `.gitattributes` (`*.sh eol=lf`).

### 3.8 Configuração no Render (documentada no guia, sem código)

- O `JWT_SECRET` precisa ser **igual** em auth, usuarios, leiloes e lances
  dentro do mesmo ambiente. O auth assina o token e os outros decodificam.
- O `USUARIOS_SERVICE_URL` do auth aponta para o usuarios do mesmo ambiente.
- O `USUARIOS_SERVICE_URL` do leiloes, em DEV e HOMOL, pode passar a apontar
  para o usuarios publicado. Isso é para o Thiago configurar.

### 3.9 Restrições conhecidas (as mesmas do leiloes)

- `/metrics` fica público no Render.
- O Prometheus e o Grafana rodam na máquina de quem apresenta.
- O quality gate do Sonar é informativo.
- Sem o Kong na nuvem, o usuarios no Render aceita chamadas sem JWT. Isso já
  era assim por design ("a validação é do Kong"). Fica documentado como limitação.

## 4. Tratamento de erros

É o mesmo do leiloes:
- a migração tenta 10 vezes com intervalo de 2 s e, se esgotar, o processo sai com código 1;
- o deploy sem secret dá *warning* e é pulado;
- sem `RENDER_URL`, o smoke test é pulado;
- se a versão não aparecer no `/health` a tempo, o job falha;
- em `main`, uma versão já publicada falha o job `versao`.

## 5. Testes

Cada serviço ganha os mesmos testes do leiloes, adaptados:
- `ambiente.test.js`;
- `app.test.js`, com supertest: `/health` com versão, `/metrics`, `/docs` em DEV e 404 em HOMOL;
- `db.test.js`, `migrar.test.js` e `metricas.test.js`;
- testes de service cobrindo os incrementos de métrica.

O `collectCoverageFrom` e o `coverageThreshold` (50%) passam a ser iguais aos
do leiloes. O `sonar.coverage.exclusions` segue o mesmo escopo.

Verificação local antes de entregar:
- `npm test` nos dois serviços;
- `actionlint` nos dois workflows;
- `docker build` das duas imagens;
- `deploy-render.sh` contra um Render falso;
- as duas stacks de observabilidade no ar, com os painéis respondendo;
- `testes/testar-tudo.ps1` continuando 52/52 pelo compose raiz.

## 6. Entrega e git

- Commits pequenos e convencionais (`feat(auth)`, `ci(usuarios)`, `docs(auth)`…)
  no branch `feature/auth-usuarios-cicd`.
- Sem push. O passo a passo de push, PRs, environments, Neon, Render e Sonar
  fica em `usuarios-service/docs/GUIA-CONFIGURACAO.md`, um guia só para os dois
  serviços, porque eles são configurados juntos (mesmo Neon, mesma organização no Sonar).
