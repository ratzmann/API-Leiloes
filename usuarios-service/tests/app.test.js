jest.mock('../src/repositories/leiloeiroRepository');
jest.mock('../src/repositories/licitanteRepository');
jest.mock('../src/repositories/reservaRepository');

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
      service: 'usuarios-service',
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
      expect.arrayContaining([
        '/leiloeiros/{id}',
        '/licitantes/{id}/credito',
        '/licitantes/{id}/reservas/{reservaId}/liberar',
      ])
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
});

describe('GET /metrics', () => {
  const licitanteRepository = require('../src/repositories/licitanteRepository');

  test('expoe as metricas com a rota padronizada e o ambiente', async () => {
    licitanteRepository.buscarPorId.mockResolvedValue(null);
    const app = criarApp(HOMOL);
    await request(app).get('/licitantes/42');
    await request(app).get('/nao-existe');

    const resposta = await request(app).get('/metrics');
    expect(resposta.status).toBe(200);
    expect(resposta.headers['content-type']).toMatch(/text\/plain/);
    expect(resposta.text).toMatch(
      /usuarios_http_requisicoes_total\{[^}]*rota="\/licitantes\/:id"[^}]*status="404"/
    );
    expect(resposta.text).toMatch(/rota="nao_encontrada"/);
    expect(resposta.text).not.toMatch(/rota="\/licitantes\/42"/);
    expect(resposta.text).toMatch(/ambiente="homol"/);
    expect(resposta.text).toContain('usuarios_process_cpu_seconds_total');
  });

  test('a leitura do /metrics nao conta como requisicao', async () => {
    const app = criarApp(HOMOL);
    await request(app).get('/metrics');
    const resposta = await request(app).get('/metrics');
    expect(resposta.text).not.toMatch(/rota="\/metrics"/);
  });
});
