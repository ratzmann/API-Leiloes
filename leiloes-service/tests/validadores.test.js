const {
  dataValida,
  numeroPositivo,
  inteiroPositivo,
  statusValido,
  transicaoPermitida,
  periodosSobrepoem,
} = require('../src/utils/validadores');

describe('dataValida', () => {
  test('aceita string ISO e objeto Date', () => {
    expect(dataValida('2026-10-01T14:00:00Z')).toBe(true);
    expect(dataValida(new Date())).toBe(true);
  });

  test('rejeita texto livre, vazio e nulo', () => {
    expect(dataValida('amanha')).toBe(false);
    expect(dataValida('')).toBe(false);
    expect(dataValida(null)).toBe(false);
  });
});

describe('numeroPositivo / inteiroPositivo', () => {
  test('numeroPositivo aceita decimais e recusa zero e negativos', () => {
    expect(numeroPositivo('1500.50')).toBe(true);
    expect(numeroPositivo(0)).toBe(false);
    expect(numeroPositivo(-1)).toBe(false);
    expect(numeroPositivo('abc')).toBe(false);
  });

  test('inteiroPositivo recusa decimais', () => {
    expect(inteiroPositivo(40)).toBe(true);
    expect(inteiroPositivo(2.5)).toBe(false);
    expect(inteiroPositivo(0)).toBe(false);
  });
});

describe('statusValido / transicaoPermitida', () => {
  test('reconhece apenas os quatro status do dominio', () => {
    expect(statusValido('AGENDADO')).toBe(true);
    expect(statusValido('PAUSADO')).toBe(false);
  });

  test('respeita o ciclo de vida do leilao', () => {
    expect(transicaoPermitida('AGENDADO', 'ABERTO')).toBe(true);
    expect(transicaoPermitida('ABERTO', 'ENCERRADO')).toBe(true);
    expect(transicaoPermitida('ABERTO', 'AGENDADO')).toBe(false);
    expect(transicaoPermitida('ENCERRADO', 'ABERTO')).toBe(false);
    expect(transicaoPermitida('CANCELADO', 'ABERTO')).toBe(false);
  });
});

describe('periodosSobrepoem', () => {
  const base = ['2026-10-01T10:00:00Z', '2026-10-01T12:00:00Z'];

  test('detecta sobreposicao parcial', () => {
    expect(
      periodosSobrepoem(...base, '2026-10-01T11:00:00Z', '2026-10-01T13:00:00Z')
    ).toBe(true);
  });

  test('nao acusa conflito em periodos encostados', () => {
    expect(
      periodosSobrepoem(...base, '2026-10-01T12:00:00Z', '2026-10-01T14:00:00Z')
    ).toBe(false);
  });

  test('nao acusa conflito em periodos distantes', () => {
    expect(
      periodosSobrepoem(...base, '2026-10-05T10:00:00Z', '2026-10-05T12:00:00Z')
    ).toBe(false);
  });
});
