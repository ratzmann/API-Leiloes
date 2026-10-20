// =============================================================================
// tests/app.test.js  -  testes da parte do T2 no app do lances-service
// -----------------------------------------------------------------------------
// /health com versao e ambiente (usado pelo smoke test do deploy), Swagger so
// no DEV e /metrics com a rota padronizada. Repositorios e clients sao trocados
// por mocks (jest.mock): sem banco e sem rede.
// =============================================================================

jest.mock('../src/repositories/lanceRepository');
jest.mock('../src/repositories/sagaRepository');
jest.mock('../src/clients/leiloesClient');
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
      service: 'lances-service',
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
    expect(Object.keys(especificacao.body.paths)).toEqual(
      expect.arrayContaining(['/lances', '/lances/sagas/{id}/reprocessar', '/lances/leilao/{leilaoId}/maior'])
    );
    const interfaceWeb = await request(app).get('/docs/');
    expect(interfaceWeb.status).toBe(200);
    expect(interfaceWeb.text).toContain('swagger-ui');
  });

  test('HOMOL nao expoe o Swagger', async () => {
    const app = criarApp(HOMOL);
    expect((await request(app).get('/docs/')).status).toBe(404);
    expect((await request(app).get('/docs/openapi.json')).status).toBe(404);
  });

  test('dar lance declara 401 e 403 (autorizacao) e as rotas com id declaram 400', () => {
    const documento = require('../src/docs/openapi')('teste');
    expect(Object.keys(documento.paths['/lances'].post.responses)).toEqual(
      expect.arrayContaining(['401', '403'])
    );
    Object.entries(documento.paths)
      .filter(([caminho]) => caminho.includes('{'))
      .forEach(([, metodos]) => Object.values(metodos).forEach((op) => expect(op.responses).toHaveProperty('400')));
  });
});

describe('GET /metrics', () => {
  test('expoe as metricas com a rota padronizada e o ambiente', async () => {
    const app = criarApp(HOMOL);
    // lance inexistente: o erro sai do router por next(err) e a rota medida
    // continua com o prefixo (/lances/:id), nunca com o id (/lances/42)
    await request(app).get('/lances/42');
    await request(app).get('/nao-existe');

    const resposta = await request(app).get('/metrics');
    expect(resposta.status).toBe(200);
    expect(resposta.headers['content-type']).toMatch(/text\/plain/);
    expect(resposta.text).toMatch(/lances_http_requisicoes_total\{[^}]*rota="\/lances\/:id"[^}]*status="404"/);
    expect(resposta.text).toMatch(/rota="nao_encontrada"/);
    expect(resposta.text).not.toMatch(/rota="\/lances\/42"/);
    expect(resposta.text).toMatch(/ambiente="homol"/);
    expect(resposta.text).toContain('lances_process_cpu_seconds_total');
  });

  test('a leitura do /metrics nao conta como requisicao', async () => {
    const app = criarApp(HOMOL);
    await request(app).get('/metrics');
    const resposta = await request(app).get('/metrics');
    expect(resposta.text).not.toMatch(/rota="\/metrics"/);
  });
});
