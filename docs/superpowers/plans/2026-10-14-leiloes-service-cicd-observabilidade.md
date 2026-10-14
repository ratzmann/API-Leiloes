# T2 leiloes-service — CI/CD e Observabilidade: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao `leiloes-service` pipeline próprio (build, testes, SonarCloud, imagem no GHCR, deploy DEV/HOMOL no Render), configuração por ambiente (Swagger só em DEV), métricas Prometheus e dashboard Grafana.

**Architecture:** O código ganha três módulos pequenos — `config/ambiente.js` (o que muda por ambiente), `observabilidade/metricas.js` (prom-client) e `docs/openapi.js` (Swagger) — e o `app.js` vira uma fábrica `criarApp(ambiente)` para testar DEV e HOMOL no mesmo processo. Fora do código: um workflow do GitHub Actions filtrado por `leiloes-service/**`, um script de deploy para o Render e uma stack Prometheus+Grafana provisionada em `leiloes-service/observabilidade/`.

**Tech Stack:** Node 20, Express 4, Jest 29 + supertest, prom-client 15, swagger-ui-express 5, GitHub Actions, SonarCloud, GHCR, Render, Prometheus 2.55, Grafana 11.

**Spec:** `docs/superpowers/specs/2026-10-14-leiloes-service-cicd-observabilidade-design.md`

## Global Constraints

- Código em CommonJS, nomes/mensagens/comentários em português **sem acentos dentro do código**; `.md` com acentos.
- Não alterar outros serviços, o Kong nem o `docker-compose.yml` da raiz.
- Swagger: ligado só se `nome` ∈ {`local`, `dev`} ou `SWAGGER_ENABLED=true`; desligado em qualquer outro caso.
- Cobertura mínima global de 50% (`coverageThreshold`) — falha o `npm test`.
- Versão do serviço: `1.1.0` no `package.json` (SemVer `MAJOR.MINOR.PATCH`).
- Tags git: `leiloes-service-vX.Y.Z`. Imagem: `ghcr.io/<dono-em-minusculas>/leiloes-service`.
- Commits em português, `tipo(leiloes): descrição`, **sem** linha `Co-Authored-By`.
- Nada de `git push` (o Thiago faz depois; ver `leiloes-service/docs/T2-DECISOES.md`).

## Review Focus

- `APP_ENV` esquecido no Render HOMOL (imagem com `NODE_ENV=production`) → Swagger tem de ficar **desligado** (teste em Task 1).
- URL real com id (`/leiloes/42`) não pode virar label de métrica → `rota="/leiloes/:id"` (teste em Task 2).
- Scrape do `/metrics` não pode inflar o contador de requisições (teste em Task 2).
- Banco ainda subindo quando o serviço inicia → `migrar` tenta de novo e só desiste após N tentativas com o último erro (teste em Task 3).
- Smoke test do deploy não pode aceitar a versão **antiga** ainda no ar → compara com `VERSAO_IMAGEM` (tag completa, ex.: `1.1.0-dev.12`), não só `1.1.0` (teste em Task 1: `VERSAO_IMAGEM` vence o package.json).

---

### Task 1: Configuração por ambiente + Swagger + app como fábrica

**Files:**
- Create: `leiloes-service/src/config/ambiente.js`
- Create: `leiloes-service/src/docs/openapi.js`
- Modify: `leiloes-service/src/app.js` (vira `criarApp(ambiente)`)
- Modify: `leiloes-service/src/server.js`
- Modify: `leiloes-service/package.json` (versão 1.1.0, dependências, jest)
- Test: `leiloes-service/tests/ambiente.test.js`, `leiloes-service/tests/app.test.js`

**Interfaces:**
- Produces: `carregarAmbiente(env = process.env) → { nome: string, versao: string, swaggerHabilitado: boolean }`; `criarDocumentoOpenApi(versao: string) → object`; `criarApp(ambiente) → express.Application`.

- [ ] **Step 1: Dependências e versão**

```bash
cd leiloes-service && npm install prom-client@^15.1.3 swagger-ui-express@^5.0.1
```
No `package.json`: `"version": "1.1.0"` e o bloco jest:
```json
"jest": {
  "testEnvironment": "node",
  "collectCoverageFrom": [
    "src/app.js",
    "src/config/**/*.js",
    "src/db/**/*.js",
    "src/docs/**/*.js",
    "src/observabilidade/**/*.js",
    "src/services/**/*.js",
    "src/utils/**/*.js"
  ],
  "coverageThreshold": {
    "global": { "statements": 50, "branches": 50, "functions": 50, "lines": 50 }
  }
}
```

- [ ] **Step 2: Teste que falha — `tests/ambiente.test.js`**

