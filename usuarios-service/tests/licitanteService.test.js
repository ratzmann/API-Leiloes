// =============================================================================
// tests/licitanteService.test.js  -  testes das regras do licitante
// -----------------------------------------------------------------------------
// Cobre: CPF valido/invalido, limite de credito negativo, duplicidades (409)
// e busca de licitante inexistente (404).
// COMO LER UM TESTE (Jest):
//   describe('grupo', () => { ... })   agrupa testes de uma mesma funcao;
//   test('descricao', () => { ... })    um cenario (chamado tambem de it);
//   expect(valor).toBe(esperado)        a VERIFICACAO: se nao bater, o teste falha;
//   expect(() => f()).toThrow('msg')    confere que a funcao LANCA aquele erro;
//   await expect(promessa).rejects...   o mesmo, para funcoes async.
// jest.mock('caminho') troca o modulo real pelo MOCK (pasta __mocks__), entao
// os testes rodam sem banco e sem rede. Rodar:  npm test  (dentro do servico).
// =============================================================================

jest.mock('../src/repositories/licitanteRepository');
const licitanteRepository = require('../src/repositories/licitanteRepository');
const licitanteService = require('../src/services/licitanteService');

beforeEach(() => jest.clearAllMocks());

// CPF valido gerado apenas para fins de teste (passa no calculo dos digitos verificadores)
const CPF_VALIDO = '52998224725';

describe('licitanteService.validarDados', () => {
  test('rejeita nome curto', () => {
    expect(() =>
      licitanteService.validarDados({ nome: 'Jo', email: 'a@a.com', cpf: CPF_VALIDO })
    ).toThrow('Nome deve ter ao menos 3 caracteres.');
  });

  test('rejeita cpf invalido', () => {
    expect(() =>
      licitanteService.validarDados({ nome: 'Maria Souza', email: 'a@a.com', cpf: '11111111111' })
    ).toThrow('CPF invalido.');
  });

  test('rejeita limite de credito negativo', () => {
    expect(() =>
      licitanteService.validarDados({
        nome: 'Maria Souza',
        email: 'a@a.com',
        cpf: CPF_VALIDO,
        limiteCredito: -10,
      })
    ).toThrow('Limite de credito nao pode ser negativo.');
  });

  test('aceita dados validos', () => {
    expect(() =>
      licitanteService.validarDados({
        nome: 'Maria Souza',
        email: 'a@a.com',
        cpf: CPF_VALIDO,
        limiteCredito: 1000,
      })
    ).not.toThrow();
  });
});

describe('licitanteService.cadastrar', () => {
  test('rejeita quando e-mail ja cadastrado', async () => {
    licitanteRepository.buscarPorEmail.mockResolvedValue({ id: 1 });

    await expect(
      licitanteService.cadastrar({ nome: 'Maria Souza', email: 'a@a.com', cpf: CPF_VALIDO })
    ).rejects.toThrow('Ja existe um licitante cadastrado com este e-mail.');
  });

  test('rejeita quando cpf ja cadastrado', async () => {
    licitanteRepository.buscarPorEmail.mockResolvedValue(null);
    licitanteRepository.buscarPorCpf.mockResolvedValue({ id: 2 });

    await expect(
      licitanteService.cadastrar({ nome: 'Maria Souza', email: 'a@a.com', cpf: CPF_VALIDO })
    ).rejects.toThrow('Ja existe um licitante cadastrado com este CPF.');
  });

  test('cadastra quando dados sao validos e unicos', async () => {
    licitanteRepository.buscarPorEmail.mockResolvedValue(null);
    licitanteRepository.buscarPorCpf.mockResolvedValue(null);
    licitanteRepository.criar.mockResolvedValue({ id: 1, nome: 'Maria Souza' });

    const resultado = await licitanteService.cadastrar({
      nome: 'Maria Souza',
      email: 'a@a.com',
      cpf: CPF_VALIDO,
      limiteCredito: 500,
    });

    expect(resultado.id).toBe(1);
    expect(licitanteRepository.criar).toHaveBeenCalledTimes(1);
  });
});

describe('licitanteService.buscarPorId', () => {
  test('lanca 404 quando nao encontrado', async () => {
    licitanteRepository.buscarPorId.mockResolvedValue(null);
    await expect(licitanteService.buscarPorId(999)).rejects.toThrow('Licitante nao encontrado.');
  });
});
