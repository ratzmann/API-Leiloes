# CLAUDE.md — orientações do projeto

Sistema de **Leilão de Bois** em microsserviços (trabalho acadêmico).
Visão geral e fluxo de uso: [`README.md`](README.md).
Arquitetura explicada para iniciantes: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)
(inclui o mapa de endpoints, seção 13).
Roteiro da apresentação: [`docs/APRESENTACAO.md`](docs/APRESENTACAO.md).
Processo do T2 (CI/CD e observabilidade da equipe): [`docs/T2-PROCESSO.md`](docs/T2-PROCESSO.md).

## Estrutura

| Pasta | O que é |
|---|---|
| `auth-service/` | Registro, login e emissão de JWT (porta 3001). |
| `usuarios-service/` | Leiloeiros, licitantes e crédito do licitante (porta 3002). |
| `leiloes-service/` | Leilão (evento) e seu ciclo de vida (porta 3003). |
| `lances-service/` | Lances + orquestrador da Saga de registro de lance (porta 3003, outro container). |
| `kong/kong.yml` | API Gateway em modo DB-less: único ponto de entrada (porta 8000), valida o JWT. |
| `kong/erro.json` | Template dos erros gerados pelo próprio Kong (`{ "erro": ... }`). |
| `docker-compose.yml` | Sobe os 4 serviços, os 4 Postgres e o Kong. |
| `testes/` | `testar-unitarios.ps1` (Jest dos 4 serviços), `testar-tudo.ps1` (ponta a ponta), roteiro manual e coleção Postman. |
| `.github/` | T2: um workflow por serviço (CI, imagem no GHCR, deploy no Render) e o Dependabot. |
| `<servico>/observabilidade/` | T2: Prometheus + Grafana do serviço, com dashboard provisionado e `gerar-trafego.ps1`. A do lances usa o sistema completo (rede `leilao-net` da raiz), porque a Saga precisa dos outros serviços. |
| `<servico>/docs/T2-DECISOES.md` | T2: decisões, configuração das contas e roteiro de cada serviço. |

## Convenções de código

- Node.js 24 (LTS) + Express 4, **CommonJS** (`require` / `module.exports`).
  Só versões LTS (pares) do Node: as ímpares (25, 27...) nunca viram LTS.
- Nomes, mensagens e comentários em **português**, **sem acentos dentro do código**
  (arquivos `.md` podem ter acentos).
- Camadas em todos os serviços: `routes → controllers → services → repositories → Postgres`.
  - `clients/`: chamadas REST para outros serviços, sempre por `clients/http.js`
    (`requisicao`, `urlBase`, `ServicoIndisponivel`; timeout `SERVICOS_TIMEOUT_MS`).
  - `sagas/` (só no lances-service): orquestração da Saga.
  - `middlewares/`: `extrairUsuario.js` (lê o token) e `tratarErros.js` (responde os erros).
  - `utils/`, `config/`, `db/`: apoio.
- T2 (nos 4 serviços): o `app.js` é uma **fábrica**
  `criarApp(ambiente)` (o `server.js` e os testes criam o app); `config/ambiente.js` lê
  `APP_ENV`, `SWAGGER_ENABLED` e `VERSAO_IMAGEM`; `observabilidade/metricas.js` expõe
  `GET /metrics`; `docs/openapi.js` alimenta o Swagger em `/docs` (só em `local`/`dev`).
  Routers montados com prefixo passam por `metricas.lembrarPrefixo` (o erro que sai por
  `next(err)` perde o `req.baseUrl`).
- Responsabilidade de cada camada:
  - **service**: regras de negócio e autorização; não conhece HTTP, SQL nem `process.env`;
  - **controller**: só traduz HTTP ↔ service e repassa `req.usuarioAutenticado`;
  - **repository**: só fala SQL;
  - **client**: só fala HTTP com outro serviço.
- **Erros**:
  - o service faz `throw new ErroDeValidacao(mensagem, codigoHttp)`;
  - o controller faz `try { ... } catch (err) { next(err); }`;
  - o middleware `tratarErros` (registrado no `app.js` depois das rotas) responde
    `{ erro }` (+ `sagaId` na Saga), `400` para JSON inválido e `500` genérico para o resto;
  - não criar `tratarErro` em controller.
- **Formato de erro da API**: sempre `{ "erro": "mensagem" }`, inclusive no Kong
  (template `kong/erro.json` e `body` do `request-termination`). Única exceção:
  o `401` do plugin JWT, que continua `{ "message": ... }`.
