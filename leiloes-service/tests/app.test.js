// =============================================================================
// tests/app.test.js  -  testes da parte do T2 no app do leiloes-service
// -----------------------------------------------------------------------------
// /health com versao e ambiente (usado pelo smoke test do deploy), Swagger so no
// DEV e /metrics com a rota padronizada. Repositorios e clients sao trocados por
// mocks (jest.mock): sem banco e sem rede.
// =============================================================================

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
      status: 'ok',
      service: 'leiloes-service',
      versao: '1.1.0',
      ambiente: 'homol',
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

describe('GET /metrics', () => {
  const leilaoRepository = require('../src/repositories/leilaoRepository');

  test('expoe as metricas com a rota padronizada e o ambiente', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue(null);
    const app = criarApp(HOMOL);
    await request(app).get('/leiloes/42');
    await request(app).get('/nao-existe');

    const resposta = await request(app).get('/metrics');
    expect(resposta.status).toBe(200);
    expect(resposta.headers['content-type']).toMatch(/text\/plain/);
    expect(resposta.text).toMatch(
      /leiloes_http_requisicoes_total\{[^}]*rota="\/leiloes\/:id"[^}]*status="404"/
    );
    expect(resposta.text).toMatch(/rota="nao_encontrada"/);
    expect(resposta.text).not.toMatch(/rota="\/leiloes\/42"/);
    expect(resposta.text).toMatch(/ambiente="homol"/);
    expect(resposta.text).toContain('leiloes_process_cpu_seconds_total');
  });

  test('a leitura do /metrics nao conta como requisicao', async () => {
    const app = criarApp(HOMOL);
    await request(app).get('/metrics');
    const resposta = await request(app).get('/metrics');
    expect(resposta.text).not.toMatch(/rota="\/metrics"/);
  });
});

// A documentacao precisa acompanhar as regras do T1: toda rota de escrita
// protegida declara 401 (sem login) e 403 (sem permissao), e toda rota com {id}
// declara 400 (id invalido).
describe('Swagger documenta a autorizacao e a validacao de id', () => {
  const documento = require('../src/docs/openapi')('teste');
  const operacoes = Object.entries(documento.paths).flatMap(([caminho, metodos]) =>
    Object.entries(metodos).map(([metodo, operacao]) => ({ caminho, metodo, operacao }))
  );

  test('POST, PUT, PATCH e DELETE em /leiloes declaram 401 e 403', () => {
    const escrita = operacoes.filter((o) => o.caminho.startsWith('/leiloes') && o.metodo !== 'get');
    expect(escrita.length).toBeGreaterThan(0);
    escrita.forEach(({ operacao }) => expect(Object.keys(operacao.responses)).toEqual(expect.arrayContaining(['401', '403'])));
  });

  test('rotas com {id} declaram 400', () => {
    const comId = operacoes.filter((o) => o.caminho.includes('{id}'));
    comId.forEach(({ operacao }) => expect(operacao.responses).toHaveProperty('400'));
  });

  test('leiloeiroId e opcional no cadastro (vem do token)', () => {
    expect(documento.components.schemas.LeilaoEntrada.required).not.toContain('leiloeiroId');
  });
});