```js
const { carregarAmbiente } = require('../src/config/ambiente');
const { version } = require('../package.json');

describe('carregarAmbiente', () => {
  test('sem variaveis (rodando na maquina): local com swagger', () => {
    expect(carregarAmbiente({})).toEqual({ nome: 'local', versao: version, swaggerHabilitado: true });
  });
  test('dev liga o swagger', () => {
    expect(carregarAmbiente({ APP_ENV: 'dev' }).swaggerHabilitado).toBe(true);
  });
  test('homol desliga o swagger', () => {
    expect(carregarAmbiente({ APP_ENV: 'homol' }).swaggerHabilitado).toBe(false);
  });
  test('APP_ENV esquecido dentro da imagem (NODE_ENV=production) desliga o swagger', () => {
    const ambiente = carregarAmbiente({ NODE_ENV: 'production' });
    expect(ambiente.nome).toBe('desconhecido');
    expect(ambiente.swaggerHabilitado).toBe(false);
  });
  test('SWAGGER_ENABLED explicito vence o padrao', () => {
    expect(carregarAmbiente({ APP_ENV: 'homol', SWAGGER_ENABLED: 'true' }).swaggerHabilitado).toBe(true);
    expect(carregarAmbiente({ APP_ENV: 'dev', SWAGGER_ENABLED: 'false' }).swaggerHabilitado).toBe(false);
  });
  test('APP_ENV em maiusculas e normalizado', () => {
    expect(carregarAmbiente({ APP_ENV: 'DEV' }).nome).toBe('dev');
  });
  test('VERSAO_IMAGEM (tag da imagem) substitui a versao do package.json', () => {
    expect(carregarAmbiente({ VERSAO_IMAGEM: '1.1.0-dev.12' }).versao).toBe('1.1.0-dev.12');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npx jest tests/ambiente.test.js` → FAIL "Cannot find module '../src/config/ambiente'".

- [ ] **Step 4: Implementar `src/config/ambiente.js`**

```js
// config/ambiente.js - o que MUDA de um ambiente para outro (local, dev, homol).
// Le as variaveis de ambiente num lugar so; o resto do codigo recebe o objeto pronto.
const { version } = require('../../package.json');

// Swagger so aparece onde se desenvolve. Qualquer outro nome (homol, producao,
// desconhecido) fica sem Swagger: na duvida, desligado ("fail-closed").
const AMBIENTES_COM_SWAGGER = ['local', 'dev'];

// 'true'/'false' viram booleano; vazio ou ausente vira undefined (= usar o padrao)
function lerBooleano(valor) {
  if (valor === undefined || valor === '') return undefined;
  return String(valor).toLowerCase() === 'true';
}

// Sem APP_ENV: fora de container e 'local'; dentro da imagem Docker
// (NODE_ENV=production) e 'desconhecido', para nunca ligar o Swagger por esquecimento.
function nomeDoAmbiente(env) {
  if (env.APP_ENV) return env.APP_ENV.toLowerCase();
  return env.NODE_ENV === 'production' ? 'desconhecido' : 'local';
}

function carregarAmbiente(env = process.env) {
  const nome = nomeDoAmbiente(env);
  const swaggerExplicito = lerBooleano(env.SWAGGER_ENABLED);
  return {
    nome,
    // VERSAO_IMAGEM e gravada no build da imagem pelo pipeline (ex.: 1.1.0-dev.12)
    versao: env.VERSAO_IMAGEM || version,
    swaggerHabilitado: swaggerExplicito ?? AMBIENTES_COM_SWAGGER.includes(nome),
  };
}

module.exports = { carregarAmbiente };
```

- [ ] **Step 5: Rodar** — `npx jest tests/ambiente.test.js` → PASS (7 testes).

- [ ] **Step 6: Teste que falha — `tests/app.test.js`** (só Swagger e health nesta task; métricas entram na Task 2)

```js
jest.mock('../src/repositories/leilaoRepository');
jest.mock('../src/clients/usuariosClient');

const request = require('supertest');
const criarApp = require('../src/app');

const DEV = { nome: 'dev', versao: '1.1.0-dev.7', swaggerHabilitado: true };
const HOMOL = { nome: 'homol', versao: '1.1.0', swaggerHabilitado: false };

describe('GET /health', () => {
  test('informa versao e ambiente (usado pelo smoke test do deploy)', async () => {
    const resposta = await request(criarApp(HOMOL)).get('/health');
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      status: 'ok', service: 'leiloes-service', versao: '1.1.0', ambiente: 'homol',
    });
  });
});

describe('Swagger por ambiente', () => {
  test('DEV publica a especificacao OpenAPI e a interface', async () => {
    const app = criarApp(DEV);
    const especificacao = await request(app).get('/docs/openapi.json');
    expect(especificacao.status).toBe(200);
    expect(especificacao.body.openapi).toBe('3.0.3');
    expect(especificacao.body.info.version).toBe('1.1.0-dev.7');
    expect(Object.keys(especificacao.body.paths)).toContain('/leiloes/{id}/disponibilidade');

    const interfaceWeb = await request(app).get('/docs/');
    expect(interfaceWeb.status).toBe(200);
    expect(interfaceWeb.text).toContain('swagger-ui');
  });

  test('HOMOL nao expoe o Swagger', async () => {
    const app = criarApp(HOMOL);
    expect((await request(app).get('/docs/')).status).toBe(404);
    expect((await request(app).get('/docs/openapi.json')).status).toBe(404);
  });
});
```

