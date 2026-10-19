# Checklist do grupo — T2 (CI/CD e Observabilidade)

> Situação em **19/10/2026**. Quem concluir um item marca `[x]` e atualiza a tabela
> (por uma `feature/` e PR, como todo o resto).
>
> **Este arquivo não tem nenhum segredo, e nunca deve ter.** `JWT_SECRET`,
> `CHAVE_INTERNA`, senhas e *connection strings* do banco e Deploy Hooks do Render
> circulam **só no privado**.

## 1. Quem cuida de quê

| Pessoa | GitHub | Serviço(s) | Guia de configuração |
|---|---|---|---|
| **Lucas** | `ratzmann` (dono e **único admin** do repositório) | `auth-service` e `usuarios-service` | [`usuarios-service/docs/GUIA-CONFIGURACAO.md`](../usuarios-service/docs/GUIA-CONFIGURACAO.md) |
| **Thiago** | `ThiagoSchulze` | `leiloes-service` | [`leiloes-service/docs/GUIA-CONFIGURACAO.md`](../leiloes-service/docs/GUIA-CONFIGURACAO.md) |
| **Anderson** | `fkruger-anderson` | `lances-service` | [`lances-service/docs/GUIA-CONFIGURACAO.md`](../lances-service/docs/GUIA-CONFIGURACAO.md) |

Só o Lucas, como admin, consegue mexer em secrets, variáveis, environments e nas
opções de segurança do repositório (seção 4).

## 2. Entregáveis da especificação

| Item da especificação | Situação |
|---|---|
| Git Flow (`main` = HOMOL, `develop` = DEV, `feature/*`) | ✅ (as `feature/*` ficam no GitHub como evidência) |
| 1 pipeline por serviço (build, testes, Sonar) | ✅ build e testes · ⬜ Sonar (pulado até o Lucas configurar) |
| Deploy automático `develop` → DEV e `main` → HOMOL (Render) | ⬜ falta o Render de cada serviço + os hooks |
| DEV com Swagger, HOMOL sem Swagger | ✅ no código (`APP_ENV`) |
| Dockerfile, build automático e publicação da imagem | ✅ imagens `:dev` dos 4 no GHCR (públicas) |
| Semantic Versioning | ✅ (`X.Y.Z-dev.N` no DEV; `X.Y.Z` + tag git no HOMOL) |
| Dependabot e secrets do GitHub | ✅ Dependabot · ⬜ secrets (seção 4) |
| Prometheus + Grafana com dashboards | ✅ `<servico>/observabilidade/` |
| **URL DEV e HOMOL** | ⬜ só o lances DEV está no ar (seção 3) |
| README | ✅ |

## 3. Situação por serviço

| Serviço | Imagem `:dev` | Banco Neon (dev / homol) | Render DEV | Render HOMOL | Environments no GitHub |
|---|---|---|---|---|---|
| auth | ✅ | ❓ Lucas confirma | ⬜ (`auth-service-dev` ainda não existe) | ⬜ | `auth-dev` (vazio) · `auth-homol` ⬜ |
| usuarios | ✅ | ❓ Lucas confirma | ⬜ (`usuarios-service-dev` ainda não existe) | ⬜ | `usuarios-dev` (vazio) · `usuarios-homol` ⬜ |
| leiloes | ✅ | ❓ Thiago confirma | ⬜ (`leiloes-service-dev` ainda não existe) | ⬜ | `dev` (vazio) · `homol` (vazio) |
| lances | ✅ | ✅ `lances_dev` / `lances_homol` | ✅ `https://lances-service-dev.onrender.com` | ⬜ | `lances-dev` (vazio) · `lances-homol` ⬜ |

O HOMOL de todos só pode ser criado **depois da entrega `develop` → `main`**, porque
é ela que publica as imagens `:homol` (passo 5 da seção 5).

## 4. Configurações do Lucas (admin)

- [ ] **SonarCloud:** uma organização só, `ratzmann` (a variável `SONAR_ORGANIZATION` é
      a mesma nos 4 pipelines), com os projetos `ratzmann_auth-service`,
      `ratzmann_usuarios-service`, `ratzmann_leiloes-service` e `ratzmann_lances-service`.
      Em cada um: *Administration → Analysis Method →* desligar **Automatic Analysis**.
      Gerar um token.
- [ ] **Settings → Secrets and variables → Actions:**
      secret `SONAR_TOKEN`; variáveis `SONAR_ORGANIZATION=ratzmann`,
      `SONAR_PROJECT_KEY=ratzmann_leiloes-service`, `SONAR_PROJECT_KEY_AUTH`,
      `SONAR_PROJECT_KEY_USUARIOS` e `SONAR_PROJECT_KEY_LANCES`.
- [ ] **Settings → Environments:** os 8 da tabela abaixo (nomes exatos), cada um com o
      secret `RENDER_DEPLOY_HOOK_URL` e a variável `RENDER_URL` (sem `/` no fim). Cada
      responsável manda ao Lucas, **no privado**, o Deploy Hook e a URL do seu serviço
      (Render → serviço → *Settings → Deploy Hook*).
- [ ] *(recomendado)* **Settings → Code security:** ligar **Dependabot alerts** e
      **Dependabot security updates** (hoje estão desligados).
