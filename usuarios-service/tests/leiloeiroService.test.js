// =============================================================================
// tests/leiloeiroService.test.js  -  testes das regras do leiloeiro
// -----------------------------------------------------------------------------
// Cobre: validacao de nome/e-mail/registro profissional, duplicidades (409)
// e busca de leiloeiro inexistente (404).
// COMO LER UM TESTE (Jest):
//   describe('grupo', () => { ... })   agrupa testes de uma mesma funcao;
//   test('descricao', () => { ... })    um cenario (chamado tambem de it);
//   expect(valor).toBe(esperado)        a VERIFICACAO: se nao bater, o teste falha;
//   expect(() => f()).toThrow('msg')    confere que a funcao LANCA aquele erro;
//   await expect(promessa).rejects...   o mesmo, para funcoes async.
// jest.mock('caminho') troca o modulo real pelo MOCK (pasta __mocks__), entao
// os testes rodam sem banco e sem rede. Rodar:  npm test  (dentro do servico).
// =============================================================================

jest.mock('../src/repositories/leiloeiroRepository');
const leiloeiroRepository = require('../src/repositories/leiloeiroRepository');
const leiloeiroService = require('../src/services/leiloeiroService');

beforeEach(() => jest.clearAllMocks());

describe('leiloeiroService.validarDados', () => {
  test('rejeita nome curto', () => {
    expect(() =>
      leiloeiroService.validarDados({ nome: 'Jo', email: 'a@a.com', registroProfissional: 'JUCESC-0001' })
    ).toThrow('Nome deve ter ao menos 3 caracteres.');
  });

  test('rejeita e-mail invalido', () => {
    expect(() =>
      leiloeiroService.validarDados({ nome: 'Joao Silva', email: 'invalido', registroProfissional: 'JUCESC-0001' })
    ).toThrow('E-mail invalido.');
  });

  test('rejeita registro profissional fora do formato', () => {
    expect(() =>
      leiloeiroService.validarDados({ nome: 'Joao Silva', email: 'a@a.com', registroProfissional: '12345' })
    ).toThrow(/Registro profissional invalido/);
  });

  test('aceita dados validos', () => {
    expect(() =>
      leiloeiroService.validarDados({ nome: 'Joao Silva', email: 'a@a.com', registroProfissional: 'JUCESC-000123' })
    ).not.toThrow();
  });
});

describe('leiloeiroService.cadastrar', () => {
  test('rejeita quando e-mail ja cadastrado', async () => {
    leiloeiroRepository.buscarPorEmail.mockResolvedValue({ id: 1 });

    await expect(
      leiloeiroService.cadastrar({
        nome: 'Joao Silva',
        email: 'a@a.com',
        registroProfissional: 'JUCESC-000123',
      })
    ).rejects.toThrow('Ja existe um leiloeiro cadastrado com este e-mail.');
  });

  test('rejeita quando registro profissional ja cadastrado', async () => {
    leiloeiroRepository.buscarPorEmail.mockResolvedValue(null);
    leiloeiroRepository.buscarPorRegistroProfissional.mockResolvedValue({ id: 2 });

    await expect(
      leiloeiroService.cadastrar({
        nome: 'Joao Silva',
        email: 'a@a.com',
        registroProfissional: 'JUCESC-000123',
      })
    ).rejects.toThrow('Ja existe um leiloeiro cadastrado com este registro profissional.');
  });

  test('cadastra quando dados sao validos e unicos', async () => {
    leiloeiroRepository.buscarPorEmail.mockResolvedValue(null);
    leiloeiroRepository.buscarPorRegistroProfissional.mockResolvedValue(null);
    leiloeiroRepository.criar.mockResolvedValue({ id: 1, nome: 'Joao Silva' });

    const resultado = await leiloeiroService.cadastrar({
      nome: 'Joao Silva',
      email: 'a@a.com',
      registroProfissional: 'JUCESC-000123',
    });

    expect(resultado.id).toBe(1);
    expect(leiloeiroRepository.criar).toHaveBeenCalledTimes(1);
  });
});

describe('leiloeiroService.buscarPorId', () => {
  test('lanca 404 quando nao encontrado', async () => {
    leiloeiroRepository.buscarPorId.mockResolvedValue(null);
    await expect(leiloeiroService.buscarPorId(999)).rejects.toThrow('Leiloeiro nao encontrado.');
  });
});