- [ ] **Step 7: Rodar e ver falhar** — `npx jest tests/app.test.js` → FAIL (`criarApp is not a function`).

- [ ] **Step 8: Implementar `src/docs/openapi.js`**

Objeto OpenAPI 3.0.3 escrito à mão (`criarDocumentoOpenApi(versao)`), com `info.version = versao`, `components.securitySchemes.bearerAuth` (JWT validado pelo Kong), schemas `LeilaoEntrada`, `Leilao`, `Disponibilidade`, `Erro`, e os paths: `/health`, `/metrics`, `/leiloes` (GET com filtros `status`/`leiloeiroId`, POST), `/leiloes/{id}` (GET, PUT, DELETE), `/leiloes/{id}/disponibilidade` (GET), `/leiloes/{id}/status` (PATCH), `/leiloes/{id}/abrir|encerrar|cancelar` (PATCH). Respostas de erro referenciam `Erro` (`{ erro: string }`) com os códigos que o service usa (400, 404, 409, 503). Código completo no arquivo (ver Task 1 do commit).

- [ ] **Step 9: Reescrever `src/app.js`**

```js
// app.js - monta a aplicacao Express. E uma FABRICA: recebe o ambiente
// (config/ambiente.js) e devolve o app, assim os testes criam um app "DEV" e
// outro "HOMOL" no mesmo processo.
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const extrairUsuario = require('./middlewares/extrairUsuario');
const leilaoRoutes = require('./routes/leilaoRoutes');
const criarDocumentoOpenApi = require('./docs/openapi');

function criarApp(ambiente) {
  const app = express();
  app.use(express.json());
  app.use(extrairUsuario);

  // versao e ambiente: o smoke test do pipeline confere que a versao nova subiu
  app.get('/health', (req, res) =>
    res.json({ status: 'ok', service: 'leiloes-service', versao: ambiente.versao, ambiente: ambiente.nome })
  );

  // Swagger so no DEV (e local). No HOMOL a rota nem existe: cai no 404.
  if (ambiente.swaggerHabilitado) {
    const documento = criarDocumentoOpenApi(ambiente.versao);
    app.get('/docs/openapi.json', (req, res) => res.json(documento));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(documento));
  }

  app.use('/leiloes', leilaoRoutes);

  app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));
  return app;
}

module.exports = criarApp;
```

- [ ] **Step 10: Ajustar `src/server.js`** (a migração entra na Task 3)

```js
require('dotenv').config();
const criarApp = require('./app');
const { carregarAmbiente } = require('./config/ambiente');

const ambiente = carregarAmbiente();
const PORT = process.env.PORT || 3003;

criarApp(ambiente).listen(PORT, () => {
  console.log(
    `leiloes-service ${ambiente.versao} (${ambiente.nome}) ouvindo na porta ${PORT}` +
      ` - swagger ${ambiente.swaggerHabilitado ? 'em /docs' : 'desligado'}`
  );
});
```

- [ ] **Step 11: Rodar tudo** — `npm test` → todos PASS, cobertura ≥ 50%.

- [ ] **Step 12: Commit**

```bash
git add leiloes-service/package.json leiloes-service/package-lock.json leiloes-service/src leiloes-service/tests
git commit -m "feat(leiloes): configuracao por ambiente e Swagger so no DEV"
```

---

### Task 2: Métricas Prometheus

**Files:**
- Create: `leiloes-service/src/observabilidade/metricas.js`
- Modify: `leiloes-service/src/app.js` (middleware + `/metrics` + rótulos)
- Modify: `leiloes-service/src/services/leilaoService.js` (contadores de negócio)
- Test: `leiloes-service/tests/metricas.test.js`, `leiloes-service/tests/app.test.js`, `leiloes-service/tests/leilaoService.test.js`

**Interfaces:**
- Consumes: `criarApp(ambiente)` da Task 1.
- Produces: `metricas.registro` (prom-client Registry), `definirRotulosPadrao({ ambiente, versao })`, `medirRequisicoes(req, res, next)`, `responderMetricas(req, res)`, `rotaDaRequisicao(req) → string`, `registrarLeilaoCadastrado()`, `registrarMudancaStatus(status)`.

- [ ] **Step 1: Teste que falha — `tests/metricas.test.js`**

