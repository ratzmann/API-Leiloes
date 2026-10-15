# Guia de configuração — `lances-service`

Checklist para deixar o pipeline do **lances-service** 100% funcional. É o mesmo
roteiro do Thiago
([`leiloes-service/docs/GUIA-CONFIGURACAO.md`](../../leiloes-service/docs/GUIA-CONFIGURACAO.md))
e do Lucas
([`usuarios-service/docs/GUIA-CONFIGURACAO.md`](../../usuarios-service/docs/GUIA-CONFIGURACAO.md)),
com nomes próprios. Siga na ordem. Tempo estimado: 30–40 min.

> **Situação de partida:** depois do merge em `develop` e `main`, o pipeline já
> roda: build, testes e imagem funcionam. **Sonar e deploy aparecem como avisos
> amarelos ("pulado")** até você concluir este guia. Isso é esperado.
>
> **O que depende do dono do repositório (ratzmann):** environments, variáveis do
> repositório, projeto no SonarCloud e visibilidade do pacote no GHCR exigem
> acesso de administrador. Estão marcados com **(ratzmann)**.
>
> **O lances depende dos outros:** no Render ele precisa do leiloes-service e do
> usuarios-service **do mesmo ambiente** já no ar.

---

## 0. Subir o código (Git Flow)

```bash
git push -u origin feature/lances-service-cicd
gh pr create --base develop --title "T2: CI/CD e observabilidade do lances-service"
# depois do merge no develop (deploy DEV):
gh pr create --base main --head develop --title "Release lances-service 1.1.0"
```

---

## 1. GitHub Actions: conferir a primeira execução

- [ ] **Actions → lances-service**:

| Job | Esperado agora |
|---|---|
| Build, testes e SonarCloud | ✅ verde (aviso "SonarCloud nao configurado") |
| Versao (Semantic Versioning) | ✅ verde; o *Summary* mostra a versão |
| Imagem Docker | ✅ verde (publica no GHCR em develop/main) |
| Deploy DEV / Deploy HOMOL | ✅ verde com aviso "deploy pulado" |

- [ ] Depois do merge na `main`, em **Code → Tags** deve aparecer `lances-service-v1.1.0`.

---

## 2. GHCR: deixar a imagem acessível para o Render **(ratzmann)**

O pacote é publicado no nome do dono do repositório:
`ghcr.io/ratzmann/lances-service`.

- [ ] **(ratzmann)** **github.com/ratzmann?tab=packages → lances-service →
      Package settings → Change visibility → Public**.
- [ ] Alternativa, sem depender dele: no Render, cadastre uma *Registry
      Credential* com um token seu (PAT) com escopo `read:packages`.

---

## 3. Neon: dois bancos

- [ ] **neon.tech → Create project**: nome `lances`, Postgres 16, região mais próxima
      (sua conta: o limite gratuito é por conta).
- [ ] **Databases → New database**: `lances_dev` e `lances_homol`.
- [ ] **Connect**: copie a *connection string* de cada um (`...?sslmode=require`).

> As tabelas são criadas sozinhas ao iniciar (`src/db/migrar.js`).

---

## 4. Render: dois serviços web

Para cada linha: **New + → Web Service → Existing Image**, Instance Type
**Free**, **Advanced → Health Check Path `/health`**. Hoje o lances só
*decodifica* o token, então o `JWT_SECRET` ainda não é usado; deixe-o igual ao dos
outros serviços **daquele ambiente** (combine com o Lucas), porque ele passa a
ser necessário quando o `jwt.verify` do plano do T2 entrar.

| Name | Image URL | Variáveis |
|---|---|---|
| `lances-service-dev` | `ghcr.io/ratzmann/lances-service:dev` | `APP_ENV=dev`, `DATABASE_URL`=lances_dev, `DB_SSL=true`, `LEILOES_SERVICE_URL=https://leiloes-service-dev.onrender.com`, `USUARIOS_SERVICE_URL=https://usuarios-service-dev.onrender.com`, `SAGA_PERMITIR_FALHA_SIMULADA=true`, `JWT_SECRET`=segredo DEV |
| `lances-service-homol` | `ghcr.io/ratzmann/lances-service:homol` | `APP_ENV=homol`, `DATABASE_URL`=lances_homol, `DB_SSL=true`, `LEILOES_SERVICE_URL=https://leiloes-service-homol.onrender.com`, `USUARIOS_SERVICE_URL=https://usuarios-service-homol.onrender.com`, `SAGA_PERMITIR_FALHA_SIMULADA=false`, `JWT_SECRET`=segredo HOMOL |

- [ ] Teste cada um:
  - `/health` deve mostrar o `ambiente` certo;
  - `/docs` abre o Swagger no **DEV** e dá **404** no **HOMOL**.