- Chamadas a outros serviços: `2xx` → corpo; recusa de negócio (`4xx`) → `ErroDeValidacao`
  com o mesmo código; rede, timeout, `5xx` ou URL ausente → `ServicoIndisponivel` (o service
  converte em `503`).
  - Exceção (proposital): quando quem chama já validou os dados, um `4xx` inesperado é
    falha de integração, não recusa do usuário, e também vira `ServicoIndisponivel`. É o
    caso de `buscarLeiloeiro` (só `404` → `null`) e `liberarReservasDoLeilao` no leiloes,
    e de `consultarDisponibilidade` (só `404` → `null`) e `liberarReserva` no lances.
    O bloco `/** */` de cada client diz quais códigos ele trata como recusa.
- Variáveis de ambiente são lidas em `config/` (`ambiente.js`, `db.js` e, no lances,
  `saga.js`) ou na infraestrutura (`server.js`, `clients/http.js`, `clients/*Client.js`
  para `estaConfigurado()`, `middlewares/`); nunca em services, sagas ou controllers.
- SQL sempre parametrizado (`$1`, `$2`...), nunca concatenando valores do usuário.
- Valores em dinheiro são comparados em **centavos** (inteiros) para evitar erro de ponto flutuante.

## Regras de arquitetura

- Cada serviço tem **o próprio banco**; nenhum serviço lê o banco de outro.
- Os 4 serviços rodam `db/migrar.js` ao subir (`init.sql` idempotente: `IF NOT EXISTS`).
- Comunicação entre serviços: REST direto pela rede do Docker (sem passar pelo Kong),
  URL sempre vinda de variável de ambiente.
- Operações que atravessam serviços precisam de **compensação**:
  - registro: se o perfil falhar, o usuário é apagado (`authService.registrar`);
  - lance: Saga orquestrada (`sagas/registrarLanceSaga.js`);
  - cancelamento de leilão: libera as reservas do leilão; é idempotente e pode ser repetido.
- O Kong é o único ponto de entrada público e valida o JWT; os serviços **também conferem
  a assinatura** (`jwt.verify` em `middlewares/extrairUsuario.js`, com o `JWT_SECRET` e o
  `JWT_ISSUER` do auth-service): token inválido ou vencido → `401`; sem token, a chamada
  segue (chamadas internas); sem `JWT_SECRET` configurado, chamada com token → `500`.
- **Autorização** fica nos `services/`, usando `papel` e `perfilId` do token
  (`req.usuarioAutenticado`). Sem login → `401`; sem permissão → `403`.
  - leilão: só o leiloeiro logado cadastra (em nome próprio) e só o dono altera;
  - lance: só o licitante logado, em nome próprio;
  - cadastro de leiloeiro/licitante: só o próprio altera ou remove
    (`usuarios-service/src/utils/autorizacao.js`); o licitante não altera o próprio limite.
- **Privacidade (LGPD)**: dados pessoais (CPF, e-mail, telefone, limite) só para o próprio dono;
  os demais recebem os campos públicos (`visaoPara` em `utils/autorizacao.js`).
- **Rotas internas** (só entre serviços):
  - `/licitantes/:id/reservas...` e `POST /leiloeiros|/licitantes`: o Kong responde `403`;
  - `/reservas/leilao/:id/liberar`: o Kong nem tem rota `/reservas`;
  - além do Kong, o usuarios-service exige a **chave interna** nessas rotas
    (`middlewares/exigirChaveInterna.js`): os clients mandam o header `X-Chave-Interna`
    com a `CHAVE_INTERNA` (`clients/http.js`). Sem a chave → `403`; sem `CHAVE_INTERNA`
    configurada no usuarios → `500` (rotas internas desligadas, nunca abertas).
- A Admin API do Kong (8001) é publicada só em `127.0.0.1`.
- **Serviço sozinho (T2)**: no deploy isolado não há `USUARIOS_SERVICE_URL`. Aí o auth só cria
  a credencial e o leiloes não valida o leiloeiro nem libera reservas
  (`usuariosClient.estaConfigurado()`); com a URL, valem todas as regras.
- Na nuvem (T2) não há Kong na frente: é por isso que os serviços conferem o token e a
  chave interna sozinhos. Usuarios, leiloes e lances precisam do mesmo
  `JWT_SECRET`/`JWT_ISSUER` do auth-service, e os 4 serviços, da mesma `CHAVE_INTERNA`.
