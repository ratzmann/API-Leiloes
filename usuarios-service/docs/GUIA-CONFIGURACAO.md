# Guia de configuração — `auth-service` e `usuarios-service`

Checklist para deixar os pipelines do **auth-service** e do **usuarios-service**
100% funcionais. Os dois são configurados juntos: mesmo projeto no Neon, mesma
organização no SonarCloud e mesmo jeito de criar os serviços no Render. Siga na
ordem. Tempo estimado: 40–60 min.

> **Situação de partida:** o código está no branch `feature/auth-usuarios-cicd`.
> Depois do merge em `develop` e `main`, o pipeline já roda: build, testes e
> imagem funcionam. **Sonar e deploy aparecem como avisos amarelos ("pulado")**
> até você concluir este guia. Isso é esperado.
>
> É o mesmo roteiro do Thiago
> ([`leiloes-service/docs/GUIA-CONFIGURACAO.md`](../../leiloes-service/docs/GUIA-CONFIGURACAO.md)),
> com nomes próprios. O repositório é seu (`ratzmann`), então você já é admin.

---

## 0. Subir o código (Git Flow)

```bash
git push -u origin feature/auth-usuarios-cicd
gh pr create --base develop --title "T2: CI/CD e observabilidade do auth-service e usuarios-service"
# depois do merge no develop (deploy DEV):
gh pr create --base main --head develop --title "Release auth-service 1.1.0 e usuarios-service 1.1.0"
```

---

## 1. GitHub Actions: conferir a primeira execução

- [ ] **Actions → auth-service** e **Actions → usuarios-service**. Em cada um:

| Job | Esperado agora |
|---|---|
| Build, testes e SonarCloud | ✅ verde (aviso "SonarCloud nao configurado") |
| Versao (Semantic Versioning) | ✅ verde; o *Summary* mostra a versão |
| Imagem Docker | ✅ verde (publica no GHCR em develop/main) |
| Deploy DEV / Deploy HOMOL | ✅ verde com aviso "deploy pulado" |

- [ ] Depois do merge na `main`, em **Code → Tags** devem aparecer
      `auth-service-v1.1.0` e `usuarios-service-v1.1.0`.

> Se o job **Imagem** falhar com `denied`/`write_package`: **Settings → Actions →
> General → Workflow permissions → "Read and write permissions"**.

---

## 2. GHCR: deixar as imagens acessíveis para o Render

- [ ] **github.com/ratzmann?tab=packages**: confira os pacotes `auth-service` e
      `usuarios-service`.
- [ ] Em cada pacote: **Package settings → Danger Zone → Change visibility →
      Public**. Como os pacotes são seus, não é preciso token.

---

## 3. Neon: quatro bancos

- [ ] **neon.tech → Create project**: nome `auth-usuarios`, Postgres 16, região
      mais próxima.
- [ ] **Databases → New database**: `auth_dev`, `auth_homol`, `usuarios_dev`
      e `usuarios_homol`.
- [ ] **Connect**: copie a *connection string* de cada um (`...?sslmode=require`).

> As tabelas são criadas sozinhas ao iniciar (`src/db/migrar.js`).

---

## 4. Render: quatro serviços web

Gere **um** segredo de JWT por ambiente (ex.: `openssl rand -hex 32`). O mesmo
valor vai em **todos os serviços daquele ambiente** (auth, usuarios, leiloes e
lances): o auth assina o token e os outros o leem.
Gere também **uma** `CHAVE_INTERNA` por ambiente (o mesmo comando), igual nos
4 serviços daquele ambiente: é a chave das rotas internas do usuarios-service
(criar perfil, reservar e liberar crédito). Sem ela no usuarios, o registro e os
lances falham (essas rotas respondem `500`).

Para cada linha da tabela: **New + → Web Service → Existing Image**, Instance
Type **Free**, **Advanced → Health Check Path `/health`**.

