jest.mock('../src/repositories/usuarioRepository');
jest.mock('../src/utils/jwt', () => ({
  gerarToken: jest.fn(() => 'token-fake'),
}));

const usuarioRepository = require('../src/repositories/usuarioRepository');
const authService = require('../src/services/authService');
const { hashSenha } = require('../src/utils/password');

describe('authService.validarRegistro', () => {
  test('rejeita nome muito curto', () => {
    expect(() =>
      authService.validarRegistro({ nome: 'Ab', email: 'a@a.com', senha: '123456', papel: 'LEILOEIRO' })
    ).toThrow('Nome deve ter ao menos 3 caracteres.');
  });

  test('rejeita e-mail invalido', () => {
    expect(() =>
      authService.validarRegistro({ nome: 'Ana Souza', email: 'invalido', senha: '123456', papel: 'LEILOEIRO' })
    ).toThrow('E-mail invalido.');
  });

  test('rejeita senha curta', () => {
    expect(() =>
      authService.validarRegistro({ nome: 'Ana Souza', email: 'a@a.com', senha: '123', papel: 'LEILOEIRO' })
    ).toThrow('Senha deve ter ao menos 6 caracteres.');
  });

  test('rejeita papel invalido', () => {
    expect(() =>
      authService.validarRegistro({ nome: 'Ana Souza', email: 'a@a.com', senha: '123456', papel: 'ADMIN' })
    ).toThrow(/Papel invalido/);
  });

  test('aceita dados validos', () => {
    expect(() =>
      authService.validarRegistro({ nome: 'Ana Souza', email: 'a@a.com', senha: '123456', papel: 'LICITANTE' })
    ).not.toThrow();
  });
});

describe('authService.registrar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USUARIOS_SERVICE_URL = 'http://usuarios-service:3002';
    global.fetch = jest.fn();
  });

  test('lanca erro de conflito quando e-mail ja existe', async () => {
    usuarioRepository.buscarPorEmail.mockResolvedValue({ id: 1, email: 'a@a.com' });

    await expect(
      authService.registrar({ nome: 'Ana Souza', email: 'a@a.com', senha: '123456', papel: 'LICITANTE' })
    ).rejects.toThrow('Ja existe um usuario cadastrado com este e-mail.');
  });

  test('cria usuario e retorna token quando dados sao validos', async () => {
    usuarioRepository.buscarPorEmail.mockResolvedValue(null);
    usuarioRepository.criar.mockResolvedValue({
      id: 10,
      nome: 'Ana Souza',
      email: 'a@a.com',
      papel: 'LICITANTE',
      senha_hash: 'hash',
    });
    usuarioRepository.atualizarPerfilId.mockResolvedValue();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 99 }),
    });

    const resultado = await authService.registrar({
      nome: 'Ana Souza',
      email: 'a@a.com',
      senha: '123456',
      papel: 'LICITANTE',
      dadosPerfil: { cpf: '12345678900' },
    });

    expect(resultado.token).toBe('token-fake');
    expect(resultado.usuario.senha_hash).toBeUndefined();
    expect(usuarioRepository.atualizarPerfilId).toHaveBeenCalledWith(10, 99);
  });
});

describe('authService.login', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejeita quando usuario nao existe', async () => {
    usuarioRepository.buscarPorEmail.mockResolvedValue(null);
    await expect(authService.login({ email: 'x@x.com', senha: '123456' })).rejects.toThrow(
      'Credenciais invalidas.'
    );
  });

  test('rejeita quando senha nao confere', async () => {
    const senhaHash = await hashSenha('senhaCerta');
    usuarioRepository.buscarPorEmail.mockResolvedValue({ id: 1, email: 'x@x.com', senha_hash: senhaHash });

    await expect(authService.login({ email: 'x@x.com', senha: 'senhaErrada' })).rejects.toThrow(
      'Credenciais invalidas.'
    );
  });

  test('retorna token quando credenciais sao corretas', async () => {
    const senhaHash = await hashSenha('senhaCerta');
    usuarioRepository.buscarPorEmail.mockResolvedValue({
      id: 1,
      email: 'x@x.com',
      senha_hash: senhaHash,
      papel: 'LEILOEIRO',
    });

    const resultado = await authService.login({ email: 'x@x.com', senha: 'senhaCerta' });
    expect(resultado.token).toBe('token-fake');
  });
});