```js
const metricas = require('../src/observabilidade/metricas');

async function valorDe(nome, rotulos = {}) {
  const { values } = await metricas.registro.getSingleMetric(nome).get();
  const item = values.find((v) => Object.entries(rotulos).every(([k, val]) => v.labels[k] === val));
  return item ? item.value : 0;
}

describe('contadores de negocio', () => {
  test('registrarLeilaoCadastrado soma 1', async () => {
    const antes = await valorDe('leiloes_cadastrados_total');
    metricas.registrarLeilaoCadastrado();
    expect(await valorDe('leiloes_cadastrados_total')).toBe(antes + 1);
  });
  test('registrarMudancaStatus separa por status', async () => {
    const antes = await valorDe('leiloes_mudancas_status_total', { status: 'ABERTO' });
    metricas.registrarMudancaStatus('ABERTO');
    expect(await valorDe('leiloes_mudancas_status_total', { status: 'ABERTO' })).toBe(antes + 1);
  });
});

describe('rotaDaRequisicao', () => {
  test.each([
    [{ baseUrl: '/leiloes', route: { path: '/:id' } }, '/leiloes/:id'],
    [{ baseUrl: '/leiloes', route: { path: '/' } }, '/leiloes'],
    [{ baseUrl: '', route: { path: '/health' } }, '/health'],
    [{ originalUrl: '/docs/swagger-ui.css' }, '/docs'],
    [{ originalUrl: '/qualquer/coisa' }, 'nao_encontrada'],
  ])('%j -> %s', (req, esperado) => {
    expect(metricas.rotaDaRequisicao(req)).toBe(esperado);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx jest tests/metricas.test.js` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `src/observabilidade/metricas.js`**

```js
// observabilidade/metricas.js - metricas no formato do Prometheus (prom-client).
// O Prometheus "raspa" GET /metrics a cada 15 s; o Grafana desenha os graficos.
const client = require('prom-client');

// Registro proprio (em vez do global) para o servico controlar o que expoe.
const registro = new client.Registry();
// CPU, memoria, event loop, GC... do Node, com prefixo leiloes_
client.collectDefaultMetrics({ register: registro, prefix: 'leiloes_' });

const ROTULOS_HTTP = ['metodo', 'rota', 'status'];

const requisicoesHttp = new client.Counter({
  name: 'leiloes_http_requisicoes_total',
  help: 'Total de requisicoes HTTP atendidas pelo leiloes-service',
  labelNames: ROTULOS_HTTP,
  registers: [registro],
});

const duracaoHttp = new client.Histogram({
  name: 'leiloes_http_duracao_segundos',
  help: 'Tempo de resposta das requisicoes HTTP, em segundos',
  labelNames: ROTULOS_HTTP,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registro],
});

const leiloesCadastrados = new client.Counter({
  name: 'leiloes_cadastrados_total',
  help: 'Leiloes cadastrados com sucesso',
  registers: [registro],
});

const mudancasStatus = new client.Counter({
  name: 'leiloes_mudancas_status_total',
  help: 'Mudancas de status de leilao, pelo status de destino',
  labelNames: ['status'],
  registers: [registro],
});

// Rotulos fixos em TODAS as metricas: de qual servico, ambiente e versao vieram.
function definirRotulosPadrao({ ambiente, versao }) {
  registro.setDefaultLabels({ service: 'leiloes-service', ambiente, versao });
}

// Usa o PADRAO da rota (/leiloes/:id), nunca a URL real (/leiloes/42): cada id
// diferente criaria uma serie nova no Prometheus ("explosao de cardinalidade").
function rotaDaRequisicao(req) {
  if (req.route && req.route.path) {
    const caminho = req.route.path === '/' ? '' : req.route.path;
    return `${req.baseUrl || ''}${caminho}` || '/';
  }
  if ((req.originalUrl || '').startsWith('/docs')) return '/docs';
  return 'nao_encontrada';
}

// Middleware: mede cada requisicao quando a resposta termina ('finish').
function medirRequisicoes(req, res, next) {
  // o proprio scrape do Prometheus nao conta como trafego da aplicacao
  if (req.path === '/metrics') return next();
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const rotulos = { metodo: req.method, rota: rotaDaRequisicao(req), status: String(res.statusCode) };
    requisicoesHttp.inc(rotulos);
    duracaoHttp.observe(rotulos, Number(process.hrtime.bigint() - inicio) / 1e9);
  });
  return next();
}

async function responderMetricas(req, res) {
  res.set('Content-Type', registro.contentType);
  res.end(await registro.metrics());
}

function registrarLeilaoCadastrado() {
  leiloesCadastrados.inc();
}

function registrarMudancaStatus(status) {
  mudancasStatus.inc({ status });
}

module.exports = {
  registro,
  definirRotulosPadrao,
  rotaDaRequisicao,
  medirRequisicoes,
  responderMetricas,
  registrarLeilaoCadastrado,
  registrarMudancaStatus,
};
```

- [ ] **Step 4: Rodar** — `npx jest tests/metricas.test.js` → PASS.

- [ ] **Step 5: Teste que falha — acrescentar em `tests/app.test.js`**

