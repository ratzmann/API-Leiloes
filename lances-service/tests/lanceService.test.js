// =============================================================================
// tests/lanceService.test.js  -  testes do service de lances
// -----------------------------------------------------------------------------
// Cobre as validacoes locais (ids e valor) e confere que o registro de lance
// e entregue a Saga (a propria Saga e mockada aqui).
// COMO LER UM TESTE (Jest):
//   describe('grupo', () => { ... })   agrupa testes de uma mesma funcao;
//   test('descricao', () => { ... })    um cenario (chamado tambem de it);
//   expect(valor).toBe(esperado)        a VERIFICACAO: se nao bater, o teste falha;
//   expect(() => f()).toThrow('msg')    confere que a funcao LANCA aquele erro;
//   await expect(promessa).rejects...   o mesmo, para funcoes async.
// jest.mock('caminho') troca o modulo real pelo MOCK (pasta __mocks__), entao
// os testes rodam sem banco e sem rede. Rodar:  npm test  (dentro do servico).
// =============================================================================

jest.mock('../src/repositories/lanceRepository');
jest.mock('../src/repositories/sagaRepository');
jest.mock('../src/sagas/registrarLanceSaga');
const lanceRepository = require('../src/repositories/lanceRepository');
const sagaRepository = require('../src/repositories/sagaRepository');
const registrarLanceSaga = require('../src/sagas/registrarLanceSaga');
const lanceService = require('../src/services/lanceService');

beforeEach(() => jest.clearAllMocks());

describe('lanceService.validarDados', () => {
  test('rejeita leilaoId invalido', () => {
    expect(() =>
      lanceService.validarDados({ leilaoId: -1, licitanteId: 1, valor: 100 })
    ).toThrow('leilaoId deve ser um numero inteiro positivo.');

    expect(() =>
      lanceService.validarDados({ leilaoId: 'abc', licitanteId: 1, valor: 100 })
    ).toThrow('leilaoId deve ser um numero inteiro positivo.');
  });

  test('rejeita licitanteId invalido', () => {
    expect(() =>
      lanceService.validarDados({ leilaoId: 1, licitanteId: 0, valor: 100 })
    ).toThrow('licitanteId deve ser um numero inteiro positivo.');
  });

  test('rejeita valor zero ou negativo ou invalido', () => {
    expect(() =>
      lanceService.validarDados({ leilaoId: 1, licitanteId: 1, valor: 0 })
    ).toThrow('Valor do lance deve ser um numero maior que zero.');

    expect(() =>
      lanceService.validarDados({ leilaoId: 1, licitanteId: 1, valor: -50 })
    ).toThrow('Valor do lance deve ser um numero maior que zero.');

    expect(() =>
      lanceService.validarDados({ leilaoId: 1, licitanteId: 1, valor: 'invalido' })
    ).toThrow('Valor do lance deve ser um numero maior que zero.');
  });

  test('aceita dados validos', () => {
    expect(() =>
      lanceService.validarDados({ leilaoId: 10, licitanteId: 5, valor: 2500.5 })
    ).not.toThrow();
  });
});

describe('lanceService.buscarPorId', () => {
  test('rejeita id invalido', async () => {
    await expect(lanceService.buscarPorId('abc')).rejects.toThrow('ID invalido.');
  });

  test('lanca 404 quando lance nao encontrado', async () => {
    lanceRepository.buscarPorId.mockResolvedValue(null);
    await expect(lanceService.buscarPorId(999)).rejects.toThrow('Lance nao encontrado.');
  });

  test('retorna lance quando encontrado', async () => {
    const lanceMock = { id: 1, leilao_id: 2, licitante_id: 3, valor: '1500.00' };
    lanceRepository.buscarPorId.mockResolvedValue(lanceMock);

    const resultado = await lanceService.buscarPorId(1);
    expect(resultado).toEqual(lanceMock);
    expect(lanceRepository.buscarPorId).toHaveBeenCalledWith(1);
  });
});