- [ ] Em cada serviço: **Settings → Deploy Hook → copie a URL** (é secreta).

> Se o Render der outro endereço (nome em uso), use o endereço real nas etapas 6
> e 9. Use também os endereços reais do leiloes e do usuarios.

---

## 5. SonarCloud: um projeto na organização do grupo **(ratzmann)**

`SONAR_TOKEN` e `SONAR_ORGANIZATION` já são do repositório (valem para todos os
pipelines).

- [ ] **(ratzmann)** **+ → Analyze new project → Create a project manually**:
      `lances-service`, com key `ratzmann_lances-service`.
- [ ] **(ratzmann)** **Administration → Analysis Method → desligue "Automatic Analysis"**.

---

## 6. GitHub: variável e environments **(ratzmann)**

### 6.1 Do repositório (Sonar)

**Settings → Secrets and variables → Actions → Variables:**

| Nome | Valor |
|---|---|
| `SONAR_PROJECT_KEY_LANCES` | `ratzmann_lances-service` |

### 6.2 Environments (deploy)

**Settings → Environments → New environment** (nomes exatos):

| Environment | Secret `RENDER_DEPLOY_HOOK_URL` | Variable `RENDER_URL` (sem `/` no fim) |
|---|---|---|
| `lances-dev` | hook do `lances-service-dev` | `https://lances-service-dev.onrender.com` |
| `lances-homol` | hook do `lances-service-homol` | `https://lances-service-homol.onrender.com` |

Os hooks são secretos: passe-os ao ratzmann por um canal privado, ou peça que ele
os copie direto do Render se tiver acesso.

---

## 7. Rodar os pipelines completos

- [ ] **Actions → lances-service → Run workflow → `develop`**. Esperado: Sonar
      roda, e o **Deploy DEV** mostra `Deploy confirmado: ... 1.1.0-dev.N`.
- [ ] Repita na `main`: o **Deploy HOMOL** deve ser confirmado com `1.1.0`.
- [ ] **sonarcloud.io**: o projeto deve aparecer com análise e cobertura.

---

## 8. Dependabot

- [ ] **Insights → Dependency graph → Dependabot**: devem aparecer as entradas npm
      e docker do `/lances-service`.

---

## 9. Grafana com os ambientes da nuvem

- [ ] Se os endereços do Render forem outros, edite
      `lances-service/observabilidade/prometheus/prometheus.yml`.
- [ ] Suba o sistema completo e depois a stack (podem rodar junto com as dos colegas):
  ```powershell
  docker compose up -d --build
  cd lances-service\observabilidade; docker compose up -d; cd ..\..
  ```
- [ ] Os alvos `local`, `dev` e `homol` devem estar **UP** em
      **http://localhost:9093/targets**. O Render free leva até 1 min para "acordar".
- [ ] Gere tráfego e abra o Grafana em **http://localhost:3013** (admin/admin):
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\lances-service\observabilidade\gerar-trafego.ps1
  ```

---

## 10. Fluxo do dia a dia

```bash
git checkout develop && git pull
git checkout -b feature/lances-minha-mudanca
# ... altera o lances-service ...
# release: sobe "version" no package.json do servico (1.1.1 | 1.2.0 | 2.0.0)
git push -u origin feature/lances-minha-mudanca
gh pr create --base develop                       # merge -> deploy DEV
gh pr create --base main --head develop           # merge -> deploy HOMOL
```

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Render: `failed to pull image` | pacote privado no GHCR | etapa 2 |
| Deploy: `400` | Image URL do serviço não é `ghcr.io/ratzmann/lances-service:<tag>` | corrija a Image URL no Render |
| Deploy: "versao ... nao apareceu a tempo" | o serviço não subiu | veja os **Logs** no Render (geralmente `DATABASE_URL`) |
| Todo lance responde `503` | `LEILOES_SERVICE_URL`/`USUARIOS_SERVICE_URL` errados, ou serviços dormindo | confira as URLs; abra o `/health` dos dois antes |
| Lance responde `401` | falta o header `Authorization: Bearer <token>` | faça login no auth-service e envie o token |
| Lance responde `403` | o token não é de LICITANTE, ou o `licitanteId` do corpo é de outra pessoa | dê lance com um licitante, em nome próprio |
| `X-Simular-Falha` não tem efeito | `SAGA_PERMITIR_FALHA_SIMULADA` não é `true` | ligue só no DEV |
| Sonar: `Project not found` | key/organização divergentes | etapas 5 e 6.1 |
| Versao: "A versao X ja foi publicada" | código novo na `main` sem subir a versão | suba `version` no `package.json` |
