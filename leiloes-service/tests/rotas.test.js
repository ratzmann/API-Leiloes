// =============================================================================
// tests/rotas.test.js  -  testes da camada HTTP (rotas + controllers + middleware)
// -----------------------------------------------------------------------------
// Os outros arquivos testam as REGRAS (leilaoService, validadores). Este testa
// o caminho HTTP: rota -> controller -> service, com o STATUS certo.
//   - supertest faz requisicoes HTTP de verdade contra o `app` do Express;
//   - o leilaoService e mockado (jest.mock): sem banco e sem outros servicos;
//   - o token e gerado com jwt.sign so para o middleware ter o que decodificar.
// =============================================================================

jest.mock('../src/services/leilaoService');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const leilaoService = require('../src/services/leilaoService');
const { ErroDeValidacao } = require('../src/utils/erros');

// token de um leiloeiro logado (perfilId 1)
const payloadLeiloeiro = { sub: 10, papel: 'LEILOEIRO', perfilId: 1 };
const bearer = `Bearer ${jwt.sign(payloadLeiloeiro, 'segredo-qualquer')}`;
const comUsuario = expect.objectContaining(payloadLeiloeiro);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('app', () => {
  test('GET /health responde 200 e rota inexistente responde 404', async () => {
    expect((await request(app).get('/health')).body.service).toBe('leiloes-service');
    expect((await request(app).get('/nao-existe')).status).toBe(404);
  });
});

describe('rotas de leitura (GET)', () => {
  test('GET /leiloes repassa os filtros da query string', async () => {
    leilaoService.listar.mockResolvedValue([]);
    const res = await request(app).get('/leiloes?status=ABERTO&leiloeiroId=1');
    expect(res.status).toBe(200);
    expect(leilaoService.listar).toHaveBeenCalledWith({ status: 'ABERTO', leiloeiroId: '1' });
  });

  test('GET /leiloes/:id e /disponibilidade convertem o id em numero', async () => {
    leilaoService.buscarPorId.mockResolvedValue({ id: 4 });
    leilaoService.consultarDisponibilidade.mockResolvedValue({ aceitandoLances: true });

    expect((await request(app).get('/leiloes/4')).status).toBe(200);
    const res = await request(app).get('/leiloes/4/disponibilidade');
    expect(res.body.aceitandoLances).toBe(true);
    expect(leilaoService.buscarPorId).toHaveBeenCalledWith(4);
    expect(leilaoService.consultarDisponibilidade).toHaveBeenCalledWith(4);
  });

  test('leilao inexistente devolve 404; erro inesperado devolve 500', async () => {
    leilaoService.buscarPorId.mockRejectedValue(new ErroDeValidacao('Leilao nao encontrado.', 404));
    leilaoService.listar.mockRejectedValue(new Error('banco fora do ar'));
    leilaoService.consultarDisponibilidade.mockRejectedValue(new Error('bug'));

    const naoEncontrado = await request(app).get('/leiloes/999');
    expect(naoEncontrado.status).toBe(404);
    expect(naoEncontrado.body).toEqual({ erro: 'Leilao nao encontrado.' });
    expect((await request(app).get('/leiloes')).status).toBe(500);
    expect((await request(app).get('/leiloes/1/disponibilidade')).status).toBe(500);
  });
});