```js
const leilaoRepository = require('../src/repositories/leilaoRepository');

describe('GET /metrics', () => {
  test('expoe as metricas com a rota padronizada e o ambiente', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue(null);
    const app = criarApp(HOMOL);
    await request(app).get('/leiloes/42');
    await request(app).get('/nao-existe');

    const resposta = await request(app).get('/metrics');
    expect(resposta.status).toBe(200);
    expect(resposta.headers['content-type']).toMatch(/text\/plain/);
    expect(resposta.text).toMatch(/leiloes_http_requisicoes_total\{[^}]*rota="\/leiloes\/:id"[^}]*status="404"/);
    expect(resposta.text).toMatch(/rota="nao_encontrada"/);
    expect(resposta.text).not.toMatch(/rota="\/leiloes\/42"/);
    expect(resposta.text).toMatch(/ambiente="homol"/);
    expect(resposta.text).toContain('leiloes_process_cpu_seconds_total');
  });

  test('o scrape do /metrics nao conta como requisicao', async () => {
    const app = criarApp(HOMOL);
    await request(app).get('/metrics');
    const resposta = await request(app).get('/metrics');
    expect(resposta.text).not.toMatch(/rota="\/metrics"/);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar** — `npx jest tests/app.test.js` → FAIL (404 em `/metrics`).

- [ ] **Step 7: Ligar no `app.js`** — dentro de `criarApp`, antes de `express.json()`:

```js
  // rotulos ambiente/versao em todas as metricas + medicao de cada requisicao
  metricas.definirRotulosPadrao({ ambiente: ambiente.nome, versao: ambiente.versao });
  app.use(metricas.medirRequisicoes);
```
e depois do `/health`:
```js
  // lido pelo Prometheus (ver observabilidade/prometheus/prometheus.yml)
  app.get('/metrics', metricas.responderMetricas);
```
com `const metricas = require('./observabilidade/metricas');` no topo.

- [ ] **Step 8: Teste que falha — contadores no service (`tests/leilaoService.test.js`)**

No topo: `const metricas = require('../src/observabilidade/metricas');`. No fim:

```js
describe('metricas de negocio', () => {
  test('cadastro com sucesso soma em leiloes_cadastrados_total', async () => {
    const espiao = jest.spyOn(metricas, 'registrarLeilaoCadastrado');
    leilaoRepository.listarAtivosPorLeiloeiro.mockResolvedValue([]);
    leilaoRepository.criar.mockResolvedValue({ id: 1, status: 'AGENDADO' });
    await leilaoService.cadastrar(leilaoValido());
    expect(espiao).toHaveBeenCalledTimes(1);
    espiao.mockRestore();
  });

  test('cadastro recusado nao soma', async () => {
    const espiao = jest.spyOn(metricas, 'registrarLeilaoCadastrado');
    await expect(leilaoService.cadastrar(leilaoValido({ titulo: 'x' }))).rejects.toThrow();
    expect(espiao).not.toHaveBeenCalled();
    espiao.mockRestore();
  });

  test('mudanca de status aceita soma pelo status de destino', async () => {
    const espiao = jest.spyOn(metricas, 'registrarMudancaStatus');
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'AGENDADO' });
    leilaoRepository.atualizarStatus.mockResolvedValue({ id: 1, status: 'ABERTO' });
    await leilaoService.abrir(1);
    expect(espiao).toHaveBeenCalledWith('ABERTO');
    espiao.mockRestore();
  });

  test('transicao recusada nao soma', async () => {
    const espiao = jest.spyOn(metricas, 'registrarMudancaStatus');
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'ENCERRADO' });
    await expect(leilaoService.abrir(1)).rejects.toThrow();
    expect(espiao).not.toHaveBeenCalled();
    espiao.mockRestore();
  });
});
```

- [ ] **Step 9: Implementar no `leilaoService.js`** — `const metricas = require('../observabilidade/metricas');`; em `cadastrar`, guardar o retorno de `leilaoRepository.criar(...)` em `const criado`, chamar `metricas.registrarLeilaoCadastrado()` e `return criado`; em `alterarStatus`, idem com `atualizarStatus` e `metricas.registrarMudancaStatus(novoStatus)`.

- [ ] **Step 10: Rodar** — `npm test` → PASS.

- [ ] **Step 11: Commit** — `git commit -m "feat(leiloes): metricas Prometheus em /metrics"`

---

### Task 3: Banco em nuvem (`DATABASE_URL`) e migração ao iniciar

**Files:**
- Modify: `leiloes-service/src/config/db.js`
- Create: `leiloes-service/src/db/migrar.js`
- Modify: `leiloes-service/src/server.js`, `leiloes-service/.env.example`
- Test: `leiloes-service/tests/db.test.js`, `leiloes-service/tests/migrar.test.js`

**Interfaces:**
- Produces: `opcoesDeConexao(env = process.env) → pg.PoolConfig` (exportada como propriedade do pool); `migrar({ tentativas = 10, esperaMs = 2000, banco = pool } = {}) → Promise<void>`.

- [ ] **Step 1: Testes que falham**

`tests/db.test.js`:
```js
const { opcoesDeConexao } = require('../src/config/db');

