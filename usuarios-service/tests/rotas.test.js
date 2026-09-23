// =============================================================================
// tests/rotas.test.js  -  testes da camada HTTP (rotas + controllers + middleware)
// -----------------------------------------------------------------------------
// Os outros arquivos testam as REGRAS (services). Este testa se o caminho HTTP
// esta certo: a rota chama o controller certo, o controller repassa os dados
// certos ao service e devolve o STATUS HTTP certo (200, 201, 204, 4xx, 500).
//
// Como funciona:
//   - supertest faz requisicoes HTTP de verdade contra o `app` do Express,
//     sem abrir porta e sem precisar do Docker;
//   - os SERVICES sao mockados (jest.mock): assim nao ha banco nem regra de
//     negocio aqui, so a "traducao" HTTP <-> service;
//   - o token e gerado com jwt.sign so para o middleware extrairUsuario ter o
//     que decodificar (quem confere a assinatura de verdade e o Kong).
// =============================================================================

jest.mock('../src/services/leiloeiroService');
jest.mock('../src/services/licitanteService');
jest.mock('../src/services/creditoService');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const leiloeiroService = require('../src/services/leiloeiroService');
const licitanteService = require('../src/services/licitanteService');
const creditoService = require('../src/services/creditoService');
const { ErroDeValidacao } = require('../src/utils/erros');

// token de um licitante logado (perfilId 3) no formato "Bearer <token>"
const payloadLicitante = { sub: 30, papel: 'LICITANTE', perfilId: 3 };
const bearer = `Bearer ${jwt.sign(payloadLicitante, 'segredo-qualquer')}`;

beforeEach(() => {
  jest.clearAllMocks();
  // erros 500 escrevem no console; silenciamos para a saida do teste ficar limpa
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('app', () => {
  test('GET /health responde 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('usuarios-service');
  });

  test('rota inexistente responde 404', async () => {
    const res = await request(app).get('/nao-existe');
    expect(res.status).toBe(404);
  });
});

describe('rotas /leiloeiros', () => {
  test('GET /leiloeiros lista', async () => {
    leiloeiroService.listar.mockResolvedValue([{ id: 1 }]);
    const res = await request(app).get('/leiloeiros');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1 }]);
  });

  test('GET /leiloeiros com falha no banco responde 500 (try/catch do listar)', async () => {
    leiloeiroService.listar.mockRejectedValue(new Error('banco fora do ar'));
    const res = await request(app).get('/leiloeiros');
    expect(res.status).toBe(500);
    expect(res.body.erro).toBe('Erro interno no servico de usuarios.');
  });

  test('GET /leiloeiros/:id converte o id em numero', async () => {
    leiloeiroService.buscarPorId.mockResolvedValue({ id: 5 });
    const res = await request(app).get('/leiloeiros/5');
    expect(res.status).toBe(200);
    expect(leiloeiroService.buscarPorId).toHaveBeenCalledWith(5);
  });

  test('GET /leiloeiros/:id inexistente devolve o 404 do service', async () => {
    leiloeiroService.buscarPorId.mockRejectedValue(new ErroDeValidacao('Leiloeiro nao encontrado.', 404));
    const res = await request(app).get('/leiloeiros/999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ erro: 'Leiloeiro nao encontrado.' });
  });

  test('POST /leiloeiros responde 201 e repassa so os campos conhecidos', async () => {
    leiloeiroService.cadastrar.mockResolvedValue({ id: 9 });
    const res = await request(app)
      .post('/leiloeiros')
      .send({ nome: 'Carlos', email: 'c@c.com', registroProfissional: 'JUCESC-000123', campoExtra: 'x' });
    expect(res.status).toBe(201);
    expect(leiloeiroService.cadastrar).toHaveBeenCalledWith({
      usuarioId: undefined,
      nome: 'Carlos',
      email: 'c@c.com',
      registroProfissional: 'JUCESC-000123',
      telefone: undefined,
    });
  });

  test('PUT /leiloeiros/:id repassa o usuario logado ao service', async () => {
    leiloeiroService.atualizar.mockResolvedValue({ id: 7 });
    const res = await request(app).put('/leiloeiros/7').set('Authorization', bearer).send({ telefone: '1' });
    expect(res.status).toBe(200);
    expect(leiloeiroService.atualizar).toHaveBeenCalledWith(
      7,
      { telefone: '1' },
      expect.objectContaining(payloadLicitante)
    );
  });

  test('DELETE /leiloeiros/:id responde 204; 403 do service vira 403', async () => {
    leiloeiroService.remover.mockResolvedValueOnce(true);
    expect((await request(app).delete('/leiloeiros/7').set('Authorization', bearer)).status).toBe(204);

    leiloeiroService.remover.mockRejectedValueOnce(new ErroDeValidacao('Voce so pode alterar o seu proprio cadastro.', 403));
    const res = await request(app).delete('/leiloeiros/8').set('Authorization', bearer);
    expect(res.status).toBe(403);
  });

  test('erro inesperado no PUT vira 500 generico', async () => {
    leiloeiroService.atualizar.mockRejectedValue(new Error('bug'));
    const res = await request(app).put('/leiloeiros/7').send({});
    expect(res.status).toBe(500);
  });
});