- **Arquivos idênticos entre serviços** (duplicação intencional: cada microsserviço é
  independente). Ao mudar um, copie para os outros:
  - nos 4 serviços: `config/db.js`, `utils/erros.js`, `db/migrar.js`, `middlewares/tratarErros.js`;
  - em auth, leiloes e lances: `clients/http.js`;
  - em usuarios, leiloes e lances: `middlewares/extrairUsuario.js`;
  - nos 4 serviços, também: `config/ambiente.js`.

## Regras de negócio

- A numeração das regras segue o **README** (fonte da verdade) e é a mesma nos comentários,
  nos testes e no `testar-tudo.ps1`.
- Cada service lista suas regras no cabeçalho; cada função indica a regra que implementa
  ("Regra N: ...").
- Ao criar uma regra: numerar no README, no service e nos testes, e cobrir no ponta a ponta
  quando envolver mais de um serviço.

## Comentários

- Estilo **didático**, pensado para quem está aprendendo a programar: pode "poluir" o código.
- Cada arquivo tem um cabeçalho (o que é, em qual camada está, quem chama e quem é chamado).
- **Um único bloco `/** */` por função**: o que recebe, o que faz e o que devolve. Não
  deixar comentário de linha repetindo o bloco logo acima dele.
- Mudança só de comentário **não altera código** no mesmo commit: o `git diff` só pode
  mexer em linhas de comentário.

## Como validar

```powershell
# testes unitarios dos 4 servicos (Node local ou Docker), com resumo;
# cobertura medida sobre todo o src/, minimo de 50% (coverageThreshold)
powershell -ExecutionPolicy Bypass -File .\testes\testar-unitarios.ps1

# ponta a ponta pelo Kong (com a stack no ar: docker compose up --build -d)
powershell -ExecutionPolicy Bypass -File .\testes\testar-tudo.ps1

# colecao Postman pelo newman (com a stack no ar)
docker run --rm -v "${PWD}/testes:/etc/newman" postman/newman:alpine run leilao-microservicos.postman_collection.json --env-var base_url=http://host.docker.internal:8000
```

- Estado atual: 410 testes unitários (cobertura de linhas entre 85% e 91%), 75 passos no
  ponta a ponta e 65 requisições (98 conferências) na coleção Postman, todos passando.
- A coleção e o roteiro manual (`testes/roteiro-de-testes.md`, bash) geram dados novos a
  cada execução; ao mudar uma regra, atualize os dois junto com o `testar-tudo.ps1`.
- Um serviço só: `cd <servico> && npm install && npm test`.
- Onde ficam os testes novos:
  - regras: `tests/<modulo>.test.js`, com repositories e clients mockados (`__mocks__/`);
  - camada HTTP: `tests/rotas.test.js` (supertest, services mockados);
  - clients: `tests/usuariosClient.test.js` (`fetch` mockado; no lances, também
    `tests/leiloesClient.test.js`, com os casos do `clients/http.js`);
  - token: `tests/extrairUsuario.test.js` (idêntico em usuarios, leiloes e lances);
  - chave interna: `usuarios-service/tests/exigirChaveInterna.test.js`;
  - configuração da Saga: `lances-service/tests/configSaga.test.js`;
  - T2: `app.test.js` (`/health`, `/docs`, `/metrics`), `ambiente.test.js`, `db.test.js`,
    `migrar.test.js` e `metricas.test.js`.
- O pipeline de cada serviço com T2 roda `npm ci`, `npm audit --omit=dev --audit-level=critical`,
  `npm test -- --ci` e o build da imagem. O SonarCloud e o deploy no Render são **pulados**
  (com aviso) enquanto os secrets não forem configurados no GitHub.
- Mudou código de um serviço? Reconstrua antes do ponta a ponta:
  `docker compose up -d --build <servico>`.

## Git

- **Git Flow do T2** (pedido na especificação): `main` = HOMOL, `develop` = DEV e uma
  branch **`feature/<nome>`** por tarefa, criada a partir da `develop`. Sempre com o prefixo
  `feature/`, inclusive para correções e documentação (sem `fix/` ou `docs/` no nome da
  branch; o tipo vai na mensagem do commit).
- Caminho de uma mudança: `feature/<nome>` → PR para a `develop` (deploy DEV) → na entrega,
  PR da `develop` para a `main` (deploy HOMOL). Os PRs são juntados pelo GitHub com
  **"Create a merge commit"** (`gh pr create` para abrir).
- **Não apagar** as branches `feature/*` depois do merge: elas ficam no GitHub como
  evidência do Git Flow para a avaliação.
- **Um commit por alteração**, mensagens em português
  (`tipo(escopo): descrição`, ex.: `fix(auth): ...`, `docs: ...`, `test(e2e): ...`).
- Cada commit deixa o projeto funcionando (testes passando).