describe('opcoesDeConexao', () => {
  test('DATABASE_URL (Render/Neon) tem prioridade e liga SSL com DB_SSL=true', () => {
    expect(opcoesDeConexao({ DATABASE_URL: 'postgres://u:s@h:5432/leiloes', DB_SSL: 'true', DB_HOST: 'ignorado' }))
      .toEqual({ connectionString: 'postgres://u:s@h:5432/leiloes', ssl: true });
  });
  test('sem DATABASE_URL usa as variaveis DB_* do docker-compose, sem SSL', () => {
    expect(opcoesDeConexao({ DB_HOST: 'leiloes-db', DB_PORT: '5432', DB_USER: 'u', DB_PASSWORD: 's', DB_NAME: 'leiloes_db' }))
      .toEqual({ host: 'leiloes-db', port: '5432', user: 'u', password: 's', database: 'leiloes_db', ssl: undefined });
  });
});
```

`tests/migrar.test.js`:
```js
const migrar = require('../src/db/migrar');

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('executa o init.sql (idempotente)', async () => {
  const banco = { query: jest.fn().mockResolvedValue({}) };
  await migrar({ banco });
  expect(banco.query).toHaveBeenCalledTimes(1);
  expect(banco.query.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS leiloes');
});

test('tenta de novo enquanto o banco ainda esta subindo', async () => {
  const banco = { query: jest.fn()
    .mockRejectedValueOnce(new Error('ECONNREFUSED'))
    .mockRejectedValueOnce(new Error('ECONNREFUSED'))
    .mockResolvedValue({}) };
  await migrar({ banco, esperaMs: 0 });
  expect(banco.query).toHaveBeenCalledTimes(3);
});

test('desiste depois das tentativas e devolve o ultimo erro', async () => {
  const banco = { query: jest.fn().mockRejectedValue(new Error('senha invalida')) };
  await expect(migrar({ banco, tentativas: 3, esperaMs: 0 })).rejects.toThrow('senha invalida');
  expect(banco.query).toHaveBeenCalledTimes(3);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx jest tests/db.test.js tests/migrar.test.js` → FAIL.

- [ ] **Step 3: Implementar `src/config/db.js`**

```js
const { Pool } = require('pg');

// Em nuvem (Neon/Render) o provedor entrega uma DATABASE_URL pronta; no
// docker-compose continuam as variaveis DB_* separadas. DB_SSL=true liga o SSL,
// exigido pelos bancos gerenciados.
function opcoesDeConexao(env = process.env) {
  const ssl = String(env.DB_SSL).toLowerCase() === 'true' ? true : undefined;
  if (env.DATABASE_URL) return { connectionString: env.DATABASE_URL, ssl };
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl,
  };
}

const pool = new Pool(opcoesDeConexao());

module.exports = pool;
module.exports.opcoesDeConexao = opcoesDeConexao;
```

- [ ] **Step 4: Implementar `src/db/migrar.js`**

```js
// db/migrar.js - cria a tabela ao iniciar. No docker-compose o Postgres roda o
// init.sql sozinho, mas no Render o banco e gerenciado e chega vazio. O SQL e
// todo IF NOT EXISTS, entao rodar a cada inicio nao estraga nada.
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// tenta varias vezes porque o banco pode ainda estar subindo (ou acordando, no plano free)
async function migrar({ tentativas = 10, esperaMs = 2000, banco = pool } = {}) {
  const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
  for (let tentativa = 1; ; tentativa++) {
    try {
      await banco.query(sql);
      return;
    } catch (err) {
      if (tentativa >= tentativas) throw err;
      console.warn(`Banco indisponivel (tentativa ${tentativa}/${tentativas}): ${err.message}`);
      await esperar(esperaMs);
    }
  }
}

module.exports = migrar;
```

- [ ] **Step 5: `src/server.js` roda a migração antes de abrir a porta**

```js
require('dotenv').config();
const criarApp = require('./app');
const { carregarAmbiente } = require('./config/ambiente');
const migrar = require('./db/migrar');

const ambiente = carregarAmbiente();
const PORT = process.env.PORT || 3003;

migrar()
  .then(() => {
    criarApp(ambiente).listen(PORT, () => {
      console.log(
        `leiloes-service ${ambiente.versao} (${ambiente.nome}) ouvindo na porta ${PORT}` +
          ` - swagger ${ambiente.swaggerHabilitado ? 'em /docs' : 'desligado'}`
      );
    });
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco do leiloes-service:', err.message);
    process.exit(1);
  });
```

- [ ] **Step 6: `.env.example`** — acrescentar `APP_ENV`, `SWAGGER_ENABLED`, `DATABASE_URL`, `DB_SSL` comentados; remover `JWT_SECRET`/`JWT_ISSUER` (o serviço não usa — só decodifica o token).

- [ ] **Step 7: Rodar** — `npm test` → PASS.

- [ ] **Step 8: Commit** — `git commit -m "feat(leiloes): DATABASE_URL e migracao ao iniciar para rodar no Render"`

---

### Task 4: Dockerfile pronto para o pipeline

**Files:**
- Modify: `leiloes-service/Dockerfile`
- Create: `leiloes-service/.dockerignore`

- [ ] **Step 1: Dockerfile**

```dockerfile
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# npm ci: instala exatamente o package-lock.json (build reprodutivel)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# versao gravada pelo pipeline (ex.: 1.1.0-dev.12); vazia = usa a do package.json
ARG VERSAO_IMAGEM=""
ENV VERSAO_IMAGEM=${VERSAO_IMAGEM}

# nao roda como root
USER node
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3003}/health" > /dev/null || exit 1

CMD ["node", "src/server.js"]
```

- [ ] **Step 2: `.dockerignore`**

```
node_modules
coverage
tests
observabilidade
docs
ci
.env
*.md
```

- [ ] **Step 3: Verificar** — `docker build --build-arg VERSAO_IMAGEM=1.1.0-teste -t leiloes-service:teste leiloes-service` e `docker run --rm -e APP_ENV=homol leiloes-service:teste node -e "console.log(require('./src/config/ambiente').carregarAmbiente())"` → `{ nome: 'homol', versao: '1.1.0-teste', swaggerHabilitado: false }`.

- [ ] **Step 4: Commit** — `git commit -m "build(leiloes): Dockerfile com npm ci, usuario nao-root, healthcheck e versao da imagem"`

---

### Task 5: Pipeline GitHub Actions + SonarCloud + Dependabot

**Files:**
- Create: `.github/workflows/leiloes-service.yml`
- Create: `leiloes-service/ci/deploy-render.sh`
- Create: `leiloes-service/sonar-project.properties`
- Create: `.github/dependabot.yml`

**Interfaces:**
- Consumes: `npm test` (Task 1), Dockerfile com `ARG VERSAO_IMAGEM` (Task 4), `/health` com `versao` (Task 1).
- Produces: secrets/vars esperados — `SONAR_TOKEN`, `vars.SONAR_ORGANIZATION`, `vars.SONAR_PROJECT_KEY` (repositório); `RENDER_DEPLOY_HOOK_URL` e `vars.RENDER_URL` (environments `dev` e `homol`).

- [ ] **Step 1: Workflow** — jobs `ci` → `versao` → `imagem` → `deploy-dev`/`deploy-homol`, exatamente como na seção 3.1 da spec (arquivo completo no commit). Pontos obrigatórios:
  - `paths: ['leiloes-service/**', '.github/workflows/leiloes-service.yml']` em push e PR;
  - `permissions: contents: read` no topo; `packages: write` + `contents: write` só em `imagem`;
  - Sonar pulado com `::warning::` se faltar token ou vars;
  - `versao` falha em main se a tag `leiloes-service-vX.Y.Z` já existir em outro commit;
  - `imagem` passa `build-args: VERSAO_IMAGEM=<tag>`; `push` só quando `publicar == 'true'`;
  - deploys com `environment: { name: dev|homol, url: ${{ vars.RENDER_URL }} }` chamando `leiloes-service/ci/deploy-render.sh`.

- [ ] **Step 2: `ci/deploy-render.sh`**

```bash
#!/usr/bin/env bash
# Dispara o deploy da imagem no Render e espera a versao nova responder no /health.
# Variaveis: RENDER_DEPLOY_HOOK_URL (secret), RENDER_URL, IMAGEM, VERSAO_ESPERADA.
set -euo pipefail
: "${IMAGEM:?IMAGEM nao informada}" "${VERSAO_ESPERADA:?VERSAO_ESPERADA nao informada}"

if [ -z "${RENDER_DEPLOY_HOOK_URL:-}" ]; then
  echo "::warning::Secret RENDER_DEPLOY_HOOK_URL nao configurado neste environment; deploy pulado."
  exit 0
fi

# o hook do Render ja vem com ?key=...; o imgURL troca so a TAG da imagem
IMG_CODIFICADA=$(jq -rn --arg v "$IMAGEM" '$v|@uri')
case "$RENDER_DEPLOY_HOOK_URL" in *\?*) SEP='&' ;; *) SEP='?' ;; esac
echo "Disparando deploy de $IMAGEM"
curl -fsS -X POST "${RENDER_DEPLOY_HOOK_URL}${SEP}imgURL=${IMG_CODIFICADA}" > /dev/null

