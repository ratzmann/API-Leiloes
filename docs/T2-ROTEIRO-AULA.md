# Roteiro da apresentação do T2 em sala: CI/CD ao vivo

> Ordem da apresentação, minuto a minuto, com uma demonstração **ao vivo** do
> CI/CD usando uma mudança real: a atualização do `dotenv` (18.0.8 → 18.0.9) que o
> Dependabot abriu nos PRs #51 a #54. A mudança vai do PR até a homologação, com
> versão nova.
>
> Para os detalhes de cada item (onde clicar, comandos e respostas esperadas), veja
> a seção 15 do [`T2-PROCESSO.md`](T2-PROCESSO.md). Os slides estão em
> [`T2-SLIDES.pdf`](T2-SLIDES.pdf).

---

## 1. A ideia da demonstração

O professor vê uma mudança percorrer todo o caminho do Git Flow e do pipeline:

```
PR do Dependabot (#54)  →  CI no PR (sem publicar)  →  merge na develop
   →  pipeline da develop: testes, imagem 1.1.2-dev.N, deploy no DEV
   →  PR de entrega develop → main (#55)  →  merge na main
   →  pipeline da main: versão 1.1.2, tag Git, imagem :homol, deploy no HOMOL
   →  teste integrado na nuvem (21/21)
```

| | Antes da aula | Depois da demonstração |
|---|---|---|
| `dotenv` nos 4 serviços | 18.0.8 | **18.0.9** |
| DEV (`/health`) | `1.1.2-dev.N` (`1.2.2-dev.N` no leiloes) | o mesmo, com um `N` maior |
| HOMOL (`/health`) | `1.1.1` (`1.2.1` no leiloes) | **`1.1.2`** (`1.2.2` no leiloes) |
| Tags Git | `*-v1.1.1`, `leiloes-service-v1.2.1` | mais `*-v1.1.2` e `leiloes-service-v1.2.2` |

A versão já foi para `1.1.2`/`1.2.2` na `develop` (PR #56, PATCH: dependências e
documentação). Na `main`, essas versões ainda não existem: é a entrega de hoje que
as publica.

---

## 2. Quem faz o quê (sugestão: combine com o grupo)

