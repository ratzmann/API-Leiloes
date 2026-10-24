# T2 — CI/CD e Observabilidade do `auth-service`

> Documento de estudo para a apresentação. Explica **o que** foi feito, **por que**
> e **como funciona**. O passo a passo das contas externas (feito junto com o usuarios-service) está em
> [`usuarios-service/docs/GUIA-CONFIGURACAO.md`](../../usuarios-service/docs/GUIA-CONFIGURACAO.md).
>
> Escopo: `auth-service` (parte do Lucas, junto com o `usuarios-service`).
> A implementação **espelha a do `leiloes-service`** (Thiago). As explicações
> detalhadas de cada peça comum estão em
> [`leiloes-service/docs/T2-DECISOES.md`](../../leiloes-service/docs/T2-DECISOES.md).
> Aqui ficam só o resumo e o que muda.

---

## 1. Resumo em um minuto

| Requisito do T2 | Onde está | Em uma frase |
|---|---|---|
| 1. Git Flow | branch `feature/auth-usuarios-cicd` → `develop` → `main` | feature → PR → develop (DEV) → PR → main (HOMOL) |
| 2. CI: build, testes, Sonar | `.github/workflows/auth-service.yml`, job `ci` | `npm ci` + `npm audit` + Jest com cobertura mínima de 50% + SonarCloud |
| 3. CD: develop→DEV, main→HOMOL | jobs `deploy-dev` / `deploy-homol` + `ci/deploy-render.sh` | o Render roda **a imagem exata** testada; o pipeline confere a versão no `/health` |
| 4. Swagger só em DEV | `src/config/ambiente.js`, `src/docs/openapi.js`, `src/app.js` | `APP_ENV=dev` → `/docs`; `APP_ENV=homol` → 404 |
| 6. Dockerfile, build, publicação | `Dockerfile`, job `imagem` | build em todo push; publicação no GHCR em develop/main |
| 7. Semantic Versioning | `version` do `package.json` (1.1.0) | imagens `1.1.0-dev.N` (DEV) e `1.1.0` (HOMOL) + tag git `auth-service-v1.1.0` |
| 8. Dependabot + secrets | `.github/dependabot.yml`; secrets nos environments `auth-dev`/`auth-homol` | PRs automáticas de atualização; nenhuma senha no código |
| 9. Prometheus + Grafana | `src/observabilidade/metricas.js` + `observabilidade/` | `/metrics` no serviço; Grafana sobe com dashboard pronto |
| 10. 1 pipeline por serviço | filtro `paths: auth-service/**` | mudança em outro serviço não dispara este pipeline |
| 11. Entregáveis | este documento + `README.md` do serviço | URLs DEV/HOMOL saem da configuração do Render |

**Verificado localmente** (14/10/2026):
- 37 testes passando, cobertura de ~96% sobre os módulos medidos;
- `actionlint` sem erros nos workflows;
- imagem Docker construída: roda como usuário `node`, e sem `APP_ENV` o Swagger fica desligado;
- stack Prometheus + Grafana no ar, com as 10 consultas do dashboard retornando dados;
- teste ponta a ponta do grupo (`testes/testar-tudo.ps1`, 52 passos pelo Kong) **52/52**.

**Depois da integração com a revisão do T1** (15/10/2026, branch
`feature/integracao-revisao-t1`):
- 56 testes unitários passando; a cobertura passou a ser medida sobre **todo o
  `src/`** (critério do T1, mínimo de 50%): 91% de linhas;
- o modo "serviço sozinho" (sem `USUARIOS_SERVICE_URL`) continua valendo: o registro só cria a credencial;
- os erros passam pelo tratamento único do T1 (`middlewares/tratarErros.js`);
- validado também o ponta a ponta do T1 (72 passos) e a coleção Postman.

**Não verificado** (depende das contas): a execução no GitHub Actions, o deploy
no Render e a análise no SonarCloud.

---

## 2. O que é igual ao `leiloes-service`

Tudo o que é infraestrutura foi **copiado sem mudar a lógica**, para que os três
pipelines do grupo funcionem e se expliquem do mesmo jeito:

- workflow com os jobs `ci → versao → imagem → deploy-dev | deploy-homol`;
- regras de versão: trava de versão já publicada na `main` e tags de imagem;
- `ci/deploy-render.sh`: deploy hook com `imgURL` e smoke test no `/health`;
- `src/config/ambiente.js`, `src/config/db.js` (`DATABASE_URL` + `DB_SSL`) e
  `src/db/migrar.js` (migração idempotente com novas tentativas);
- `app.js` como fábrica `criarApp(ambiente)`;
- Dockerfile com `npm ci`, usuário não-root, `HEALTHCHECK` e `VERSAO_IMAGEM`;
- Dependabot (npm + docker) apontando para `develop`;
- estrutura do dashboard do Grafana.

---

## 3. Decisões próprias (o que muda e por quê)

### D1. Environments com prefixo (`auth-dev`, `auth-homol`)

- **O que:** os jobs de deploy usam os environments `auth-dev` e
  `auth-homol`, e não `dev`/`homol`.
- **Por que:** `dev` e `homol` já pertencem ao leiloes-service, e o secret se
  chama `RENDER_DEPLOY_HOOK_URL` em todos. Se dividissem o environment, um
  serviço faria deploy no Render do outro.
- **Alternativa descartada:** secrets com nomes diferentes no mesmo
  environment. Daria certo, mas o script de deploy deixaria de ser idêntico
  entre os serviços.

