# T2 — CI/CD e Observabilidade do `lances-service`

> Documento de estudo para a apresentação. Explica **o que** foi feito, **por que**
> e **como funciona**. O passo a passo das contas externas está em
> [`GUIA-CONFIGURACAO.md`](GUIA-CONFIGURACAO.md).
>
> Escopo: `lances-service` (parte do Anderson). A implementação **espelha a do
> `leiloes-service`** (Thiago) e a do `usuarios-service`/`auth-service` (Lucas).
> As explicações detalhadas de cada peça comum estão em
> [`leiloes-service/docs/T2-DECISOES.md`](../../leiloes-service/docs/T2-DECISOES.md).
> Aqui ficam só o resumo e o que muda.

---

## 1. Resumo em um minuto

| Requisito do T2 | Onde está | Em uma frase |
|---|---|---|
| 1. Git Flow | branch `feature/lances-service-cicd` → `develop` → `main` | feature → PR → develop (DEV) → PR → main (HOMOL) |
| 2. CI: build, testes, Sonar | `.github/workflows/lances-service.yml`, job `ci` | `npm ci` + `npm audit` + Jest com cobertura mínima de 50% + SonarCloud |
| 3. CD: develop→DEV, main→HOMOL | jobs `deploy-dev` / `deploy-homol` + `ci/deploy-render.sh` | o Render roda **a imagem exata** testada; o pipeline confere a versão no `/health` |
| 4. Swagger só em DEV | `src/config/ambiente.js`, `src/docs/openapi.js`, `src/app.js` | `APP_ENV=dev` → `/docs`; `APP_ENV=homol` → 404 |
| 6. Dockerfile, build, publicação | `Dockerfile`, job `imagem` | build em todo push; publicação no GHCR em develop/main |
| 7. Semantic Versioning | `version` do `package.json` (1.1.0) | imagens `1.1.0-dev.N` (DEV) e `1.1.0` (HOMOL) + tag git `lances-service-v1.1.0` |
| 8. Dependabot + secrets | `.github/dependabot.yml`; secrets nos environments `lances-dev`/`lances-homol` | PRs automáticas de atualização; nenhuma senha no código |
| 9. Prometheus + Grafana | `src/observabilidade/metricas.js` + `observabilidade/` | `/metrics` no serviço; Grafana sobe com dashboard pronto |
| 10. 1 pipeline por serviço | filtro `paths: lances-service/**` | mudança em outro serviço não dispara este pipeline |
| 11. Entregáveis | este documento + `README.md` do serviço | URLs DEV/HOMOL saem da configuração do Render |

**Verificado localmente** (15/10/2026):
- 90 testes unitários passando (eram 57), cobertura de 82% de linhas sobre todo o `src/`;
- `npm ci` + `npm audit --omit=dev --audit-level=critical`: nenhuma vulnerabilidade;
- imagem Docker construída: roda como usuário `node`, com a versão 1.1.0 e só
  `src/` + dependências de produção;
- workflow gerado a partir do `usuarios-service.yml` (que roda verde no GitHub):
  o `diff` mostra que só os nomes mudam; YAML do workflow e do Dependabot válidos;
- `gerar-trafego.ps1` contra o sistema completo, 4 rodadas: 12 lances gravados;
  sagas CONCLUIDA 8, CONCLUIDA_COM_PENDENCIA 4, COMPENSADA 4 e FALHOU 16;
  4 reprocessamentos resolvidos; rotas padronizadas nas métricas HTTP;
- ponta a ponta do grupo (`testes/testar-tudo.ps1`, 72 passos pelo Kong): **72/72**;
- stack Prometheus + Grafana no ar sobre o sistema completo: alvo `local` **UP**
  (`dev`/`homol` ficam *down* até os serviços existirem no Render), as **10
  consultas do dashboard retornando dados** e o painel conferido no navegador
  ("Sagas por status": concluídas, falhas, compensadas e com pendência).

