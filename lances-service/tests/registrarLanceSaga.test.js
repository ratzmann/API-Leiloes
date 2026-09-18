process.env.SAGA_ESPERA_REPETICAO_MS = '0';

jest.mock('../src/repositories/lanceRepository');
jest.mock('../src/repositories/sagaRepository');
jest.mock('../src/clients/leiloesClient');
jest.mock('../src/clients/usuariosClient');

const lanceRepository = require('../src/repositories/lanceRepository');
const sagaRepository = require('../src/repositories/sagaRepository');
const leiloesClient = require('../src/clients/leiloesClient');
const usuariosClient = require('../src/clients/usuariosClient');
const { ServicoIndisponivel } = require('../src/clients/http');
const { ErroDeValidacao } = require('../src/utils/erros');
const saga = require('../src/sagas/registrarLanceSaga');

const LEILAO_ABERTO = { id: 1, status: 'ABERTO', aceitandoLances: true, lanceInicial: 1000, incrementoMinimo: 100 };
const PEDIDO = { leilaoId: 1, licitanteId: 7, valor: 1600 };

// guarda uma copia da saga a cada salvar() pra conferir os passos
let salvas;
let tx;

beforeEach(() => {
  jest.clearAllMocks();
  salvas = [];

  sagaRepository.criar.mockImplementation(async (d) => ({ id: 42, status: 'INICIADA', ...d }));
  sagaRepository.salvar.mockImplementation(async (s) => {
    salvas.push(JSON.parse(JSON.stringify(s)));
    return s;
  });

  leiloesClient.consultarDisponibilidade.mockResolvedValue(LEILAO_ABERTO);
  lanceRepository.buscarMaiorPorLeilao.mockResolvedValue({ id: 3, licitante_id: 2, valor: '1500.00', reserva_id: 11 });
  usuariosClient.reservarCredito.mockResolvedValue({ id: 20, status: 'RESERVADA' });
  usuariosClient.liberarReserva.mockResolvedValue({ status: 'LIBERADA' });

  tx = {
    buscarMaior: jest.fn().mockResolvedValue({ id: 3, licitante_id: 2, valor: '1500.00', reserva_id: 11 }),
    criar: jest.fn().mockImplementation(async (d) => ({ id: 99, leilao_id: 1, licitante_id: d.licitanteId, valor: d.valor })),
  };
  lanceRepository.registrarComTrava.mockImplementation(async (leilaoId, fn) => fn(tx));
});

const ultimaSalva = () => salvas[salvas.length - 1];
const resultados = () => ultimaSalva().passos.map((p) => `${p.passo}:${p.resultado}`);

describe('Saga de registro de lance: caminho feliz', () => {
  test('executa os 4 passos e libera o credito do licitante superado', async () => {
    const lance = await saga.executar(PEDIDO);

    expect(lance).toMatchObject({ id: 99, sagaId: 42, sagaStatus: 'CONCLUIDA' });
    expect(usuariosClient.reservarCredito).toHaveBeenCalledWith(7, 1600, 'saga-42');
    expect(tx.criar).toHaveBeenCalledWith({ licitanteId: 7, valor: 1600, sagaId: 42, reservaId: 20 });
    expect(usuariosClient.liberarReserva).toHaveBeenCalledWith(2, 11);
    expect(resultados()).toEqual([
      'consultar-disponibilidade:OK',
      'reservar-credito:OK',
      'gravar-lance:OK',
      'liberar-credito-superado:OK',
    ]);
  });

  test('primeiro lance do leilao nao tem credito a liberar', async () => {
    lanceRepository.buscarMaiorPorLeilao.mockResolvedValue(null);
    tx.buscarMaior.mockResolvedValue(null);

    const lance = await saga.executar({ ...PEDIDO, valor: 1000 });

    expect(lance.sagaStatus).toBe('CONCLUIDA');
    expect(usuariosClient.liberarReserva).not.toHaveBeenCalled();
  });
});

describe('Saga de registro de lance: falhas antes de reservar credito', () => {
  test('leilao inexistente: 404 e nada a compensar', async () => {
    leiloesClient.consultarDisponibilidade.mockResolvedValue(null);

    await expect(saga.executar(PEDIDO)).rejects.toMatchObject({ codigo: 404, sagaId: 42 });
    expect(usuariosClient.reservarCredito).not.toHaveBeenCalled();
    expect(ultimaSalva().status).toBe('FALHOU');
  });

  test('leilao que nao aceita lances: 409', async () => {
    leiloesClient.consultarDisponibilidade.mockResolvedValue({ ...LEILAO_ABERTO, status: 'AGENDADO', aceitandoLances: false });
    await expect(saga.executar(PEDIDO)).rejects.toMatchObject({ codigo: 409 });
    expect(usuariosClient.reservarCredito).not.toHaveBeenCalled();
  });

  test('lance abaixo do minimo e recusado antes de tocar no credito', async () => {
    await expect(saga.executar({ ...PEDIDO, valor: 1550 })).rejects.toMatchObject({ codigo: 400 });
    expect(usuariosClient.reservarCredito).not.toHaveBeenCalled();
  });

  test('leiloes-service fora do ar: 503', async () => {
    leiloesClient.consultarDisponibilidade.mockRejectedValue(new ServicoIndisponivel('sem resposta'));
    await expect(saga.executar(PEDIDO)).rejects.toMatchObject({ codigo: 503 });
    expect(ultimaSalva().status).toBe('FALHOU');
  });

  test('credito insuficiente: reserva recusada e nada a compensar', async () => {
    usuariosClient.reservarCredito.mockRejectedValue(new ErroDeValidacao('Credito insuficiente', 409));

    await expect(saga.executar(PEDIDO)).rejects.toMatchObject({ codigo: 409 });
    expect(usuariosClient.liberarReserva).not.toHaveBeenCalled();
    expect(ultimaSalva().status).toBe('FALHOU');
    expect(resultados()).toEqual(['consultar-disponibilidade:OK', 'reservar-credito:FALHOU']);
  });

  test('falha simulada no passo de reserva nao gera compensacao', async () => {
    await expect(saga.executar({ ...PEDIDO, simularFalha: 'reservar-credito' })).rejects.toMatchObject({ codigo: 500 });
    expect(usuariosClient.reservarCredito).not.toHaveBeenCalled();
    expect(ultimaSalva().status).toBe('FALHOU');
  });
});

