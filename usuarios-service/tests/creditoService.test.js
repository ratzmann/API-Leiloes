// =============================================================================
// tests/creditoService.test.js  -  testes do credito (reservas da Saga)
// -----------------------------------------------------------------------------
// Cobre: consulta de credito, reserva com e sem saldo (409), idempotencia pela
// referencia (mesma saga nao reserva duas vezes), liberacao repetida sem erro e
// liberacao de todas as reservas de um leilao cancelado.
// A transacao (emTransacao) e simulada pelo mock do reservaRepository.
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
jest.mock('../src/repositories/reservaRepository');
const licitanteRepository = require('../src/repositories/licitanteRepository');
const reservaRepository = require('../src/repositories/reservaRepository');
const creditoService = require('../src/services/creditoService');

// transacao falsa: roda a funcao com as operacoes mockadas
function transacaoFalsa(tx) {
  reservaRepository.emTransacao.mockImplementation((fn) => fn(tx));
  return tx;
}

function novaTx(sobrescritas = {}) {
  return transacaoFalsa({
    travarLicitante: jest.fn().mockResolvedValue({ id: 1, limite_credito: '5000.00' }),
    somarReservado: jest.fn().mockResolvedValue(0),
    buscarPorReferencia: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn(),
    criar: jest.fn().mockImplementation(async (d) => ({ id: 10, licitante_id: d.licitanteId, valor: d.valor, status: 'RESERVADA' })),
    liberar: jest.fn().mockImplementation(async (id) => ({ id, status: 'LIBERADA' })),
    ...sobrescritas,
  });
}

beforeEach(() => jest.clearAllMocks());

describe('creditoService.consultarCredito', () => {
  test('calcula disponivel como limite menos reservas ativas', async () => {
    licitanteRepository.buscarPorId.mockResolvedValue({ id: 1, limite_credito: '5000.00' });
    reservaRepository.somarReservado.mockResolvedValue(1500.5);

    const credito = await creditoService.consultarCredito(1);

    expect(credito).toEqual({ licitanteId: 1, limite: 5000, reservado: 1500.5, disponivel: 3499.5 });
  });

  test('lanca 404 para licitante inexistente', async () => {
    licitanteRepository.buscarPorId.mockResolvedValue(null);
    await expect(creditoService.consultarCredito(99)).rejects.toMatchObject({ codigo: 404 });
  });

  test('rejeita id invalido', async () => {
    await expect(creditoService.consultarCredito('abc')).rejects.toMatchObject({ codigo: 400 });
  });
});

describe('creditoService.reservar', () => {
  test('reserva quando ha credito disponivel', async () => {
    const tx = novaTx({ somarReservado: jest.fn().mockResolvedValue(1000) });

    const { reserva, criada } = await creditoService.reservar(1, { valor: 4000, referencia: 'saga-1' });

    expect(criada).toBe(true);
    expect(reserva.status).toBe('RESERVADA');
    expect(tx.criar).toHaveBeenCalledWith({ licitanteId: 1, valor: 4000, referencia: 'saga-1', leilaoId: null });
  });

  test('recusa com 409 quando o valor passa do credito disponivel', async () => {
    const tx = novaTx({ somarReservado: jest.fn().mockResolvedValue(1000) });

    await expect(
      creditoService.reservar(1, { valor: 4000.01, referencia: 'saga-2' })
    ).rejects.toMatchObject({ codigo: 409 });
    expect(tx.criar).not.toHaveBeenCalled();
  });

  test('e idempotente: mesma referencia devolve a reserva existente', async () => {
    const existente = { id: 7, status: 'RESERVADA', referencia: 'saga-3' };
    const tx = novaTx({ buscarPorReferencia: jest.fn().mockResolvedValue(existente) });

    const { reserva, criada } = await creditoService.reservar(1, { valor: 100, referencia: 'saga-3' });

    expect(criada).toBe(false);
    expect(reserva).toBe(existente);
    expect(tx.criar).not.toHaveBeenCalled();
  });

  test('lanca 404 quando o licitante nao existe', async () => {
    novaTx({ travarLicitante: jest.fn().mockResolvedValue(null) });
    await expect(creditoService.reservar(99, { valor: 10 })).rejects.toMatchObject({ codigo: 404 });
  });

  test('rejeita valor zero ou negativo antes de abrir transacao', async () => {
    await expect(creditoService.reservar(1, { valor: 0 })).rejects.toMatchObject({ codigo: 400 });
    await expect(creditoService.reservar(1, { valor: -5 })).rejects.toMatchObject({ codigo: 400 });
    expect(reservaRepository.emTransacao).not.toHaveBeenCalled();
  });
});