if [ -z "${RENDER_URL:-}" ]; then
  echo "::warning::Variavel RENDER_URL nao configurada; smoke test pulado."
  exit 0
fi

# smoke test: ate 60 x 10 s (o plano free do Render pode estar "dormindo")
for tentativa in $(seq 1 60); do
  VERSAO=$(curl -fsS --max-time 10 "$RENDER_URL/health" 2>/dev/null | jq -r '.versao // empty' 2>/dev/null || true)
  echo "tentativa $tentativa: versao no ar = ${VERSAO:-indisponivel} (esperada $VERSAO_ESPERADA)"
  if [ "$VERSAO" = "$VERSAO_ESPERADA" ]; then
    echo "Deploy confirmado: $RENDER_URL esta com a versao $VERSAO_ESPERADA"
    exit 0
  fi
  sleep 10
done
echo "::error::A versao $VERSAO_ESPERADA nao apareceu em $RENDER_URL/health em 10 minutos."
exit 1
```

- [ ] **Step 3: `sonar-project.properties`**

```properties
sonar.projectName=leiloes-service
sonar.sources=src
sonar.tests=tests
sonar.exclusions=src/**/__mocks__/**
sonar.javascript.lcov.reportPaths=coverage/lcov.info
# mesmo escopo de cobertura do Jest (package.json > jest.collectCoverageFrom)
sonar.coverage.exclusions=src/server.js,src/controllers/**,src/repositories/**,src/routes/**,src/clients/**,src/middlewares/**
sonar.sourceEncoding=UTF-8
```

- [ ] **Step 4: `.github/dependabot.yml`** — `npm` e `docker` em `/leiloes-service`, `github-actions` em `/`, semanal, `target-branch: develop`, commit prefix `chore(leiloes)`/`ci`.

- [ ] **Step 5: Verificar** — `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -color` → sem erros; `bash -n leiloes-service/ci/deploy-render.sh`; teste do script com hook falso (servidor local) se possível.

- [ ] **Step 6: Commit** — `git commit -m "ci(leiloes): pipeline com testes, SonarCloud, imagem no GHCR e deploy no Render"` e `git commit -m "chore: Dependabot para o leiloes-service"`.

---

### Task 6: Stack de observabilidade (Prometheus + Grafana)

**Files:**
- Create: `leiloes-service/observabilidade/docker-compose.yml`
- Create: `leiloes-service/observabilidade/prometheus/prometheus.yml`
- Create: `leiloes-service/observabilidade/grafana/provisioning/datasources/prometheus.yml`
- Create: `leiloes-service/observabilidade/grafana/provisioning/dashboards/dashboards.yml`
- Create: `leiloes-service/observabilidade/grafana/dashboards/leiloes-service.json`
- Create: `leiloes-service/observabilidade/gerar-trafego.ps1`

- [ ] **Step 1:** compose com `leiloes-db`, `leiloes-service` (build `..`, `APP_ENV=local`, porta 3003), `prometheus` (`prom/prometheus:v2.55.1`, 9090), `grafana` (`grafana/grafana:11.3.0`, 3000, admin/admin, anônimo como Viewer, dashboard inicial).
- [ ] **Step 2:** `prometheus.yml` com jobs `leiloes-service-local` (`leiloes-service:3003`), `leiloes-service-dev` e `leiloes-service-homol` (`https`, `leiloes-service-dev.onrender.com` / `leiloes-service-homol.onrender.com`), label de alvo `alvo`.
- [ ] **Step 3:** datasource uid `prometheus`; provider de dashboards lendo `/var/lib/grafana/dashboards`.
- [ ] **Step 4:** dashboard com variável `ambiente` e painéis: serviço no ar (`up`), versão no ar por ambiente, requisições/s por rota, respostas por status, taxa de erro 5xx (%), latência p95, leilões cadastrados no período, mudanças de status no período, memória residente, event loop lag p99.
- [ ] **Step 5:** `gerar-trafego.ps1` (cadastra, abre, encerra, cancela, provoca 400/404/409).
- [ ] **Step 6: Verificar** — `docker compose -f leiloes-service/observabilidade/docker-compose.yml up -d --build`; `curl localhost:3003/health`; rodar o script; `curl 'localhost:9090/api/v1/query?query=sum(leiloes_http_requisicoes_total)'` > 0; `curl -u admin:admin localhost:3000/api/dashboards/uid/leiloes-service` → 200; derrubar.
- [ ] **Step 7: Commit** — `git commit -m "feat(leiloes): Prometheus e Grafana com dashboard provisionado"`

---

### Task 7: Documentação

**Files:**
- Create: `leiloes-service/docs/T2-DECISOES.md`
- Modify: `leiloes-service/README.md`, `README.md` (raiz: um parágrafo apontando para o T2 do leiloes-service)

- [ ] **Step 1:** `T2-DECISOES.md` — por requisito: o que foi feito, decisão, por quê, alternativas descartadas, como funciona; passo a passo de configuração (push dos branches, GHCR, Neon, Render DEV/HOMOL, SonarCloud, secrets/vars/environments, proteção de branches); roteiro de apresentação e perguntas prováveis.
- [ ] **Step 2:** README do serviço — seção T2 com variáveis de ambiente, `/metrics`, `/docs`, como rodar a observabilidade.
- [ ] **Step 3: Commit** — `git commit -m "docs(leiloes): decisoes e guia do T2"`

---

## Verificação final

- `cd leiloes-service && npm ci && npm test` → tudo PASS, cobertura ≥ 50%.
- `actionlint` sem erros.
- `docker build` ok; stack de observabilidade sobe e o dashboard mostra dados.
- `git log develop..feature/leiloes-service-cicd` sem `Co-Authored-By`.