**Não verificado** (depende das contas): a execução no GitHub Actions, o deploy
no Render e a análise no SonarCloud.

---

## 2. O que é igual aos outros serviços

Tudo o que é infraestrutura foi **copiado sem mudar a lógica**, para que os
quatro pipelines do grupo funcionem e se expliquem do mesmo jeito:

- workflow com os jobs `ci → versao → imagem → deploy-dev | deploy-homol`;
- regras de versão: trava de versão já publicada na `main` e tags de imagem;
- `ci/deploy-render.sh`: deploy hook com `imgURL` e smoke test no `/health`;
- `src/config/ambiente.js`, `src/config/db.js` (`DATABASE_URL` + `DB_SSL`) e
  `src/db/migrar.js` (migração idempotente com novas tentativas), idênticos nos 4;
- `app.js` como fábrica `criarApp(ambiente)`, com `lembrarPrefixo` nas métricas;
- Dockerfile com `npm ci`, usuário não-root, `HEALTHCHECK` e `VERSAO_IMAGEM`;
- Dependabot (npm + docker) apontando para `develop`;
- estrutura do dashboard do Grafana.

---

## 3. Decisões próprias (o que muda e por quê)

### D1. Environments com prefixo (`lances-dev`, `lances-homol`)

Mesmo motivo do usuarios: `dev`/`homol` são do leiloes-service e o secret se
chama `RENDER_DEPLOY_HOOK_URL` em todos. Environments próprios evitam que um
serviço faça deploy no Render do outro. A chave do Sonar vem de
`SONAR_PROJECT_KEY_LANCES`.

### D2. Métricas de negócio vêm da Saga

| Métrica | Rótulo | Quando soma |
|---|---|---|
| `lances_registrados_total` | — | lance gravado (passo 3 da Saga concluído) |
| `lances_sagas_total` | `status` = `CONCLUIDA` \| `CONCLUIDA_COM_PENDENCIA` \| `FALHOU` \| `COMPENSADA` \| `FALHOU_COMPENSACAO` | toda saga que termina, pelo status final |
| `lances_sagas_reprocessadas_total` | `resultado` = `resolvida` \| `pendente` | cada reprocessamento do passo 4 |

- A contagem acontece em `sagas/registrarLanceSaga.js`, **depois** de a saga ser
  gravada com o status final.
- Recusas da autorização (403 de quem não é licitante) não criam saga, então não
  entram em `lances_sagas_total`; aparecem nas métricas HTTP.
- O painel "Sagas por status" mostra o padrão Saga funcionando: quantas
  terminaram bem, quantas foram compensadas e quantas ficaram com pendência.

### D3. A observabilidade usa o sistema completo

- **O que:** a pasta `observabilidade/` sobe **só** Prometheus e Grafana. O
  Prometheus entra na rede do sistema completo (`leilao-net`, do
  `docker-compose.yml` da raiz) e lê o `lances-service` de lá.
- **Por que:** os outros serviços funcionam sozinhos, por isso as stacks deles
  sobem uma cópia própria do serviço. O lances não: sem o leiloes e o usuarios,
  todo lance dá 503 e o painel ficaria só com erros. Com o sistema completo, o
  `gerar-trafego.ps1` faz o caminho de um usuário real pelo Kong (registro,
  leilão, lances) e passa por todos os caminhos da Saga.
- **Consequência:** a rede da raiz ganhou o nome fixo `leilao-net`. Antes o nome
  dependia da pasta do projeto (`api-leiloes_leilao-net`).
- **Alternativa descartada:** subir uma cópia do leiloes e do usuarios dentro da
  stack do lances. Funcionaria, mas seriam 3 serviços e 3 bancos a mais e
  portas extras, só para a observabilidade.

### D4. Portas da stack de observabilidade

| Stack | Prometheus | Grafana |
|---|---|---|
| leiloes | 9090 | 3000 |
| auth | 9091 | 3011 |
| usuarios | 9092 | 3012 |
| **lances** | **9093** | **3013** |