| Name | Image URL | Variáveis |
|---|---|---|
| `usuarios-service-dev` | `ghcr.io/ratzmann/usuarios-service:dev` | `APP_ENV=dev`, `DATABASE_URL`=usuarios_dev, `DB_SSL=true`, `JWT_SECRET`=segredo DEV, `JWT_ISSUER=sistema-leilao-auth`, `CHAVE_INTERNA`=chave DEV |
| `usuarios-service-homol` | `ghcr.io/ratzmann/usuarios-service:homol` | `APP_ENV=homol`, `DATABASE_URL`=usuarios_homol, `DB_SSL=true`, `JWT_SECRET`=segredo HOMOL, `JWT_ISSUER=sistema-leilao-auth`, `CHAVE_INTERNA`=chave HOMOL |
| `auth-service-dev` | `ghcr.io/ratzmann/auth-service:dev` | `APP_ENV=dev`, `DATABASE_URL`=auth_dev, `DB_SSL=true`, `JWT_SECRET`=segredo DEV, `JWT_ISSUER=sistema-leilao-auth`, `CHAVE_INTERNA`=chave DEV, `JWT_EXPIRES_IN=2h`, `USUARIOS_SERVICE_URL=https://usuarios-service-dev.onrender.com` |
| `auth-service-homol` | `ghcr.io/ratzmann/auth-service:homol` | `APP_ENV=homol`, `DATABASE_URL`=auth_homol, `DB_SSL=true`, `JWT_SECRET`=segredo HOMOL, `JWT_ISSUER=sistema-leilao-auth`, `CHAVE_INTERNA`=chave HOMOL, `JWT_EXPIRES_IN=2h`, `USUARIOS_SERVICE_URL=https://usuarios-service-homol.onrender.com` |

Crie o **usuarios primeiro**, porque o auth aponta para ele.

- [ ] Teste cada um:
  - `/health` deve mostrar o `ambiente` certo;
  - `/docs` abre o Swagger no **DEV** e dá **404** no **HOMOL**.
- [ ] Em cada serviço: **Settings → Deploy Hook → copie a URL** (é secreta).
- [ ] Avise o Thiago: o `USUARIOS_SERVICE_URL` do leiloes pode apontar para o
      `usuarios-service-dev` / `-homol`, e o `JWT_SECRET` e a `CHAVE_INTERNA`
      precisam ser os mesmos.

> Se o Render der outro endereço (nome em uso), use o endereço real nas etapas
> 6 e 9 e no `USUARIOS_SERVICE_URL` do auth.

---

## 5. SonarCloud: uma organização, dois projetos

> **Combine com o Thiago antes.** `SONAR_TOKEN` e `SONAR_ORGANIZATION` são
> variáveis do **repositório**, então valem para os três pipelines. O caminho
> mais simples é **uma organização só** (a sua, dona do repo) com um projeto
> por serviço. O Thiago só configura `SONAR_PROJECT_KEY` com o projeto dele.

- [ ] **sonarcloud.io → Log in com GitHub → + → Create new organization →
      Create one manually**: key `ratzmann`, plano **Free**.
- [ ] **+ → Analyze new project → Create a project manually**, duas vezes:
  - `auth-service`, com key `ratzmann_auth-service`;
  - `usuarios-service`, com key `ratzmann_usuarios-service`;
  - (e `leiloes-service`, com key `ratzmann_leiloes-service`, para o Thiago).
- [ ] Em cada projeto: **Administration → Analysis Method → desligue
      "Automatic Analysis"**.
- [ ] **My Account → Security → Generate Tokens**: `github-actions`. Copie.

---

## 6. GitHub: secrets, variáveis e environments

### 6.1 Do repositório (Sonar)

**Settings → Secrets and variables → Actions:**

| Aba | Nome | Valor |
|---|---|---|
| Secrets | `SONAR_TOKEN` | token da etapa 5 |
| Variables | `SONAR_ORGANIZATION` | `ratzmann` |
| Variables | `SONAR_PROJECT_KEY_AUTH` | `ratzmann_auth-service` |
| Variables | `SONAR_PROJECT_KEY_USUARIOS` | `ratzmann_usuarios-service` |

### 6.2 Environments (deploy)

**Settings → Environments → New environment**: crie os quatro (nomes exatos).

| Environment | Secret `RENDER_DEPLOY_HOOK_URL` | Variable `RENDER_URL` (sem `/` no fim) |
|---|---|---|
| `auth-dev` | hook do `auth-service-dev` | `https://auth-service-dev-rslq.onrender.com` (sufixo dado pelo Render) |
| `auth-homol` | hook do `auth-service-homol` | `https://auth-service-homol-czky.onrender.com` (sufixo dado pelo Render) |
| `usuarios-dev` | hook do `usuarios-service-dev` | `https://usuarios-service-dev.onrender.com` |
| `usuarios-homol` | hook do `usuarios-service-homol` | `https://usuarios-service-homol.onrender.com` |