describe('rotas de escrita repassam o usuario logado (Regra 7)', () => {
  test('POST /leiloes responde 201 e envia os campos conhecidos + usuario', async () => {
    leilaoService.cadastrar.mockResolvedValue({ id: 1, status: 'AGENDADO' });
    const res = await request(app)
      .post('/leiloes')
      .set('Authorization', bearer)
      .send({ titulo: 'Leilao', quantidadeBois: 10, campoExtra: 'ignorado' });

    expect(res.status).toBe(201);
    const [dados, usuario] = leilaoService.cadastrar.mock.calls[0];
    expect(dados.titulo).toBe('Leilao');
    expect(dados).not.toHaveProperty('campoExtra');
    expect(usuario).toEqual(comUsuario);
  });

  test('POST /leiloes por quem nao e leiloeiro devolve o 403 do service', async () => {
    leilaoService.cadastrar.mockRejectedValue(new ErroDeValidacao('Apenas leiloeiros podem cadastrar leiloes.', 403));
    const res = await request(app).post('/leiloes').set('Authorization', bearer).send({});
    expect(res.status).toBe(403);
  });

  test('PUT /leiloes/:id', async () => {
    leilaoService.atualizar.mockResolvedValue({ id: 1 });
    const res = await request(app).put('/leiloes/1').set('Authorization', bearer).send({ titulo: 'Novo' });
    expect(res.status).toBe(200);
    expect(leilaoService.atualizar).toHaveBeenCalledWith(1, { titulo: 'Novo' }, comUsuario);
  });

  test('PATCH /status, /abrir, /encerrar e /cancelar', async () => {
    leilaoService.alterarStatus.mockResolvedValue({ status: 'ABERTO' });
    leilaoService.abrir.mockResolvedValue({ status: 'ABERTO' });
    leilaoService.encerrar.mockResolvedValue({ status: 'ENCERRADO' });
    leilaoService.cancelar.mockResolvedValue({ status: 'CANCELADO' });

    await request(app).patch('/leiloes/1/status').set('Authorization', bearer).send({ status: 'ABERTO' });
    await request(app).patch('/leiloes/1/abrir').set('Authorization', bearer);
    await request(app).patch('/leiloes/1/encerrar').set('Authorization', bearer);
    const res = await request(app).patch('/leiloes/1/cancelar').set('Authorization', bearer);

    expect(res.body.status).toBe('CANCELADO');
    expect(leilaoService.alterarStatus).toHaveBeenCalledWith(1, 'ABERTO', comUsuario);
    expect(leilaoService.abrir).toHaveBeenCalledWith(1, comUsuario);
    expect(leilaoService.encerrar).toHaveBeenCalledWith(1, comUsuario);
    expect(leilaoService.cancelar).toHaveBeenCalledWith(1, comUsuario);
  });

  test('DELETE /leiloes/:id responde 204', async () => {
    leilaoService.remover.mockResolvedValue(true);
    const res = await request(app).delete('/leiloes/1').set('Authorization', bearer);
    expect(res.status).toBe(204);
    expect(leilaoService.remover).toHaveBeenCalledWith(1, comUsuario);
  });

  test('transicao invalida (409) e erros inesperados (500) nas rotas de escrita', async () => {
    leilaoService.encerrar.mockRejectedValue(new ErroDeValidacao('Transicao de status invalida', 409));
    leilaoService.atualizar.mockRejectedValue(new Error('bug'));
    leilaoService.alterarStatus.mockRejectedValue(new Error('bug'));
    leilaoService.abrir.mockRejectedValue(new Error('bug'));
    leilaoService.cancelar.mockRejectedValue(new Error('bug'));
    leilaoService.remover.mockRejectedValue(new Error('bug'));
    leilaoService.cadastrar.mockRejectedValue(new Error('bug'));

    expect((await request(app).patch('/leiloes/1/encerrar')).status).toBe(409);
    expect((await request(app).put('/leiloes/1').send({})).status).toBe(500);
    expect((await request(app).patch('/leiloes/1/status').send({})).status).toBe(500);
    expect((await request(app).patch('/leiloes/1/abrir')).status).toBe(500);
    expect((await request(app).patch('/leiloes/1/cancelar')).status).toBe(500);
    expect((await request(app).delete('/leiloes/1')).status).toBe(500);
    expect((await request(app).post('/leiloes').send({})).status).toBe(500);
  });

  test('sem token, o usuario chega vazio ao service (quem decide e a regra)', async () => {
    leilaoService.remover.mockResolvedValue(true);
    await request(app).delete('/leiloes/1');
    expect(leilaoService.remover).toHaveBeenCalledWith(1, undefined);
  });
});
