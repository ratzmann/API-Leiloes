# Guia de configuração — GitHub, GHCR, Neon, Render e SonarCloud

Checklist para deixar o pipeline do `leiloes-service` 100% funcional. Siga na
ordem: cada etapa usa algo da anterior. Tempo estimado: 40–60 min.

> **Situação de partida:** o código já está na `main` e no `develop` do
> repositório `ratzmann/API-Leiloes`. O pipeline já roda: build, testes e
> imagem funcionam; **Sonar e deploy aparecem como avisos amarelos ("pulado")**
> até você concluir este guia. Isso é esperado.
>
> O porquê de cada escolha está em [`T2-DECISOES.md`](T2-DECISOES.md).

---

## 0. Antes de tudo: permissão de admin no repositório

O repositório é do Lucas (`ratzmann`). Environments, secrets e proteção de
branch exigem o papel **Admin**.

- [ ] Peça ao Lucas: **github.com/ratzmann/API-Leiloes → Settings →
      Collaborators → seu usuário → Role: Admin**.
- Alternativa: ele mesmo executa as etapas 5 e 6 com os valores que você
  passar.

---

## 1. GitHub Actions: conferir a primeira execução

- [ ] Abra **github.com/ratzmann/API-Leiloes → Actions → leiloes-service**.
- [ ] Deve haver uma execução para `main` e outra para `develop`. Em cada uma:

| Job | Esperado agora |
|---|---|
| Build, testes e SonarCloud | ✅ verde (com aviso amarelo "SonarCloud nao configurado") |
| Versao (Semantic Versioning) | ✅ verde; o *Summary* mostra a versão |
| Imagem Docker | ✅ verde (publica no GHCR) |
| Deploy DEV / Deploy HOMOL | ✅ verde com aviso "deploy pulado" |

- [ ] Em **Code → Tags** deve existir `leiloes-service-v1.1.0`, criada pelo
      pipeline da `main`.

> Se o job **Imagem** falhar com `denied: permission_denied` ou `write_package`:
> **Settings → Actions → General → Workflow permissions → "Read and write
> permissions" → Save** (precisa ser admin), e depois *Re-run all jobs*.

---

## 2. GHCR: deixar a imagem acessível para o Render

- [ ] Confira o pacote em **github.com/ratzmann?tab=packages →
      `leiloes-service`**. As tags devem ser `1.1.0`, `homol`, `latest`,
      `1.1.0-dev.N`, `dev` e `sha-…`.

Escolha **um** caminho:

- [ ] **A — pacote público (mais simples).** O Lucas (dono do pacote) abre o
      pacote → **Package settings → Danger Zone → Change visibility → Public**.
- [ ] **B — token seu (não depende dele).** GitHub → seu avatar → **Settings →
      Developer settings → Personal access tokens → Tokens (classic) → Generate
      new token (classic)**:
  - nome: `render-ghcr`;
  - escopo: **somente `read:packages`**;
  - validade: até depois da apresentação;
  - copie o token, que será usado na etapa 4.

---

## 3. Neon: bancos de DEV e HOMOL

- [ ] **neon.tech → Sign up with GitHub**.
- [ ] **Create project**: nome `leiloes`, Postgres 16, região mais próxima
      (ex.: *AWS US East*).
- [ ] Menu **Databases → New database**: crie `leiloes_dev` e depois
      `leiloes_homol`.
- [ ] **Dashboard → Connect**: escolha o banco `leiloes_dev` e copie a
      *connection string*. Repita para `leiloes_homol`. O formato é:
  ```
  postgresql://usuario:senha@ep-xxxx.us-east-2.aws.neon.tech/leiloes_dev?sslmode=require
  ```

> A tabela **não** precisa ser criada à mão: o serviço roda o `init.sql` ao
> iniciar (`src/db/migrar.js`).

---

## 4. Render: os dois serviços web

### 4.1 Credencial do GHCR (só se escolheu o caminho B)

- [ ] **dashboard.render.com → Settings (da conta/workspace) → Registry
      Credentials → Add credential**:
  - Registry: **GitHub**;
  - Username: seu login do GitHub;
  - Personal Access Token: o token da etapa 2B.

### 4.2 Serviço DEV

- [ ] **New + → Web Service → Existing Image**.
- [ ] Image URL: `ghcr.io/ratzmann/leiloes-service:dev`. No caminho B, escolha
      a credencial em *Credential*.
- [ ] Name: **`leiloes-service-dev`**. Region: a mesma do Neon. Instance Type:
      **Free**.
- [ ] **Environment Variables**:

| Key | Value |
|---|---|
| `APP_ENV` | `dev` |
| `DATABASE_URL` | connection string do `leiloes_dev` |
| `DB_SSL` | `true` |
| `JWT_SECRET` | o mesmo segredo do auth-service DEV (o serviço confere a assinatura do token) |
| `JWT_ISSUER` | `sistema-leilao-auth` |

- [ ] **Advanced → Health Check Path**: `/health`.
- [ ] **Deploy Web Service**. Espere o log mostrar
      `leiloes-service 1.1.0-dev.N (dev) ouvindo na porta 10000 - swagger em /docs`.
- [ ] Teste no navegador:
  - `https://leiloes-service-dev.onrender.com/health` deve mostrar
    `"ambiente":"dev"`;
  - `https://leiloes-service-dev.onrender.com/docs` deve abrir o **Swagger**.
- [ ] **Settings → Deploy Hook → copie a URL** (é secreta, não compartilhe).

### 4.3 Serviço HOMOL

Igual ao DEV, com estas diferenças:

- [ ] Image URL: `ghcr.io/ratzmann/leiloes-service:homol`.
- [ ] Name: **`leiloes-service-homol`**.
- [ ] Variáveis: `APP_ENV=homol`, `DATABASE_URL` do **`leiloes_homol`**,
      `DB_SSL=true`, `JWT_SECRET` (o do auth-service HOMOL) e
      `JWT_ISSUER=sistema-leilao-auth`. Opcional: `USUARIOS_SERVICE_URL=<URL do usuarios-service
      do colega>`; sem ela, o serviço não valida o leiloeiro.
- [ ] Teste:
  - `/health` deve mostrar `"ambiente":"homol"`, `"versao":"1.1.0"`;
  - `/docs` deve dar **404** (Swagger desligado, como pede o T2).
- [ ] Copie o **Deploy Hook** do HOMOL.

> **Se o Render der outro endereço** (porque o nome já estava em uso, por
> exemplo `leiloes-service-dev-ab12.onrender.com`), use o endereço real na
> etapa 6 e em `leiloes-service/observabilidade/prometheus/prometheus.yml`.

---

## 5. SonarCloud

- [ ] **sonarcloud.io → Log in → GitHub**.
- [ ] **+ (canto superior direito) → Create new organization → Create one
      manually**. Key, ex.: `thiagoschulze`; plano **Free**. Anote a key.
- [ ] **+ → Analyze new project → Create a project manually**:
  - Organization: a sua;
  - Display name: `leiloes-service`;
  - Project key: `thiagoschulze_leiloes-service` (anote);
  - visibilidade **Public** (o Free exige).
- [ ] *Set up project for Clean as You Code*: **Previous version**.
- [ ] No projeto: **Administration → Analysis Method → desligue "Automatic
      Analysis"**. Ligada, ela conflita com a análise do pipeline.
- [ ] **Avatar → My Account → Security → Generate Tokens**: nome
      `github-actions`, tipo *User*. Copie o token.

---

## 6. GitHub: secrets, variáveis e environments

### 6.1 Do repositório (Sonar)

**Settings → Secrets and variables → Actions:**

- [ ] aba **Secrets → New repository secret**: `SONAR_TOKEN` = token da etapa 5.
- [ ] aba **Variables → New repository variable**:
  - `SONAR_ORGANIZATION` = key da organização (ex.: `thiagoschulze`);
  - `SONAR_PROJECT_KEY` = key do projeto (ex.: `thiagoschulze_leiloes-service`).

### 6.2 Environments (deploy)

**Settings → Environments → New environment**, crie **`dev`** e
**`homol`** (exatamente com esses nomes). Em cada um:

| Onde (dentro do environment) | Nome | `dev` | `homol` |
|---|---|---|---|
| Environment secrets | `RENDER_DEPLOY_HOOK_URL` | hook do serviço DEV | hook do serviço HOMOL |
| Environment variables | `RENDER_URL` | `https://leiloes-service-dev.onrender.com` | `https://leiloes-service-homol.onrender.com` |

Sem barra no fim do `RENDER_URL`.

- [ ] (Opcional, bom para a apresentação) no environment **`homol`**: marque
      **Required reviewers** e adicione você. O deploy em HOMOL passa a esperar
      um clique em **Review deployments → Approve**.
- [ ] (Opcional) **Deployment branches**: `dev` só a partir de `develop`;
      `homol` só a partir de `main`.

---

## 7. Rodar o pipeline completo