| Pessoa | Parte |
|---|---|
| Lucas | Abertura, Git Flow e o merge da entrega (#55): é o autor do PR e o dono do repositório |
| Thiago | Pipeline (o modelo que os outros seguiram), deploy no Render e DEV x HOMOL |
| Anderson | Os merges do Dependabot, o acompanhamento no Actions, segurança, Grafana e o teste na nuvem |

Se uma pessoa só for apresentar, ela faz tudo na ordem abaixo.

---

## 3. Antes da aula

### Na véspera

- [ ] **Não juntar** os PRs #51 a #55: eles são a demonstração.
- [ ] Conferir em https://github.com/ratzmann/API-Leiloes/pulls que os #51 a #54
      estão com os checks verdes (5/5) e que o #55 continua aberto.
- [ ] Se o #55 ainda mostrar o check vermelho do *Deploy DEV* do lances: abrir o
      check → *Re-run failed jobs*. (Em 04/11 o Render demorou mais de 10 minutos e
      o smoke test desistiu antes; a versão nova subiu depois.)
- [ ] Rodar `node testes/testar-nuvem.js dev` e conferir `TUDO OK`.
- [ ] Ensaiar uma vez, cronometrando.
- [ ] Deixar à mão os PDFs `docs/T2-SLIDES.pdf` e `docs/T2-PROCESSO.pdf` (plano B).

### 15 minutos antes

- [ ] **Acordar os 8 serviços** (o plano gratuito do Render dorme depois de ~15 min):

  ```bash
  for u in auth-service-dev-rslq usuarios-service-dev leiloes-service-dev-bnhz lances-service-dev auth-service-homol-czky usuarios-service-homol leiloes-service-homol-igr9 lances-service-homol; do curl -s https://$u.onrender.com/health; echo; done
  ```

  Esperado: 8 linhas `{"status":"ok",...}`, DEV em `1.1.2-dev.N`/`1.2.2-dev.N` e
  HOMOL em `1.1.1`/`1.2.1`.
- [ ] **Grafana do lances no ar** (Docker Desktop aberto):

  ```bash
  docker compose up -d --build
  docker compose -f lances-service/observabilidade/docker-compose.yml up -d
  ```

  ```powershell
  powershell -ExecutionPolicy Bypass -File .\lances-service\observabilidade\gerar-trafego.ps1
  powershell -ExecutionPolicy Bypass -File .\lances-service\observabilidade\gerar-trafego.ps1
  ```

- [ ] **Terminal Git Bash** aberto na raiz do repositório, já com `git fetch origin --tags`.
- [ ] **Abas abertas no navegador**, nesta ordem:
  1. os slides (`docs/T2-SLIDES.pdf`);
  2. https://github.com/ratzmann/API-Leiloes/pull/54
  3. https://github.com/ratzmann/API-Leiloes/pulls
  4. https://github.com/ratzmann/API-Leiloes/actions
  5. https://github.com/ratzmann/API-Leiloes/pull/55
  6. https://lances-service-dev.onrender.com/docs
  7. https://lances-service-homol.onrender.com/docs
  8. http://localhost:3013 (Grafana do lances)
  9. https://github.com/ratzmann/API-Leiloes/tags
  10. https://github.com/users/ratzmann/packages/container/package/lances-service

---

## 4. Roteiro ao vivo (≈ 20 minutos)

| Tempo | Bloco | O que acontece |
|---|---|---|
| 0–2 min | 1. Abertura | slides 1 a 4 |
| 2–4 min | 2. Como funciona | slides 5 a 7 |
| 4–6 min | 3. Ao vivo, parte 1 | o PR do Dependabot e os merges na `develop` |
| 6–10 min | 4. Enquanto a `develop` roda | Swagger, segurança, Grafana |
| 10–11 min | 5. Resultado no DEV | "Deploy confirmado" e o `/health` do DEV |
| 11–12 min | 6. Ao vivo, parte 2 | o merge da entrega (#55) na `main` |
| 12–16 min | 7. Enquanto a `main` roda | slides 8 a 17 |
| 16–20 min | 8. Resultado no HOMOL | versão `1.1.2`, tags, imagem e teste na nuvem |

### Bloco 1 — Abertura (0–2 min)

- Slides 1 a 4: capa, o que o T2 pedia, quem fez o quê e a linha do tempo.
- **Dizer:** "Vamos mostrar ao vivo uma atualização de dependência indo do PR até a
  homologação, passando por todo o pipeline."

### Bloco 2 — Como funciona (2–4 min)

- Slide 5 (do commit à nuvem), slide 6 (Git Flow) e slide 7 (o pipeline, job a job).
- **Dizer:** "O Render nunca constrói nada: ele roda a imagem exata que passou nos
  testes. E cada serviço tem o seu pipeline."

### Bloco 3 — Ao vivo, parte 1: o PR do Dependabot (4–6 min)

1. **Aba do PR #54** (lances) → *Files changed*: o `package.json` e o
   `package-lock.json` passam o `dotenv` de `^18.0.8` para `^18.0.9`.
   - **Dizer:** "O Dependabot confere as dependências toda segunda-feira e abre um
     PR para a `develop`. Ele não junta nada sozinho: a equipe decide."
2. **Aba *Checks*** do mesmo PR: *Build, testes e SonarCloud*, *Versao* e
   *Imagem Docker* verdes; os dois *Deploy* aparecem como pulados.
   - **Dizer:** "No PR o pipeline roda tudo, mas não publica nem faz deploy."
3. **Juntar o #54:** *Merge pull request* → *Create a merge commit* → *Confirm merge*.
4. **Juntar também os #53 (auth), #52 (usuarios) e #51 (leiloes)**, da mesma forma.
5. **Aba *Actions*:** quatro runs em andamento, um por serviço.
   - **Dizer:** "Um pipeline por serviço: cada merge só dispara o workflow da pasta
     que mudou."

### Bloco 4 — Enquanto a `develop` roda (6–10 min)

O pipeline leva uns 2 a 5 minutos. Enquanto isso:

1. **Swagger** (1 min): aba do `/docs` do DEV (Swagger UI) e do HOMOL
   (`{"erro":"Rota nao encontrada."}`, 404).
   - **Dizer:** "É a mesma imagem nos dois ambientes; só a variável `APP_ENV` muda."
2. **Segurança sem o Kong** (1 min), no terminal:

   ```bash
   curl -s -w " [%{http_code}]\n" -H "Authorization: Bearer token-falso" https://leiloes-service-dev-bnhz.onrender.com/leiloes
   curl -s -w " [%{http_code}]\n" https://usuarios-service-dev.onrender.com/licitantes/1/reservas
   ```

   Esperado: `Token invalido ou expirado` (401) e `Rota interna: so os servicos do
   sistema podem chamar` (403).
3. **Grafana** (2 min): aba http://localhost:3013. Mostrar *Serviço no ar* (local,
   dev e homol), *Versão no ar* e *Sagas por status*.
   - **Dizer:** "O Prometheus local lê o `/metrics` do serviço local e dos dois
     ambientes no Render."

### Bloco 5 — Resultado no DEV (10–11 min)

1. **Aba *Actions*** → o run do `lances-service` na `develop` → job
   *Deploy DEV (Render)* → passo *Deploy da imagem e smoke test*.
   Esperado no fim do log:

   ```
   Deploy confirmado: https://lances-service-dev.onrender.com esta com a versao 1.1.2-dev.N
   ```

2. **No terminal:**

   ```bash
   curl -s https://lances-service-dev.onrender.com/health; echo
   ```

   Esperado: `"versao":"1.1.2-dev.N"` com um `N` maior que o de antes da aula.
   - **Dizer:** "O pipeline só termina quando o `/health` responde a versão nova.
     Isso é o smoke test."

### Bloco 6 — Ao vivo, parte 2: a entrega para a `main` (11–12 min)

1. **Aba do PR #55** (`develop` → `main`) → *Commits*: as versões do #56 e os merges
   do Dependabot de agora há pouco.
   - **Dizer:** "O HOMOL está na `1.1.1`. Essa tag já existe; se a versão não
     subisse para `1.1.2`, o job `versao` da `main` falharia. É a trava do Semantic
     Versioning: uma versão nunca aponta para dois códigos diferentes."
2. **Checks verdes** → *Merge pull request* → *Create a merge commit* → *Confirm merge*.
3. **Aba *Actions*:** quatro runs na `main`.

### Bloco 7 — Enquanto a `main` roda (12–16 min)

Slides 8 a 17: versionamento, Docker, deploy, DEV x HOMOL, URLs, segurança,
Dependabot, métricas, dashboard e testes. Nos slides 8 (versões) e 10 (deploy),
dizer que é exatamente o que está acontecendo no Actions naquele momento.

### Bloco 8 — Resultado no HOMOL (16–20 min)

1. **Aba *Actions*** → o run do `lances-service` na `main` → job
   *Deploy HOMOL (Render)*. Esperado:

   ```
   Deploy confirmado: https://lances-service-homol.onrender.com esta com a versao 1.1.2
   ```

2. **No terminal**, a versão nova no HOMOL e o Swagger desligado:

   ```bash
   curl -s https://lances-service-homol.onrender.com/health; echo
   curl -s -w " [%{http_code}]\n" https://lances-service-homol.onrender.com/docs
   ```

   Esperado: `"versao":"1.1.2","ambiente":"homol"` e `... [404]`.
3. **Aba das tags** (recarregar): `auth-service-v1.1.2`, `usuarios-service-v1.1.2`,
   `leiloes-service-v1.2.2` e `lances-service-v1.1.2`, criadas pelo pipeline.
4. **Aba do pacote no GHCR** (recarregar): a imagem `1.1.2` com as tags `homol` e
   `latest`.
5. **Teste integrado no HOMOL** (2 minutos; rodar enquanto mostra os slides 18 a 20):

   ```bash
   node testes/testar-nuvem.js homol
   ```

   Esperado: 21 linhas `[OK]` e `Resultado: TUDO OK`.
   - **Dizer:** "Os quatro serviços na homologação conversam entre si: registro,
     leilão, Saga com devolução de crédito, as recusas e o cancelamento."
6. **Fechamento:** slides 18 a 20 (problemas e lições, resultado, obrigado).

---

## 5. Plano B

| Situação | O que fazer |
|---|---|
| O pipeline está demorando | Siga para o próximo bloco; a página do Actions atualiza sozinha. Volte quando terminar. |
| Um *Deploy* falha com "A versao ... nao apareceu ... a tempo" | O Render do plano gratuito às vezes demora mais de 10 minutos para trocar a versão. Abra o run → *Re-run failed jobs*: normalmente confirma na primeira tentativa, porque a versão nova já subiu. |
| Um PR do Dependabot ficou vermelho | Não junte. Mostre o log como exemplo de "o pipeline barra a mudança" e use outro PR. |
| `/health` demora ou dá 502/503 | O serviço estava dormindo: espere ~1 minuto e repita. |
| O teste na nuvem falha no passo 0 | Acorde os 8 serviços e rode de novo. |
| Sem internet ou o GitHub fora do ar | Use os PDFs (`T2-SLIDES.pdf` e `T2-PROCESSO.pdf`) e as capturas dos dashboards nos READMEs dos serviços. |
| Os PRs já foram juntados antes da aula | Demonstre com *Actions* → `lances-service` → *Run workflow* → `develop` (gera um `-dev.N` novo no DEV) e mostre o histórico da entrega (#49 ou #55). |

---

## 6. Depois da aula

- Conferir que o HOMOL ficou em `1.1.2`/`1.2.2` nos 4 serviços e que as quatro tags
  novas existem.
- Desligar o Grafana local: `docker compose -f lances-service/observabilidade/docker-compose.yml down`
  e `docker compose down`, **sem** `-v`, para não apagar os dados.
