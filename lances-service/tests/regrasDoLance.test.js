const { validarValorDoLance } = require('../src/services/regrasDoLance');

const leilao = { lanceInicial: 1000, incrementoMinimo: 100 };

describe('regrasDoLance.validarValorDoLance', () => {
  test('primeiro lance precisa ser de pelo menos o lance inicial', () => {
    expect(() =>
      validarValorDoLance({ ...leilao, valor: 999.99, licitanteId: 1, maiorLance: null })
    ).toThrow('O primeiro lance deve ser de pelo menos R$ 1000.00 (lance inicial).');

    expect(() =>
      validarValorDoLance({ ...leilao, valor: 1000, licitanteId: 1, maiorLance: null })
    ).not.toThrow();
  });

  test('licitante que ja detem o maior lance nao cobre a si mesmo', () => {
    expect(() =>
      validarValorDoLance({
        ...leilao,
        valor: 5000,
        licitanteId: 2,
        maiorLance: { licitante_id: 2, valor: '1000.00' },
      })
    ).toThrow('Voce ja detem o maior lance atual para este leilao.');
  });

  test('novo lance precisa cobrir o maior lance mais o incremento minimo', () => {
    const maiorLance = { licitante_id: 2, valor: '1500.00' };

    expect(() => validarValorDoLance({ ...leilao, valor: 1500, licitanteId: 3, maiorLance })).toThrow(
      'O lance deve ser de pelo menos R$ 1600.00 (maior lance R$ 1500.00 + incremento minimo R$ 100.00).'
    );
    expect(() => validarValorDoLance({ ...leilao, valor: 1599.99, licitanteId: 3, maiorLance })).toThrow();
    expect(() => validarValorDoLance({ ...leilao, valor: 1600, licitanteId: 3, maiorLance })).not.toThrow();
  });

  test('compara em centavos, sem erro de ponto flutuante', () => {
    const maiorLance = { licitante_id: 2, valor: '0.10' };
    expect(() =>
      validarValorDoLance({ lanceInicial: 0.1, incrementoMinimo: 0.2, valor: 0.3, licitanteId: 3, maiorLance })
    ).not.toThrow();
  });
});