- **Não** ligar *Automatically delete head branches*: as `feature/*` ficam no GitHub.

| Serviço | Environment DEV | Environment HOMOL |
|---|---|---|
| auth | `auth-dev` | `auth-homol` |
| usuarios | `usuarios-dev` | `usuarios-homol` |
| leiloes | `dev` | `homol` |
| lances | `lances-dev` | `lances-homol` |

## 5. Ordem sugerida

1. [ ] Lucas: seção 4 (Sonar e secrets; os environments vão sendo preenchidos conforme
       chegam os hooks).
2. [ ] Cada um: dois bancos na Neon (`<servico>_dev` e `<servico>_homol`) e o serviço
       **DEV** no Render (seção 6). Ordem: **usuarios** primeiro (os outros apontam para
       ele), depois **auth** e **leiloes**, por último **lances** (precisa dos dois).
3. [ ] Cada um manda ao Lucas o Deploy Hook e a URL do DEV.
4. [ ] Teste integrado no DEV: registrar → login → cadastrar e abrir leilão → dar lance.
5. [ ] **Entrega `develop` → `main`** (PR, com *Create a merge commit*), combinada com o
       grupo. O pipeline publica as imagens `:homol` e cria as tags `auth-service-v1.1.0`,
       `usuarios-service-v1.1.0`, `leiloes-service-v1.2.0` e `lances-service-v1.1.0`.
6. [ ] Cada um cria o serviço **HOMOL** no Render (mesmas variáveis, valores do HOMOL)
       e manda o hook ao Lucas.
7. [ ] Rodar o pipeline da `main` de novo (*Actions → Run workflow → main*) e conferir
       "Deploy confirmado" no job de deploy.
8. [ ] Grafana de cada serviço mostrando os alvos DEV e HOMOL. Se o Render deu outro
       endereço (nome em uso), ajustar `<servico>/observabilidade/prometheus/prometheus.yml`.

## 6. Render: como criar cada serviço

*New + → Web Service → **Existing Image***, com:

- **Image URL:** `ghcr.io/ratzmann/<servico>:dev` (DEV) ou `:homol` (HOMOL);
- **Name:** `<servico>-dev` ou `<servico>-homol` (vira a URL `https://<nome>.onrender.com`);
- **Region:** de preferência **Ohio (US East)** para todos: serviços na mesma região se
  falam mais rápido (o banco do lances está na AWS us-east-2, Ohio);
- **Instance Type:** Free · **Health Check Path:** `/health`;
- **Não** configurar `PORT` (o Render define) nem *Docker Command* (vale o `CMD` do Dockerfile).

### Variáveis (nomes; os valores circulam no privado)

| Variável | auth | usuarios | leiloes | lances | Observação |
|---|:-:|:-:|:-:|:-:|---|
| `APP_ENV` | ✔ | ✔ | ✔ | ✔ | `dev` ou `homol` |
| `DATABASE_URL` | ✔ | ✔ | ✔ | ✔ | *connection string* do banco do ambiente; trocar `sslmode=require` por `sslmode=verify-full` |
| `DB_SSL` | ✔ | ✔ | ✔ | ✔ | `true` |
| `JWT_SECRET` | ✔ | ✔ | ✔ | ✔ | **o mesmo nos 4** serviços do ambiente |
| `JWT_ISSUER` | ✔ | ✔ | ✔ | ✔ | `sistema-leilao-auth` |
| `JWT_EXPIRES_IN` | ✔ | | | | `2h` |
| `CHAVE_INTERNA` | ✔ | ✔ | ✔ | ✔ | **a mesma nos 4** serviços do ambiente |
| `USUARIOS_SERVICE_URL` | ✔ | | ✔ | ✔ | URL do usuarios **do mesmo ambiente** |
| `LEILOES_SERVICE_URL` | | | | ✔ | URL do leiloes **do mesmo ambiente** |
| `SAGA_PERMITIR_FALHA_SIMULADA` | | | | ✔ | `true` no DEV, `false` no HOMOL |

**Segredos compartilhados:** o `JWT_SECRET` e a `CHAVE_INTERNA` do DEV e do HOMOL já
foram gerados pelo Anderson em 19/10 (um par por ambiente; DEV ≠ HOMOL) e são
entregues no privado. Sem o `JWT_SECRET` igual, um serviço recusa o token do auth
(`401`, ou `500` se faltar); sem a `CHAVE_INTERNA` igual, o usuarios recusa o registro
e as reservas da Saga.

### Conferir

- `https://<servico>-dev.onrender.com/health` → `"ambiente":"dev"` e a versão;
- `/docs` → Swagger no DEV, `404` no HOMOL;
- `/metrics` → métricas com o rótulo `ambiente`.

No plano Free o serviço "dorme" depois de ~15 min sem acesso; a primeira chamada pode
levar quase 1 minuto (o pipeline espera até 10 minutos pela versão nova).

## 7. Cuidados

- Nada de segredo no grupo, em issue, PR ou commit. Se uma senha de banco vazar,
  troque no console da Neon (*Roles → Reset password*) e atualize o `DATABASE_URL`.
- O Deploy Hook é secreto: quem tem a URL dispara deploy do serviço.
- A `main` só recebe a `develop` por PR, na entrega combinada com o grupo.