describe('Saga de registro de lance: compensacao', () => {
  test('falha ao gravar o lance devolve o credito reservado', async () => {
    await expect(saga.executar({ ...PEDIDO, simularFalha: 'gravar-lance' })).rejects.toMatchObject({
      codigo: 500,
      sagaId: 42,
    });

    expect(usuariosClient.liberarReserva).toHaveBeenCalledWith(7, 20);
    expect(ultimaSalva().status).toBe('COMPENSADA');
    expect(resultados()).toEqual([
      'consultar-disponibilidade:OK',
      'reservar-credito:OK',
      'gravar-lance:FALHOU',
      'reservar-credito:COMPENSADO',
    ]);
  });

  test('lance concorrente detectado com o leilao travado tambem compensa', async () => {
    // outro licitante gravou 1700 entre o passo 1 e a trava
    tx.buscarMaior.mockResolvedValue({ id: 4, licitante_id: 5, valor: '1700.00', reserva_id: 12 });

    await expect(saga.executar(PEDIDO)).rejects.toMatchObject({ codigo: 400 });
    expect(tx.criar).not.toHaveBeenCalled();
    expect(usuariosClient.liberarReserva).toHaveBeenCalledWith(7, 20);
    expect(ultimaSalva().status).toBe('COMPENSADA');
  });

  test('erro inesperado ao gravar vira 500 e compensa', async () => {
    lanceRepository.registrarComTrava.mockRejectedValue(new Error('conexao perdida'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(saga.executar(PEDIDO)).rejects.toMatchObject({ codigo: 500 });
    expect(ultimaSalva().status).toBe('COMPENSADA');
    console.error.mockRestore();
  });

  test('se a propria compensacao falhar, a saga registra FALHOU_COMPENSACAO', async () => {
    usuariosClient.liberarReserva.mockRejectedValue(new ServicoIndisponivel('usuarios fora'));

    await expect(saga.executar({ ...PEDIDO, simularFalha: 'gravar-lance' })).rejects.toMatchObject({ codigo: 500 });
    expect(ultimaSalva().status).toBe('FALHOU_COMPENSACAO');
  });
});

describe('Saga de registro de lance: passo repetivel', () => {
  test('falha ao liberar o superado nao desfaz o lance: fica pendente', async () => {
    const lance = await saga.executar({ ...PEDIDO, simularFalha: 'liberar-credito-superado' });

    expect(lance).toMatchObject({ id: 99, sagaStatus: 'CONCLUIDA_COM_PENDENCIA' });
    expect(ultimaSalva()).toMatchObject({ licitante_superado_id: 2, reserva_superada_id: 11 });
    expect(resultados()).toContain('liberar-credito-superado:PENDENTE');
  });

  test('tenta de novo antes de desistir', async () => {
    usuariosClient.liberarReserva
      .mockRejectedValueOnce(new ServicoIndisponivel('instavel'))
      .mockResolvedValueOnce({ status: 'LIBERADA' });

    const lance = await saga.executar(PEDIDO);

    expect(lance.sagaStatus).toBe('CONCLUIDA');
    expect(usuariosClient.liberarReserva).toHaveBeenCalledTimes(2);
  });

  test('reprocessar conclui a pendencia', async () => {
    sagaRepository.buscarPorId.mockResolvedValue({
      id: 42,
      status: 'CONCLUIDA_COM_PENDENCIA',
      passos: [],
      licitante_superado_id: 2,
      reserva_superada_id: 11,
    });

    const reprocessada = await saga.reprocessar(42);

    expect(reprocessada.status).toBe('CONCLUIDA');
    expect(usuariosClient.liberarReserva).toHaveBeenCalledWith(2, 11);
  });

  test('reprocessar mantem a pendencia se o usuarios-service seguir fora', async () => {
    sagaRepository.buscarPorId.mockResolvedValue({
      id: 42,
      status: 'CONCLUIDA_COM_PENDENCIA',
      passos: [],
      licitante_superado_id: 2,
      reserva_superada_id: 11,
    });
    usuariosClient.liberarReserva.mockRejectedValue(new ServicoIndisponivel('fora'));

    await expect(saga.reprocessar(42)).rejects.toMatchObject({ codigo: 503 });
    expect(ultimaSalva().status).toBe('CONCLUIDA_COM_PENDENCIA');
  });

  test('reprocessar recusa saga sem pendencia ou inexistente', async () => {
    sagaRepository.buscarPorId.mockResolvedValueOnce({ id: 1, status: 'CONCLUIDA', passos: [] });
    await expect(saga.reprocessar(1)).rejects.toMatchObject({ codigo: 409 });

    sagaRepository.buscarPorId.mockResolvedValueOnce(null);
    await expect(saga.reprocessar(2)).rejects.toMatchObject({ codigo: 404 });
  });
});
