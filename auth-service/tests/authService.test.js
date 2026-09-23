// =============================================================================
// tests/authService.test.js  -  testes das regras de cadastro e login
// -----------------------------------------------------------------------------
// Cobre: validacao do registro, e-mail duplicado (409), login com senha errada
// (401), login correto e a COMPENSACAO do registro (se o perfil nao puder ser
// criado, o usuario e apagado). O repository e o gerador de token sao mockados.
// COMO LER UM TESTE (Jest):
//   describe('grupo', () => { ... })   agrupa testes de uma mesma funcao;
//   test('descricao', () => { ... })    um cenario (chamado tambem de it);
//   expect(valor).toBe(esperado)        a VERIFICACAO: se nao bater, o teste falha;
//   expect(() => f()).toThrow('msg')    confere que a funcao LANCA aquele erro;
//   await expect(promessa).rejects...   o mesmo, para funcoes async.
// jest.mock('caminho') troca o modulo real pelo MOCK (pasta __mocks__), entao
// os testes rodam sem banco e sem rede. Rodar:  npm test  (dentro do servico).
// =============================================================================

jest.mock('../src/repositories/usuarioRepository');
jest.mock('../src/clients/usuariosClient');
jest.mock('../src/utils/jwt', () => ({
  gerarToken: jest.fn(() => 'token-fake'),
}));

const usuarioRepository = require('../src/repositories/usuarioRepository');
const authService = require('../src/services/authService');
const { hashSenha } = require('../src/utils/password');
const { gerarToken } = require('../src/utils/jwt');
const usuariosClient = require('../src/clients/usuariosClient');
const { ErroDeValidacao } = require('../src/utils/erros');

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
  beforeEach(() => jest.clearAllMocks());

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
    usuariosClient.criarPerfil.mockResolvedValue({ id: 99 });

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

  test('gera o token ja com o perfil criado no usuarios-service', async () => {
    usuarioRepository.buscarPorEmail.mockResolvedValue(null);
    usuarioRepository.criar.mockResolvedValue({ id: 10, nome: 'Ana Souza', email: 'a@a.com', papel: 'LICITANTE' });
    usuarioRepository.atualizarPerfilId.mockResolvedValue();
    usuariosClient.criarPerfil.mockResolvedValue({ id: 99 });

    await authService.registrar({ nome: 'Ana Souza', email: 'a@a.com', senha: '123456', papel: 'LICITANTE' });

    // o token precisa ser gerado DEPOIS de o perfil existir, para levar o perfilId
    expect(gerarToken).toHaveBeenCalledWith(expect.objectContaining({ id: 10, perfil_id: 99 }));
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

describe('authService.registrar - compensacao quando o perfil falha', () => {
  // cenario comum: e-mail livre e usuario criado no auth-db com id 10
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    usuarioRepository.buscarPorEmail.mockResolvedValue(null);
    usuarioRepository.criar.mockResolvedValue({ id: 10, nome: 'Ana Souza', email: 'a@a.com', papel: 'LICITANTE' });
    usuarioRepository.remover.mockResolvedValue(true);
  });

  const dados = { nome: 'Ana Souza', email: 'a@a.com', senha: '123456', papel: 'LICITANTE', dadosPerfil: { cpf: '11111111111' } };

  test('CPF recusado (400): apaga o usuario criado e devolve o mesmo 400', async () => {
    usuariosClient.criarPerfil.mockRejectedValue(new ErroDeValidacao('CPF invalido.', 400));

    await expect(authService.registrar(dados)).rejects.toMatchObject({ codigo: 400, message: 'CPF invalido.' });
    expect(usuarioRepository.remover).toHaveBeenCalledWith(10);
    expect(usuarioRepository.atualizarPerfilId).not.toHaveBeenCalled();
  });

  test('CPF ja cadastrado (409): apaga o usuario e devolve 409', async () => {
    usuariosClient.criarPerfil.mockRejectedValue(new ErroDeValidacao('Ja existe um licitante cadastrado com este CPF.', 409));

    await expect(authService.registrar(dados)).rejects.toMatchObject({ codigo: 409 });
    expect(usuarioRepository.remover).toHaveBeenCalledWith(10);
  });

  test('usuarios-service fora do ar (rede, timeout ou 5xx): apaga o usuario e devolve 503', async () => {
    usuariosClient.criarPerfil.mockRejectedValue(new usuariosClient.ServicoIndisponivel('nao respondeu'));

    await expect(authService.registrar(dados)).rejects.toMatchObject({ codigo: 503 });
    expect(usuarioRepository.remover).toHaveBeenCalledWith(10);
  });

  test('se ate a remocao falhar, o erro original continua sendo devolvido', async () => {
    usuariosClient.criarPerfil.mockRejectedValue(new ErroDeValidacao('CPF invalido.', 400));
    usuarioRepository.remover.mockRejectedValue(new Error('banco fora do ar'));

    await expect(authService.registrar(dados)).rejects.toMatchObject({ codigo: 400 });
  });

  test('sem falha, nada e apagado', async () => {
    usuariosClient.criarPerfil.mockResolvedValue({ id: 99 });
    await authService.registrar(dados);
    expect(usuarioRepository.remover).not.toHaveBeenCalled();
  });
});
