jest.mock('../src/repositories/lanceRepository');
const lanceRepository = require('../src/repositories/lanceRepository');
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
  test('registra com sucesso quando for o primeiro lance do leilao', async () => {
    lanceRepository.buscarMaiorPorLeilao.mockResolvedValue(null);
    lanceRepository.criar.mockResolvedValue({
      id: 1,
      leilao_id: 1,
      licitante_id: 2,
      valor: 1000,
    });

    const resultado = await lanceService.registrarLance({
      leilaoId: 1,
      licitanteId: 2,
      valor: 1000,
    });

    expect(resultado.id).toBe(1);
    expect(lanceRepository.criar).toHaveBeenCalledWith({
      leilaoId: 1,
      licitanteId: 2,
      valor: 1000,
    });
  });

  test('rejeita lance quando licitante ja detem o maior lance atual', async () => {
    lanceRepository.buscarMaiorPorLeilao.mockResolvedValue({
      id: 1,
      leilao_id: 1,
      licitante_id: 2,
      valor: '1000.00',
    });

    await expect(
      lanceService.registrarLance({
        leilaoId: 1,
        licitanteId: 2,
        valor: 1200,
      })
    ).rejects.toThrow('Voce ja detem o maior lance atual para este leilao.');
  });

  test('rejeita lance com valor menor ou igual ao lance atual', async () => {
    lanceRepository.buscarMaiorPorLeilao.mockResolvedValue({
      id: 1,
      leilao_id: 1,
      licitante_id: 2,
      valor: '1500.00',
    });

    await expect(
      lanceService.registrarLance({
        leilaoId: 1,
        licitanteId: 3,
        valor: 1500,
      })
    ).rejects.toThrow('O lance deve ser estritamente maior que o lance atual de R$ 1500.00.');

    await expect(
      lanceService.registrarLance({
        leilaoId: 1,
        licitanteId: 3,
        valor: 1400,
      })
    ).rejects.toThrow('O lance deve ser estritamente maior que o lance atual de R$ 1500.00.');
  });

  test('aceita lance maior que o anterior de outro licitante', async () => {
    lanceRepository.buscarMaiorPorLeilao.mockResolvedValue({
      id: 1,
      leilao_id: 1,
      licitante_id: 2,
      valor: '1500.00',
    });
    lanceRepository.criar.mockResolvedValue({
      id: 2,
      leilao_id: 1,
      licitante_id: 3,
      valor: 1600,
    });

    const resultado = await lanceService.registrarLance({
      leilaoId: 1,
      licitanteId: 3,
      valor: 1600,
    });

    expect(resultado.id).toBe(2);
    expect(lanceRepository.criar).toHaveBeenCalledTimes(1);
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