describe('creditoService.liberar', () => {
  test('libera reserva ativa', async () => {
    const tx = novaTx({
      buscarPorId: jest.fn().mockResolvedValue({ id: 10, licitante_id: 1, status: 'RESERVADA' }),
    });

    const reserva = await creditoService.liberar(1, 10);

    expect(reserva.status).toBe('LIBERADA');
    expect(tx.liberar).toHaveBeenCalledWith(10);
  });

  test('e idempotente: liberar de novo nao altera nada', async () => {
    const tx = novaTx({
      buscarPorId: jest.fn().mockResolvedValue({ id: 10, licitante_id: 1, status: 'LIBERADA' }),
    });

    const reserva = await creditoService.liberar(1, 10);

    expect(reserva.status).toBe('LIBERADA');
    expect(tx.liberar).not.toHaveBeenCalled();
  });

  test('lanca 404 quando a reserva e de outro licitante', async () => {
    novaTx({ buscarPorId: jest.fn().mockResolvedValue({ id: 10, licitante_id: 2, status: 'RESERVADA' }) });
    await expect(creditoService.liberar(1, 10)).rejects.toMatchObject({ codigo: 404 });
  });
});

describe('creditoService.listarReservas', () => {
  test('lista as reservas do licitante', async () => {
    reservaRepository.listarPorLicitante.mockResolvedValue([{ id: 1 }]);
    await expect(creditoService.listarReservas(1)).resolves.toEqual([{ id: 1 }]);
  });
});

describe('creditoService - reservas ligadas ao leilao (cancelamento)', () => {
  test('a reserva guarda o leilaoId enviado pela Saga', async () => {
    const tx = novaTx();
    await creditoService.reservar(1, { valor: 100, referencia: 'saga-7', leilaoId: '4' });
    expect(tx.criar).toHaveBeenCalledWith({ licitanteId: 1, valor: 100, referencia: 'saga-7', leilaoId: 4 });
  });

  test('leilaoId invalido e recusado (400) antes de abrir a transacao', async () => {
    await expect(creditoService.reservar(1, { valor: 100, leilaoId: 'abc' })).rejects.toMatchObject({ codigo: 400 });
    expect(reservaRepository.emTransacao).not.toHaveBeenCalled();
  });

  test('liberarPorLeilao devolve quantas reservas foram liberadas', async () => {
    reservaRepository.liberarPorLeilao.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const resultado = await creditoService.liberarPorLeilao('4');
    expect(resultado).toEqual({ leilaoId: 4, liberadas: 2, reservas: [{ id: 1 }, { id: 2 }] });
    expect(reservaRepository.liberarPorLeilao).toHaveBeenCalledWith(4);
  });

  test('liberarPorLeilao e idempotente (0 liberadas na segunda vez) e valida o id', async () => {
    reservaRepository.liberarPorLeilao.mockResolvedValue([]);
    await expect(creditoService.liberarPorLeilao(4)).resolves.toMatchObject({ liberadas: 0 });
    await expect(creditoService.liberarPorLeilao(0)).rejects.toMatchObject({ codigo: 400 });
  });
});
