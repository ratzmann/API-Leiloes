// =============================================================================
// tests/licitanteService.test.js  -  testes das regras do licitante
// -----------------------------------------------------------------------------
// Cobre: CPF valido/invalido, limite de credito negativo, duplicidades (409)
// busca de licitante inexistente (404) e autorizacao (so o proprio cadastro,
// sem alterar o proprio limite de credito) e visibilidade (CPF e dados
// pessoais so para o proprio licitante - LGPD).
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

describe('licitanteService - autorizacao (so o proprio cadastro)', () => {
  // payloads de token: o licitante 3 (dono do cadastro) e outras pessoas
  const licitante3 = { sub: 30, papel: 'LICITANTE', perfilId: 3 };
  const outroLicitante = { sub: 31, papel: 'LICITANTE', perfilId: 4 };
  const leiloeiro3 = { sub: 32, papel: 'LEILOEIRO', perfilId: 3 };

  beforeEach(() => {
    licitanteRepository.buscarPorId.mockResolvedValue({ id: 3, nome: 'Maria Souza' });
  });

  test('o proprio licitante atualiza nome e telefone', async () => {
    licitanteRepository.atualizar.mockResolvedValue({ id: 3, telefone: '47911112222' });

    await licitanteService.atualizar(3, { telefone: '47911112222' }, licitante3);

    expect(licitanteRepository.atualizar).toHaveBeenCalledWith(3, { telefone: '47911112222' });
  });

  test('401 sem usuario logado', async () => {
    await expect(licitanteService.atualizar(3, { telefone: '1' })).rejects.toMatchObject({ codigo: 401 });
  });

  test('403 quando outro licitante tenta alterar o cadastro', async () => {
    await expect(licitanteService.atualizar(3, { nome: 'Invasor' }, outroLicitante)).rejects.toMatchObject({
      codigo: 403,
      message: 'Voce so pode alterar o seu proprio cadastro.',
    });
    expect(licitanteRepository.atualizar).not.toHaveBeenCalled();
  });

  test('403 quando um leiloeiro com o mesmo perfilId tenta alterar (papel diferente)', async () => {
    await expect(licitanteService.remover(3, leiloeiro3)).rejects.toMatchObject({ codigo: 403 });
    expect(licitanteRepository.remover).not.toHaveBeenCalled();
  });

  test('403 quando o proprio licitante tenta aumentar o limite de credito', async () => {
    await expect(licitanteService.atualizar(3, { limiteCredito: 1000000 }, licitante3)).rejects.toMatchObject({
      codigo: 403,
      message: 'O limite de credito nao pode ser alterado pelo proprio licitante.',
    });
    expect(licitanteRepository.atualizar).not.toHaveBeenCalled();
  });

  test('o proprio licitante remove o cadastro', async () => {
    licitanteRepository.remover.mockResolvedValue(true);
    await expect(licitanteService.remover(3, licitante3)).resolves.toBe(true);
  });
});

describe('licitanteService - visibilidade dos dados pessoais (LGPD)', () => {
  const maria = { id: 3, nome: 'Maria Souza', email: 'm@m.com', cpf: '52998224725', telefone: '47999', limite_credito: '5000.00', usuario_id: 30, criado_em: '2026-01-01' };
  const joao = { id: 4, nome: 'Joao Lima', email: 'j@j.com', cpf: '39053344705', telefone: '47888', limite_credito: '3000.00', usuario_id: 40, criado_em: '2026-01-02' };
  const tokenMaria = { sub: 30, papel: 'LICITANTE', perfilId: 3 };

  test('na lista, cada licitante ve os proprios dados e so id/nome dos outros', async () => {
    licitanteRepository.listar.mockResolvedValue([maria, joao]);

    const lista = await licitanteService.listar(tokenMaria);

    expect(lista[0]).toEqual(maria);
    expect(lista[1]).toEqual({ id: 4, nome: 'Joao Lima', criado_em: '2026-01-02' });
    expect(lista[1]).not.toHaveProperty('cpf');
  });

  test('consultar outro licitante (ou sem login) nao mostra CPF, e-mail nem limite', async () => {
    licitanteRepository.buscarPorId.mockResolvedValue(joao);

    for (const usuario of [tokenMaria, undefined, { sub: 9, papel: 'LEILOEIRO', perfilId: 4 }]) {
      const visto = await licitanteService.consultar(4, usuario);
      expect(Object.keys(visto).sort()).toEqual(['criado_em', 'id', 'nome']);
    }
  });

  test('o proprio licitante ve o cadastro completo', async () => {
    licitanteRepository.buscarPorId.mockResolvedValue(maria);
    await expect(licitanteService.consultar(3, tokenMaria)).resolves.toEqual(maria);
  });
});