Com portas diferentes, as quatro stacks sobem juntas na apresentação.

### D5. Dependências na nuvem

- No Render, o lances precisa de `LEILOES_SERVICE_URL` e `USUARIOS_SERVICE_URL`
  do **mesmo ambiente** (DEV aponta para os DEV; HOMOL, para os HOMOL), e do
  mesmo `JWT_SECRET` dos outros serviços daquele ambiente.
- `SAGA_PERMITIR_FALHA_SIMULADA=true` só no DEV (para demonstrar compensação e
  pendência); `false` no HOMOL.

---

## 4. Como funciona (resumo)

```
 push develop ─▶ ci ─▶ versao (1.1.0-dev.N) ─▶ imagem ─▶ GHCR :1.1.0-dev.N, :dev
                                                     └─▶ deploy-dev (environment lances-dev)
                                                           └─▶ Render lances-service-dev
                                                                 APP_ENV=dev  → Swagger em /docs
 push main    ─▶ ci ─▶ versao (1.1.0)       ─▶ imagem ─▶ GHCR :1.1.0, :homol, :latest + tag git
                                                     └─▶ deploy-homol (environment lances-homol)
                                                           └─▶ Render lances-service-homol
                                                                 APP_ENV=homol → /docs dá 404
```

Um lance chegando: métricas (início do cronômetro) → `express.json` →
`extrairUsuario` → rota → `lanceService` (autorização: só LICITANTE, em nome
próprio) → Saga (4 passos, com compensação) → no fim, a Saga soma em
`lances_registrados_total` e `lances_sagas_total`, e o middleware soma em
`lances_http_requisicoes_total` com a rota **padronizada** (`/lances/:id`).

---

## 5. Roteiro de apresentação (≈ 3 min)

1. **Pipeline:** abrir uma execução do `lances-service` e mostrar os jobs, o
   resumo da versão e a imagem no GHCR.
2. **DEV x HOMOL:** `/docs` no DEV (Swagger) e no HOMOL (404); `/health` nos dois.
3. **Grafana** (`http://localhost:3013`): com o sistema no ar, rodar
   `gerar-trafego.ps1` e mostrar "Lances gravados" e "Sagas por status"
   (concluídas, compensadas, com pendência). Explicar a compensação: o crédito
   reservado volta quando a gravação do lance falha.
4. **Dependabot:** PRs abertas automaticamente para o `develop`.

---

## 6. Limitações conhecidas

- `/metrics` é público no Render (só números agregados).
- O Prometheus e o Grafana rodam na máquina de quem apresenta.
- O quality gate do Sonar é informativo, não bloqueante.
- **Plano gratuito do Render:** um serviço parado "dorme" e leva até ~1 min para
  acordar, mais do que o tempo máximo das chamadas da Saga (`SERVICOS_TIMEOUT_MS`,
  3 s). Antes da demonstração, abra o `/health` do leiloes e do usuarios.
- **Sem o Kong na nuvem**, os serviços só decodificam o JWT (quem confere a
  assinatura é o Kong). O plano do T2 prevê trocar por `jwt.verify`.
- A execução real no GitHub, no Render e no SonarCloud não foi testada aqui.

---

## 7. Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `.github/workflows/lances-service.yml` | pipeline |
| `ci/deploy-render.sh` | deploy + smoke test |
| `Dockerfile`, `.dockerignore`, `.gitattributes` | imagem |
| `sonar-project.properties` | escopo da análise e da cobertura |
| `src/config/ambiente.js` | local/dev/homol, Swagger e versão |
| `src/config/db.js`, `src/db/migrar.js` | banco em nuvem e migração |
| `src/docs/openapi.js` | especificação do Swagger |
| `src/observabilidade/metricas.js` | métricas Prometheus |
| `src/sagas/registrarLanceSaga.js` | a Saga, que conta lances e sagas |
| `observabilidade/` | Prometheus + Grafana + gerador de tráfego |
| `tests/ambiente,app,db,migrar,metricas.test.js` | testes do T2 |