- [ ] **Actions → leiloes-service → Run workflow →** branch `develop` → Run.
      Esperado: Sonar roda; **Deploy DEV** mostra
      `Deploy confirmado: ... esta com a versao 1.1.0-dev.N`.
- [ ] Repita com o branch `main`. Esperado: **Deploy HOMOL** confirmado com
      `1.1.0` (se marcou *Required reviewers*, aprove antes).

> Rodar a `main` de novo **com a mesma versão** funciona, porque a tag já
> aponta para o mesmo commit. Só falha se a `main` receber **código novo**
> sem subir a versão.

- [ ] **sonarcloud.io → projeto leiloes-service**: deve aparecer a análise
      com cobertura (~98%), bugs, code smells e duplicação.
- [ ] Na página do repositório, lado direito, **Deployments** deve mostrar
      `dev` e `homol` com links.

---

## 8. Dependabot e proteção de branches

- [ ] **Settings → Code security**: ative **Dependency graph**, **Dependabot
      alerts** e **Dependabot security updates**. As atualizações semanais de
      versão já vêm do `.github/dependabot.yml`; os PRs aparecem em
      *Pull requests* apontando para o `develop`.
- [ ] Para conferir: **Insights → Dependency graph → Dependabot**, onde aparecem
      as 3 configurações (npm, docker, github-actions).
- [ ] **Settings → Branches → Add branch ruleset** (ou *Add classic branch
      protection rule*) para `main` e outra para `develop`:
  - **Require a pull request before merging**;
  - **Require status checks to pass** → adicione `Build, testes e SonarCloud`;
  - **Block force pushes**.

---

## 9. Grafana com os ambientes da nuvem

- [ ] Se os endereços do Render forem diferentes de `leiloes-service-dev/-homol.onrender.com`,
      edite `leiloes-service/observabilidade/prometheus/prometheus.yml`.
- [ ] Suba a stack:
  ```powershell
  cd leiloes-service\observabilidade
  docker compose up -d --build
  ```
- [ ] **http://localhost:9090 → Status → Targets**: `local`, `dev` e `homol`
      devem estar **UP**. O Render free leva até 1 min para "acordar"; abra as
      URLs antes.
- [ ] Gere tráfego e abra o Grafana (**http://localhost:3000**, admin/admin):
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\gerar-trafego.ps1
  powershell -ExecutionPolicy Bypass -File .\gerar-trafego.ps1 -BaseUrl https://leiloes-service-dev.onrender.com -Rodadas 10
  ```
- [ ] No filtro **Ambiente** do dashboard, alterne entre `local`, `dev` e `homol`.

---

## 10. Fluxo do dia a dia (depois de configurado)

```bash
git checkout develop && git pull
git checkout -b feature/minha-mudanca
# ... altera o leiloes-service ...
# se for para virar release: sobe "version" em leiloes-service/package.json
#   correcao 1.1.1 | funcionalidade nova 1.2.0 | quebra de API 2.0.0
git push -u origin feature/minha-mudanca
gh pr create --base develop      # merge -> deploy DEV
gh pr create --base main --head develop --title "Release leiloes-service 1.2.0"   # merge -> deploy HOMOL
```

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Job Imagem: `denied` / `permission_denied` | Actions sem permissão de escrita em pacotes | Etapa 1: *Workflow permissions → Read and write* |
| Render: `failed to pull image` / `unauthorized` | pacote privado no GHCR | etapa 2 (pacote público **ou** credencial com token) |
| Deploy: `curl: (22) ... 404` | hook copiado errado | copie de novo em Render → Settings → Deploy Hook |
| Deploy: `400` | `imgURL` com repositório diferente do configurado no serviço | a Image URL do serviço precisa ser `ghcr.io/ratzmann/leiloes-service:<tag>` |
| Deploy: "versao ... nao apareceu a tempo" | o serviço não subiu | veja **Logs** no Render (geralmente `DATABASE_URL` errada) |
| Log: `Falha ao preparar o banco` | `DATABASE_URL` ou `DB_SSL` errados | confira a string do Neon e `DB_SSL=true` |
| Sonar: `Automatic Analysis is enabled` | as duas análises ligadas | etapa 5: desligue a Automatic Analysis |
| Sonar: `Project not found` | key ou organização divergentes | confira as variáveis da etapa 6.1 (case-sensitive) |
| Versao: "A versao X ja foi publicada" | código novo na `main` sem subir a versão | suba `version` no `package.json` |
| Prometheus: alvo `dev`/`homol` **DOWN** com 404 | endereço do Render diferente | ajuste o `prometheus.yml` (etapa 9) |
