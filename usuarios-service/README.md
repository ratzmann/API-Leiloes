# usuarios-service

Microsserviço de domínio: cadastro de **leiloeiros** e **licitantes**, com o
**crédito do licitante** usado pela saga de lance (reserva e liberação).
Arquitetura em camadas: `routes → controllers → services → repositories → Postgres`.
Visão geral do sistema no [README da raiz](../README.md).

## Rodando

Junto com o resto do sistema, a partir da raiz: `docker compose up -d --build`.
Pelo Kong, as rotas ficam em `http://localhost:8000/usuarios/...`.

Sozinho, com Prometheus e Grafana: veja [`observabilidade/`](observabilidade/docker-compose.yml).

## Testes

```bash
cd usuarios-service && npm install && npm test
```

Jest com `repositories/` mockados (`__mocks__/`), cobrindo as regras de
`services/` e `utils/` e o código do T2 (ambiente, métricas, Swagger, migração).
Cobertura atual: **~92%** (mínimo exigido: 50%).

## T2 — CI/CD e Observabilidade

Decisões e funcionamento: **[`docs/T2-DECISOES.md`](docs/T2-DECISOES.md)**.
Checklist das contas (GitHub, Render, Neon, SonarCloud), feito junto com o
auth-service: **[`docs/GUIA-CONFIGURACAO.md`](docs/GUIA-CONFIGURACAO.md)**.

| O quê | Onde |
| --- | --- |
| Pipeline (build, testes, SonarCloud, imagem no GHCR, deploy DEV/HOMOL no Render) | `../.github/workflows/usuarios-service.yml` |
| Versão (Semantic Versioning) | campo `version` do `package.json` |
| Swagger (só DEV) | `GET /docs` e `GET /docs/openapi.json` |
| Métricas Prometheus | `GET /metrics` |
| Health check (versão e ambiente) | `GET /health` |
| Prometheus + Grafana | `observabilidade/` (`docker compose up -d --build`; Grafana em `:3012`) |
| URL DEV / HOMOL | `https://usuarios-service-dev.onrender.com` / `https://usuarios-service-homol.onrender.com` (após a configuração) |

Variáveis:

| Variável | Uso |
| --- | --- |
| `APP_ENV` | `local`, `dev` ou `homol`; o Swagger só liga em `local`/`dev` |
| `SWAGGER_ENABLED` | opcional: força o Swagger ligado (`true`) ou desligado (`false`) |
| `DATABASE_URL` + `DB_SSL=true` | banco gerenciado (Neon); substitui as `DB_*` |
| `VERSAO_IMAGEM` | gravada pelo pipeline no build da imagem (ex.: `1.1.0-dev.14`) |
| `JWT_SECRET`, `JWT_ISSUER` | os mesmos do auth-service |