### D2. SonarCloud: uma organização, um projeto por serviço

- **O que:** `SONAR_TOKEN` e `SONAR_ORGANIZATION` são compartilhados no
  repositório. A chave do projeto vem de `SONAR_PROJECT_KEY_AUTH`.
- **Por que:** variáveis do repositório valem para todos os workflows. Uma
  organização só (a do dono do repo) com um projeto por serviço evita que um
  pipeline sobrescreva a configuração do outro.

### D3. Métricas de negócio

| Métrica | Rótulo | Quando soma |
|---|---|---|
| `auth_registros_total` | `papel` = `LEILOEIRO` \| `LICITANTE` | registro gravado com sucesso |
| `auth_logins_total` | `resultado` = `sucesso` \| `falha` | login aceito, ou recusado por credencial ou dados inválidos |

- Erro de infraestrutura (banco fora do ar) **não** conta como "falha de
  login". Senão o gráfico confundiria indisponibilidade com senha errada.
- O painel "Logins (sucesso x falha)" ajuda a ver problema de uso e também
  tentativa de força bruta (muitas falhas seguidas).
- As séries já nascem com zero para cada valor conhecido do rótulo
  (`comecarEmZero`). Sem isso, o `increase()` do Prometheus não conta o primeiro
  incremento de uma série nova, e os painéis "no período" mostrariam 0 num
  serviço recém-iniciado.

### D3b. `/health` sai das rotas e a migração passa a existir

- No T1, o `/health` do auth ficava no `authRoutes`. Ele foi para o `app.js`,
  como no leiloes, e passou a devolver versão e ambiente. Pelo Kong continua
  em `/auth/health`.
- O auth não tinha `migrar.js`: dependia do `init.sql` do docker-compose. No
  Render o banco chega vazio, então o serviço passa a criar a tabela ao iniciar.

### D4. Portas da stack de observabilidade

| Stack | Serviço | Prometheus | Grafana |
|---|---|---|---|
| leiloes | 3003 | 9090 | 3000 |
| **auth** | **3001** | **9091** | **3011** |
| usuarios | 3002 | 9092 | 3012 |

Com portas diferentes, as três stacks sobem juntas na apresentação.

### D5. Relatórios de cobertura fora do git

`coverage/` já estava no `.gitignore`, mas os arquivos tinham sido versionados
no T1 e mudavam a cada `npm test`. Eles saíram do git. O CI guarda o relatório
como artefato do job.

---

## 4. Como funciona (resumo)

```
 push develop ─▶ ci ─▶ versao (1.1.0-dev.N) ─▶ imagem ─▶ GHCR :1.1.0-dev.N, :dev
                                                     └─▶ deploy-dev (environment auth-dev)
                                                           └─▶ Render auth-service-dev
                                                                 APP_ENV=dev  → Swagger em /docs
 push main    ─▶ ci ─▶ versao (1.1.0)       ─▶ imagem ─▶ GHCR :1.1.0, :homol, :latest + tag git
                                                     └─▶ deploy-homol (environment auth-homol)
                                                           └─▶ Render auth-service-homol
                                                                 APP_ENV=homol → /docs dá 404
```

Requisição chegando: métricas (início do cronômetro) → `express.json` → rota
(`/registrar`, `/login`) → no fim da resposta, soma em
`auth_http_requisicoes_total` e `auth_http_duracao_segundos`. URL desconhecida
vira a rota `nao_encontrada`, para não criar uma série por URL.

Registro: grava a credencial → chama `USUARIOS_SERVICE_URL` para criar o perfil
(se falhar, a credencial fica e o perfil volta `null`) → emite o JWT.

Inicialização: `migrar()` roda o `init.sql` (tudo `IF NOT EXISTS`), com até 10
tentativas; só então a porta abre.

---

## 5. Roteiro de apresentação (≈ 3 min)

1. **Pipeline:** abrir uma execução do `auth-service` e mostrar os jobs, a versão e a imagem.
2. **DEV x HOMOL:** `/docs` no DEV (Swagger) e no HOMOL (404); `/health` nos dois.
3. **Integração na nuvem:** registrar um licitante no auth DEV pelo Swagger e
   mostrar o perfil criado no usuarios DEV.
4. **Grafana** (`http://localhost:3011`): rodar `gerar-trafego.ps1` e mostrar
   registros e logins (sucesso x falha).

---

## 6. Limitações conhecidas

- `/metrics` é público no Render (só números agregados).
- O Prometheus e o Grafana rodam na máquina de quem apresenta.
- O quality gate do Sonar é informativo, não bloqueante.
- O `JWT_SECRET` precisa ser o mesmo em todos os serviços do ambiente; isso é
  configurado à mão no Render.
- A execução real no GitHub, no Render e no SonarCloud não foi testada aqui.

---

## 7. Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `.github/workflows/auth-service.yml` | pipeline |
| `ci/deploy-render.sh` | deploy + smoke test |
| `Dockerfile`, `.dockerignore`, `.gitattributes` | imagem |
| `sonar-project.properties` | escopo da análise e da cobertura |
| `src/config/ambiente.js` | local/dev/homol, Swagger e versão |
| `src/config/db.js`, `src/db/migrar.js` | banco em nuvem e migração |
| `src/docs/openapi.js` | especificação do Swagger |
| `src/observabilidade/metricas.js` | métricas Prometheus |
| `observabilidade/` | Prometheus + Grafana + gerador de tráfego |
| `tests/ambiente,app,db,migrar,metricas.test.js` | testes do T2 |
