// =============================================================================
// tests/rotas.test.js  -  testes da camada HTTP (rotas + controller)
// -----------------------------------------------------------------------------
// authService.test.js testa as REGRAS de registro e login. Este testa o
// caminho HTTP: rota -> controller -> service, com o STATUS certo.
//   - supertest faz requisicoes HTTP de verdade contra o `app` do Express;
//   - o authService e mockado (jest.mock): sem banco e sem usuarios-service.
// =============================================================================

jest.mock('../src/services/authService');

const request = require('supertest');
const app = require('../src/app');
const authService = require('../src/services/authService');
const { ErroDeValidacao } = require('../src/utils/erros');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('auth-service - rotas', () => {
  test('GET /health responde 200 e rota inexistente responde 404', async () => {
    expect((await request(app).get('/health')).body.service).toBe('auth-service');
    expect((await request(app).get('/nao-existe')).status).toBe(404);
  });

  test('POST /registrar responde 201 e repassa os campos do corpo', async () => {
    authService.registrar.mockResolvedValue({ token: 't', usuario: { id: 1 } });
    const corpo = { nome: 'Ana', email: 'a@a.com', senha: '123456', papel: 'LICITANTE', dadosPerfil: { cpf: '1' } };

    const res = await request(app).post('/registrar').send(corpo);

    expect(res.status).toBe(201);
    expect(res.body.token).toBe('t');
    expect(authService.registrar).toHaveBeenCalledWith(corpo);
  });

  test('POST /registrar com e-mail repetido devolve 409', async () => {
    authService.registrar.mockRejectedValue(new ErroDeValidacao('Ja existe um usuario cadastrado com este e-mail.', 409));
    const res = await request(app).post('/registrar').send({});
    expect(res.status).toBe(409);
    expect(res.body.erro).toMatch(/Ja existe/);
  });

  test('POST /login responde 200; credencial errada responde 401', async () => {
    authService.login.mockResolvedValueOnce({ token: 't' });
    const ok = await request(app).post('/login').send({ email: 'a@a.com', senha: '123456' });
    expect(ok.status).toBe(200);
    expect(authService.login).toHaveBeenCalledWith({ email: 'a@a.com', senha: '123456' });

    authService.login.mockRejectedValueOnce(new ErroDeValidacao('Credenciais invalidas.', 401));
    expect((await request(app).post('/login').send({})).status).toBe(401);
  });

  test('erro inesperado vira 500 com mensagem generica', async () => {
    authService.login.mockRejectedValue(new Error('banco fora do ar'));
    const res = await request(app).post('/login').send({});
    expect(res.status).toBe(500);
    expect(res.body.erro).toBe('Erro interno no servico de autenticacao.');
  });
});