describe('rotas /licitantes', () => {
  test('GET /licitantes lista (e 500 quando o banco falha)', async () => {
    licitanteService.listar.mockResolvedValueOnce([{ id: 3 }]);
    expect((await request(app).get('/licitantes')).body).toEqual([{ id: 3 }]);

    licitanteService.listar.mockRejectedValueOnce(new Error('banco fora do ar'));
    expect((await request(app).get('/licitantes')).status).toBe(500);
  });

  test('GET /licitantes/:id', async () => {
    licitanteService.buscarPorId.mockResolvedValue({ id: 3 });
    const res = await request(app).get('/licitantes/3');
    expect(res.status).toBe(200);
    expect(licitanteService.buscarPorId).toHaveBeenCalledWith(3);
  });

  test('POST /licitantes responde 201; dado invalido responde 400', async () => {
    licitanteService.cadastrar.mockResolvedValueOnce({ id: 3 });
    expect((await request(app).post('/licitantes').send({ nome: 'Maria' })).status).toBe(201);

    licitanteService.cadastrar.mockRejectedValueOnce(new ErroDeValidacao('CPF invalido.'));
    const res = await request(app).post('/licitantes').send({ nome: 'Maria' });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('CPF invalido.');
  });

  test('PUT e DELETE /licitantes/:id repassam o usuario logado', async () => {
    licitanteService.atualizar.mockResolvedValue({ id: 3 });
    licitanteService.remover.mockResolvedValue(true);

    expect((await request(app).put('/licitantes/3').set('Authorization', bearer).send({ nome: 'Maria' })).status).toBe(200);
    expect(licitanteService.atualizar).toHaveBeenCalledWith(3, { nome: 'Maria' }, expect.objectContaining({ perfilId: 3 }));

    expect((await request(app).delete('/licitantes/3').set('Authorization', bearer)).status).toBe(204);
    expect(licitanteService.remover).toHaveBeenCalledWith(3, expect.objectContaining({ perfilId: 3 }));
  });

  test('erros de PUT/DELETE/GET por id viram resposta HTTP', async () => {
    licitanteService.atualizar.mockRejectedValue(new ErroDeValidacao('proibido', 403));
    licitanteService.remover.mockRejectedValue(new Error('bug'));
    licitanteService.buscarPorId.mockRejectedValue(new ErroDeValidacao('Licitante nao encontrado.', 404));

    expect((await request(app).put('/licitantes/3').send({})).status).toBe(403);
    expect((await request(app).delete('/licitantes/3')).status).toBe(500);
    expect((await request(app).get('/licitantes/3')).status).toBe(404);
  });
});

describe('rotas de credito (/licitantes/:id/credito e /reservas)', () => {
  test('GET credito e reservas', async () => {
    creditoService.consultarCredito.mockResolvedValue({ disponivel: 100 });
    creditoService.listarReservas.mockResolvedValue([]);

    expect((await request(app).get('/licitantes/3/credito')).body).toEqual({ disponivel: 100 });
    expect((await request(app).get('/licitantes/3/reservas')).status).toBe(200);
    expect(creditoService.consultarCredito).toHaveBeenCalledWith('3');
  });

  test('POST reservas: 201 quando cria, 200 quando a referencia ja existia (idempotencia)', async () => {
    creditoService.reservar.mockResolvedValueOnce({ reserva: { id: 1 }, criada: true });
    creditoService.reservar.mockResolvedValueOnce({ reserva: { id: 1 }, criada: false });

    const primeira = await request(app).post('/licitantes/3/reservas').send({ valor: 100, referencia: 'saga-1' });
    const repetida = await request(app).post('/licitantes/3/reservas').send({ valor: 100, referencia: 'saga-1' });

    expect(primeira.status).toBe(201);
    expect(repetida.status).toBe(200);
    expect(creditoService.reservar).toHaveBeenCalledWith('3', { valor: 100, referencia: 'saga-1' });
  });

  test('POST reservas sem credito responde 409; POST liberar responde 200', async () => {
    creditoService.reservar.mockRejectedValue(new ErroDeValidacao('Credito insuficiente', 409));
    creditoService.liberar.mockResolvedValue({ id: 1, status: 'LIBERADA' });

    expect((await request(app).post('/licitantes/3/reservas').send({ valor: 1e9 })).status).toBe(409);
    const res = await request(app).post('/licitantes/3/reservas/1/liberar');
    expect(res.status).toBe(200);
    expect(creditoService.liberar).toHaveBeenCalledWith('3', '1');
  });

  test('erros inesperados nas rotas de credito viram 500', async () => {
    creditoService.consultarCredito.mockRejectedValue(new Error('bug'));
    creditoService.listarReservas.mockRejectedValue(new Error('bug'));
    creditoService.liberar.mockRejectedValue(new Error('bug'));

    expect((await request(app).get('/licitantes/3/credito')).status).toBe(500);
    expect((await request(app).get('/licitantes/3/reservas')).status).toBe(500);
    expect((await request(app).post('/licitantes/3/reservas/1/liberar')).status).toBe(500);
  });
});

describe('middleware extrairUsuario', () => {
  test('token malformado nao derruba a requisicao (usuario fica vazio)', async () => {
    leiloeiroService.atualizar.mockResolvedValue({ id: 7 });
    const res = await request(app).put('/leiloeiros/7').set('Authorization', 'Bearer nao-e-um-jwt').send({});
    expect(res.status).toBe(200);
    expect(leiloeiroService.atualizar).toHaveBeenCalledWith(7, {}, null);
  });
});