- [ ] (Opcional) nos `*-homol`: **Required reviewers**, para aprovar o deploy em HOMOL.
- [ ] (Opcional) **Deployment branches**: os `*-dev` só a partir de `develop`,
      e os `*-homol` só a partir de `main`.

---

## 7. Rodar os pipelines completos

- [ ] **Actions → usuarios-service → Run workflow → `develop`**. Esperado:
      Sonar roda, e o **Deploy DEV** mostra `Deploy confirmado: ... 1.1.0-dev.N`.
- [ ] O mesmo para o **auth-service**.
- [ ] Repita os dois na `main`: o **Deploy HOMOL** deve ser confirmado com `1.1.0`.
- [ ] **sonarcloud.io**: os dois projetos devem aparecer com análise e cobertura
      (~96% no auth e ~92% no usuarios).

---

## 8. Dependabot e proteção de branches

- [ ] **Settings → Code security**: **Dependency graph**, **Dependabot alerts**
      e **security updates** ativados.
- [ ] **Insights → Dependency graph → Dependabot**: devem aparecer as entradas
      npm e docker do `/auth-service` e do `/usuarios-service`.
- [ ] Proteção de `main` e `develop` (se ainda não existir): PR obrigatório,
      status check `Build, testes e SonarCloud` e bloqueio de force push.

---

## 9. Grafana com os ambientes da nuvem

- [ ] Se os endereços do Render forem outros, edite
      `auth-service/observabilidade/prometheus/prometheus.yml` e
      `usuarios-service/observabilidade/prometheus/prometheus.yml`.
- [ ] Suba as stacks (podem rodar juntas, e junto com a do leiloes):
  ```powershell
  cd usuarios-service\observabilidade; docker compose up -d --build; cd ..\..
  cd auth-service\observabilidade;     docker compose up -d --build; cd ..\..
  ```
- [ ] Os alvos `local`, `dev` e `homol` devem estar **UP** em
      **http://localhost:9092/targets** (usuarios) e **http://localhost:9091/targets** (auth).
      O Render free leva até 1 min para "acordar".
- [ ] Gere tráfego e abra o Grafana. Usuarios: **http://localhost:3012**. Auth:
      **http://localhost:3011**. Login: admin/admin.
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\usuarios-service\observabilidade\gerar-trafego.ps1
  powershell -ExecutionPolicy Bypass -File .\auth-service\observabilidade\gerar-trafego.ps1 -BaseUrl https://auth-service-dev-rslq.onrender.com -Rodadas 10
  ```

---

## 10. Fluxo do dia a dia

```bash
git checkout develop && git pull
git checkout -b feature/minha-mudanca
# ... altera o auth-service ou o usuarios-service ...
# release: sobe "version" no package.json do servico (1.1.1 | 1.2.0 | 2.0.0)
git push -u origin feature/minha-mudanca
gh pr create --base develop                       # merge -> deploy DEV
gh pr create --base main --head develop           # merge -> deploy HOMOL
```

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Render: `failed to pull image` | pacote privado no GHCR | etapa 2: deixe o pacote público |
| Deploy: `400` | Image URL do serviço não é `ghcr.io/ratzmann/<servico>:<tag>` | corrija a Image URL no Render |
| Deploy: "versao ... nao apareceu a tempo" | o serviço não subiu | veja os **Logs** no Render (geralmente `DATABASE_URL`) |
| Auth: registro OK, mas `perfil: null` | `USUARIOS_SERVICE_URL` errado, ou usuarios dormindo | confira a URL; abra o usuarios antes |
| Auth: `500` no login | `JWT_SECRET` ausente | etapa 4 |
| Leiloes/lances não aceitam o token do auth | `JWT_SECRET` diferente entre os serviços | o mesmo segredo em todos do ambiente |
| Sonar: `Project not found` | key/organização divergentes | etapa 6.1 (diferencia maiúsculas) |
| Versao: "A versao X ja foi publicada" | código novo na `main` sem subir a versão | suba `version` no `package.json` |
| Deploy de um serviço caiu no Render do outro | environment errado | cada serviço tem os seus (`auth-*`, `usuarios-*`) |
