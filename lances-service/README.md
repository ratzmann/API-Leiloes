# lances-service

Microsserviço de domínio: registro e consulta de **lances**, e o **orquestrador
da Saga** de registro de lance (consulta o leilão no leiloes-service, reserva o
crédito no usuarios-service, grava o lance e libera o crédito de quem foi
superado; se algo falha depois da reserva, devolve o crédito).
Arquitetura em camadas: `routes → controllers → services/sagas → repositories → Postgres`.
Visão geral do sistema no [README da raiz](../README.md).

## Rodando

Junto com o resto do sistema, a partir da raiz: `docker compose up -d --build`.
Pelo Kong, as rotas ficam em `http://localhost:8000/lances/...`.

O lances-service **não funciona sozinho**: a Saga precisa do leiloes-service e
do usuarios-service (`LEILOES_SERVICE_URL` e `USUARIOS_SERVICE_URL`). Sem eles,
todo lance responde 503.

Prometheus e Grafana (com o sistema completo no ar): veja
[`observabilidade/`](observabilidade/docker-compose.yml).

## Testes

```bash
cd lances-service && npm install && npm test
```

Jest com repositórios e clients mockados, cobrindo as regras do lance, a Saga
(caminho feliz, recusas, compensação, pendência e reprocessamento), a camada
HTTP e o código do T2 (ambiente, métricas, Swagger, banco e migração).
Cobertura atual: **~82%** de linhas sobre todo o `src/` (mínimo exigido: 50%).

## T2 — CI/CD e Observabilidade

Decisões e funcionamento: **[`docs/T2-DECISOES.md`](docs/T2-DECISOES.md)**.
Checklist das contas (GitHub, Render, Neon, SonarCloud):
**[`docs/GUIA-CONFIGURACAO.md`](docs/GUIA-CONFIGURACAO.md)**.

| O quê | Onde |
| --- | --- |
| Pipeline (build, testes, SonarCloud, imagem no GHCR, deploy DEV/HOMOL no Render) | `../.github/workflows/lances-service.yml` |
| Versão (Semantic Versioning) | campo `version` do `package.json` |
| Swagger (só DEV) | `GET /docs` e `GET /docs/openapi.json` |
| Métricas Prometheus | `GET /metrics` |
| Health check (versão e ambiente) | `GET /health` |
| Prometheus + Grafana | `observabilidade/` (`docker compose up -d`; Grafana em `:3013`) |
| URL DEV / HOMOL | `https://lances-service-dev.onrender.com` / `https://lances-service-homol.onrender.com` (após a configuração) |

Variáveis:

| Variável | Uso |
| --- | --- |
| `APP_ENV` | `local`, `dev` ou `homol`; o Swagger só liga em `local`/`dev` |
| `SWAGGER_ENABLED` | opcional: força o Swagger ligado (`true`) ou desligado (`false`) |
| `DATABASE_URL` + `DB_SSL=true` | banco gerenciado (Neon); substitui as `DB_*` |
| `VERSAO_IMAGEM` | gravada pelo pipeline no build da imagem (ex.: `1.1.0-dev.14`) |
| `LEILOES_SERVICE_URL`, `USUARIOS_SERVICE_URL` | os serviços do **mesmo ambiente** que a Saga chama |
| `SERVICOS_TIMEOUT_MS` | tempo máximo de cada chamada a outro serviço (padrão 3000) |
| `SAGA_PERMITIR_FALHA_SIMULADA` | `true` libera o header `X-Simular-Falha` (só para demo; `false` em HOMOL) |
| `SAGA_ESPERA_REPETICAO_MS` | espera entre as tentativas do passo 4 da Saga (padrão 300) |
