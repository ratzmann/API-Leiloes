// =============================================================================
// tests/rotas.test.js  -  testes da camada HTTP (rotas + controllers + middleware)
// -----------------------------------------------------------------------------
// Os outros arquivos testam as REGRAS (lanceService, regrasDoLance) e a SAGA.
// Este testa o caminho HTTP: rota -> controller -> service, com o STATUS certo.
//   - supertest faz requisicoes HTTP de verdade contra o `app` do Express;
//   - o lanceService e mockado (jest.mock): sem banco, sem Saga, sem rede;
//   - o token e gerado com jwt.sign so para o middleware ter o que decodificar.
// =============================================================================

jest.mock('../src/services/lanceService');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const lanceService = require('../src/services/lanceService');
const { ErroDeValidacao } = require('../src/utils/erros');

// token de um licitante logado (perfilId 2)
const payloadLicitante = { sub: 20, papel: 'LICITANTE', perfilId: 2 };
const bearer = `Bearer ${jwt.sign(payloadLicitante, 'segredo-qualquer')}`;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  delete process.env.SAGA_PERMITIR_FALHA_SIMULADA;
});

describe('app', () => {
  test('GET /health responde 200 e rota inexistente responde 404', async () => {
    expect((await request(app).get('/health')).body.service).toBe('lances-service');
    expect((await request(app).get('/nao-existe')).status).toBe(404);
  });
});

describe('POST /lances (inicia a Saga)', () => {
  test('responde 201 e repassa corpo + usuario logado ao service', async () => {
    lanceService.registrarLance.mockResolvedValue({ id: 5, sagaId: 9, sagaStatus: 'CONCLUIDA' });

    const res = await request(app).post('/lances').set('Authorization', bearer).send({ leilaoId: 1, valor: 1000 });

    expect(res.status).toBe(201);
    expect(res.body.sagaStatus).toBe('CONCLUIDA');
    expect(lanceService.registrarLance).toHaveBeenCalledWith({
      leilaoId: 1,
      licitanteId: undefined,
      valor: 1000,
      usuario: expect.objectContaining(payloadLicitante),
      simularFalha: null,
    });
  });

  test('o header X-Simular-Falha so vale com SAGA_PERMITIR_FALHA_SIMULADA=true', async () => {
    lanceService.registrarLance.mockResolvedValue({ id: 5 });

    await request(app).post('/lances').set('X-Simular-Falha', 'gravar-lance').send({});
    expect(lanceService.registrarLance.mock.calls[0][0].simularFalha).toBeNull();

    process.env.SAGA_PERMITIR_FALHA_SIMULADA = 'true';
    await request(app).post('/lances').set('X-Simular-Falha', 'gravar-lance').send({});
    expect(lanceService.registrarLance.mock.calls[1][0].simularFalha).toBe('gravar-lance');
  });

  test('erro da Saga devolve o codigo e o sagaId no corpo', async () => {
    const erro = new ErroDeValidacao('Credito insuficiente', 409);
    erro.sagaId = 12;
    lanceService.registrarLance.mockRejectedValue(erro);

    const res = await request(app).post('/lances').set('Authorization', bearer).send({});

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ erro: 'Credito insuficiente', sagaId: 12 });
  });

  test('403 de autorizacao sai sem sagaId; erro inesperado vira 500', async () => {
    lanceService.registrarLance.mockRejectedValueOnce(new ErroDeValidacao('Apenas licitantes podem dar lances.', 403));
    const proibido = await request(app).post('/lances').send({});
    expect(proibido.status).toBe(403);
    expect(proibido.body).toEqual({ erro: 'Apenas licitantes podem dar lances.' });

    lanceService.registrarLance.mockRejectedValueOnce(new Error('bug'));
    expect((await request(app).post('/lances').send({})).status).toBe(500);
  });
});

describe('rotas de consulta de lances', () => {
  test('GET /lances, /lances/:id, /leilao/:id e /leilao/:id/maior', async () => {
    lanceService.listar.mockResolvedValue([]);
    lanceService.buscarPorId.mockResolvedValue({ id: 3 });
    lanceService.buscarPorLeilao.mockResolvedValue([{ id: 3 }]);
    lanceService.buscarMaiorPorLeilao.mockResolvedValue({ id: 3, valor: '1500.00' });

    expect((await request(app).get('/lances')).status).toBe(200);
    expect((await request(app).get('/lances/3')).body).toEqual({ id: 3 });
    expect((await request(app).get('/lances/leilao/1')).body).toHaveLength(1);
    expect((await request(app).get('/lances/leilao/1/maior')).body.valor).toBe('1500.00');
    expect(lanceService.buscarPorId).toHaveBeenCalledWith('3');
    expect(lanceService.buscarPorLeilao).toHaveBeenCalledWith('1');
  });

  test('erros viram resposta HTTP (404 e 500)', async () => {
    lanceService.buscarMaiorPorLeilao.mockRejectedValue(new ErroDeValidacao('Nenhum lance encontrado', 404));
    lanceService.listar.mockRejectedValue(new Error('bug'));
    lanceService.buscarPorId.mockRejectedValue(new Error('bug'));
    lanceService.buscarPorLeilao.mockRejectedValue(new Error('bug'));

    expect((await request(app).get('/lances/leilao/1/maior')).status).toBe(404);
    expect((await request(app).get('/lances')).status).toBe(500);
    expect((await request(app).get('/lances/3')).status).toBe(500);
    expect((await request(app).get('/lances/leilao/1')).status).toBe(500);
  });
});

describe('rotas de sagas', () => {
  test('GET /lances/sagas chama listarSagas (e nao buscarPorId com id "sagas")', async () => {
    lanceService.listarSagas.mockResolvedValue([]);
    await request(app).get('/lances/sagas');
    expect(lanceService.listarSagas).toHaveBeenCalled();
    expect(lanceService.buscarPorId).not.toHaveBeenCalled();
  });

  test('GET /lances/sagas/:id e POST /reprocessar', async () => {
    lanceService.buscarSaga.mockResolvedValue({ id: 9, status: 'CONCLUIDA' });
    lanceService.reprocessarSaga.mockResolvedValue({ id: 9, status: 'CONCLUIDA' });

    expect((await request(app).get('/lances/sagas/9')).body.status).toBe('CONCLUIDA');
    expect((await request(app).post('/lances/sagas/9/reprocessar')).status).toBe(200);
    expect(lanceService.reprocessarSaga).toHaveBeenCalledWith('9');
  });

  test('erros das rotas de sagas viram resposta HTTP', async () => {
    const pendente = new ErroDeValidacao('usuarios-service ainda indisponivel', 503);
    pendente.sagaId = 9;
    lanceService.reprocessarSaga.mockRejectedValue(pendente);
    lanceService.listarSagas.mockRejectedValue(new Error('bug'));
    lanceService.buscarSaga.mockRejectedValue(new ErroDeValidacao('Saga nao encontrada.', 404));

    const res = await request(app).post('/lances/sagas/9/reprocessar');
    expect(res.status).toBe(503);
    expect(res.body.sagaId).toBe(9);
    expect((await request(app).get('/lances/sagas')).status).toBe(500);
    expect((await request(app).get('/lances/sagas/99')).status).toBe(404);
  });
});