describe('lanceService.buscarPorLeilao', () => {
  test('rejeita leilaoId invalido', async () => {
    await expect(lanceService.buscarPorLeilao(0)).rejects.toThrow('leilaoId invalido.');
  });

  test('retorna lances do leilao', async () => {
    const lancesMock = [
      { id: 2, leilao_id: 1, licitante_id: 2, valor: '2000.00' },
      { id: 1, leilao_id: 1, licitante_id: 1, valor: '1500.00' },
    ];
    lanceRepository.buscarPorLeilao.mockResolvedValue(lancesMock);

    const resultado = await lanceService.buscarPorLeilao(1);
    expect(resultado).toEqual(lancesMock);
    expect(lanceRepository.buscarPorLeilao).toHaveBeenCalledWith(1);
  });
});

describe('lanceService.buscarMaiorPorLeilao', () => {
  test('rejeita leilaoId invalido', async () => {
    await expect(lanceService.buscarMaiorPorLeilao(-2)).rejects.toThrow('leilaoId invalido.');
  });

  test('lanca 404 se nao houver nenhum lance no leilao', async () => {
    lanceRepository.buscarMaiorPorLeilao.mockResolvedValue(null);
    await expect(lanceService.buscarMaiorPorLeilao(1)).rejects.toThrow(
      'Nenhum lance encontrado para este leilao.'
    );
  });

  test('retorna maior lance quando existir', async () => {
    const maiorMock = { id: 5, leilao_id: 1, licitante_id: 3, valor: '3200.00' };
    lanceRepository.buscarMaiorPorLeilao.mockResolvedValue(maiorMock);

    const resultado = await lanceService.buscarMaiorPorLeilao(1);
    expect(resultado).toEqual(maiorMock);
  });
});

describe('lanceService.registrarLance', () => {
  test('valida os dados antes de iniciar a saga', async () => {
    await expect(
      lanceService.registrarLance({ leilaoId: 1, licitanteId: 2, valor: -10 })
    ).rejects.toThrow('Valor do lance deve ser um numero maior que zero.');
    expect(registrarLanceSaga.executar).not.toHaveBeenCalled();
  });

  test('delega o registro para a saga, repassando a falha simulada', async () => {
    registrarLanceSaga.executar.mockResolvedValue({ id: 5, sagaId: 9, sagaStatus: 'CONCLUIDA' });

    const resultado = await lanceService.registrarLance({
      leilaoId: '1',
      licitanteId: '2',
      valor: '1000',
      simularFalha: 'gravar-lance',
    });

    expect(resultado.sagaId).toBe(9);
    expect(registrarLanceSaga.executar).toHaveBeenCalledWith({
      leilaoId: 1,
      licitanteId: 2,
      valor: 1000,
      simularFalha: 'gravar-lance',
    });
  });
});

describe('lanceService sagas', () => {
  test('busca saga existente', async () => {
    sagaRepository.buscarPorId.mockResolvedValue({ id: 3, status: 'CONCLUIDA' });
    await expect(lanceService.buscarSaga('3')).resolves.toEqual({ id: 3, status: 'CONCLUIDA' });
  });

  test('lanca 404 para saga inexistente e 400 para id invalido', async () => {
    sagaRepository.buscarPorId.mockResolvedValue(null);
    await expect(lanceService.buscarSaga(99)).rejects.toMatchObject({ codigo: 404 });
    await expect(lanceService.buscarSaga('x')).rejects.toMatchObject({ codigo: 400 });
  });

  test('lista sagas e reprocessa pela saga', async () => {
    sagaRepository.listar.mockResolvedValue([{ id: 1 }]);
    registrarLanceSaga.reprocessar.mockResolvedValue({ id: 1, status: 'CONCLUIDA' });

    await expect(lanceService.listarSagas()).resolves.toEqual([{ id: 1 }]);
    await expect(lanceService.reprocessarSaga('1')).resolves.toMatchObject({ status: 'CONCLUIDA' });
    await expect(lanceService.reprocessarSaga(0)).rejects.toMatchObject({ codigo: 400 });
  });
});

describe('lanceService.listar', () => {
  test('retorna todos os lances', async () => {
    const lancesMock = [{ id: 1 }, { id: 2 }];
    lanceRepository.listar.mockResolvedValue(lancesMock);

    const resultado = await lanceService.listar();
    expect(resultado).toEqual(lancesMock);
    expect(lanceRepository.listar).toHaveBeenCalledTimes(1);
  });
});
