jest.mock('../src/repositories/leilaoRepository');
jest.mock('../src/clients/usuariosClient');

const leilaoRepository = require('../src/repositories/leilaoRepository');
const usuariosClient = require('../src/clients/usuariosClient');
const leilaoService = require('../src/services/leilaoService');

const HORA = 60 * 60 * 1000;

function emHoras(horas) {
  return new Date(Date.now() + horas * HORA).toISOString();
}

function leilaoValido(extra = {}) {
  return {
    leiloeiroId: 1,
    titulo: 'Leilao de Nelore - Lote 12',
    localEvento: 'Parque de Exposicoes de Lages',
    raca: 'Nelore',
    quantidadeBois: 40,
    lanceInicial: 5000,
    incrementoMinimo: 100,
    dataInicio: emHoras(24),
    dataFim: emHoras(26),
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.USUARIOS_SERVICE_URL = 'http://usuarios-service:3002';
  usuariosClient.buscarLeiloeiro.mockResolvedValue({ id: 1, nome: 'Carlos Pereira' });
  leilaoRepository.listarAtivosPorLeiloeiro.mockResolvedValue([]);
});

describe('leilaoService.validarDados', () => {
  test('rejeita titulo curto', () => {
    expect(() => leilaoService.validarDados(leilaoValido({ titulo: 'Ab' }))).toThrow(
      'Titulo deve ter ao menos 3 caracteres.'
    );
  });

  test('rejeita quantidade de bois zerada', () => {
    expect(() => leilaoService.validarDados(leilaoValido({ quantidadeBois: 0 }))).toThrow(
      /Quantidade de bois/
    );
  });

  test('rejeita lance inicial negativo', () => {
    expect(() => leilaoService.validarDados(leilaoValido({ lanceInicial: -10 }))).toThrow(
      'Lance inicial deve ser maior que zero.'
    );
  });

  test('rejeita incremento maior que o lance inicial', () => {
    expect(() =>
      leilaoService.validarDados(leilaoValido({ lanceInicial: 100, incrementoMinimo: 500 }))
    ).toThrow('Incremento minimo nao pode ser maior que o lance inicial.');
  });

  test('rejeita data de fim anterior a data de inicio', () => {
    expect(() =>
      leilaoService.validarDados(leilaoValido({ dataInicio: emHoras(26), dataFim: emHoras(24) }))
    ).toThrow('Data de fim deve ser posterior a data de inicio.');
  });

  test('rejeita leilao com duracao menor que 30 minutos', () => {
    expect(() =>
      leilaoService.validarDados(
        leilaoValido({ dataInicio: emHoras(24), dataFim: emHoras(24.1) })
      )
    ).toThrow(/ao menos 30 minutos/);
  });

  test('rejeita data em formato invalido', () => {
    expect(() => leilaoService.validarDados(leilaoValido({ dataInicio: 'ontem' }))).toThrow(
      /ISO 8601/
    );
  });

  test('aceita dados validos', () => {
    expect(() => leilaoService.validarDados(leilaoValido())).not.toThrow();
  });
});

describe('leilaoService.cadastrar', () => {
  test('rejeita leilao com data de inicio no passado', async () => {
    await expect(
      leilaoService.cadastrar(leilaoValido({ dataInicio: emHoras(-5), dataFim: emHoras(2) }))
    ).rejects.toThrow('Data de inicio deve estar no futuro.');
  });

  test('rejeita quando o leiloeiro nao existe no usuarios-service', async () => {
    usuariosClient.buscarLeiloeiro.mockResolvedValue(null);

    await expect(leilaoService.cadastrar(leilaoValido())).rejects.toThrow(
      'Leiloeiro nao encontrado no servico de usuarios.'
    );
    expect(leilaoRepository.criar).not.toHaveBeenCalled();
  });

  test('devolve 503 quando o usuarios-service esta indisponivel', async () => {
    usuariosClient.buscarLeiloeiro.mockRejectedValue(
      new usuariosClient.ServicoIndisponivel('timeout')
    );

    await expect(leilaoService.cadastrar(leilaoValido())).rejects.toMatchObject({
      codigo: 503,
    });
  });

  test('rejeita quando o leiloeiro ja tem leilao no mesmo periodo', async () => {
    leilaoRepository.listarAtivosPorLeiloeiro.mockResolvedValue([
      { id: 7, data_inicio: emHoras(25), data_fim: emHoras(27) },
    ]);

    await expect(leilaoService.cadastrar(leilaoValido())).rejects.toThrow(
      /ja possui o leilao #7 agendado neste periodo/
    );
  });

  test('aceita leilao em periodo que nao conflita com os existentes', async () => {
    leilaoRepository.listarAtivosPorLeiloeiro.mockResolvedValue([
      { id: 7, data_inicio: emHoras(48), data_fim: emHoras(50) },
    ]);
    leilaoRepository.criar.mockResolvedValue({ id: 1, status: 'AGENDADO' });

    const resultado = await leilaoService.cadastrar(leilaoValido());

    expect(resultado.id).toBe(1);
    expect(resultado.status).toBe('AGENDADO');
    expect(leilaoRepository.criar).toHaveBeenCalledTimes(1);
  });

  test('exige leiloeiroId', async () => {
    await expect(leilaoService.cadastrar(leilaoValido({ leiloeiroId: null }))).rejects.toThrow(
      'Informe o leiloeiroId responsavel pelo leilao.'
    );
  });
});

describe('leilaoService.buscarPorId', () => {
  test('lanca 404 quando nao encontrado', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue(null);
    await expect(leilaoService.buscarPorId(999)).rejects.toThrow('Leilao nao encontrado.');
  });
});

describe('leilaoService.alterarStatus', () => {
  test('permite AGENDADO -> ABERTO', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'AGENDADO' });
    leilaoRepository.atualizarStatus.mockResolvedValue({ id: 1, status: 'ABERTO' });

    const resultado = await leilaoService.abrir(1);

    expect(resultado.status).toBe('ABERTO');
    expect(leilaoRepository.atualizarStatus).toHaveBeenCalledWith(1, 'ABERTO');
  });

  test('recusa AGENDADO -> ENCERRADO', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'AGENDADO' });

    await expect(leilaoService.encerrar(1)).rejects.toThrow(
      'Transicao de status invalida: AGENDADO -> ENCERRADO.'
    );
  });

  test('recusa qualquer mudanca em leilao ENCERRADO', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'ENCERRADO' });

    await expect(leilaoService.cancelar(1)).rejects.toThrow(/Transicao de status invalida/);
  });

  test('recusa status inexistente', async () => {
    await expect(leilaoService.alterarStatus(1, 'PAUSADO')).rejects.toThrow(/Status invalido/);
  });
});

describe('leilaoService.atualizar', () => {
  test('recusa edicao de leilao ja aberto', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'ABERTO' });

    await expect(leilaoService.atualizar(1, { titulo: 'Novo titulo' })).rejects.toThrow(
      'Leilao com status ABERTO nao pode mais ser editado.'
    );
  });

  test('atualiza leilao AGENDADO mantendo os campos nao enviados', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({
      id: 1,
      status: 'AGENDADO',
      leiloeiro_id: 1,
      titulo: 'Leilao antigo',
      quantidade_bois: 10,
      lance_inicial: 1000,
      incremento_minimo: 50,
      data_inicio: emHoras(24),
      data_fim: emHoras(26),
    });
    leilaoRepository.atualizar.mockResolvedValue({ id: 1, titulo: 'Leilao novo' });

    const resultado = await leilaoService.atualizar(1, { titulo: 'Leilao novo' });

    expect(resultado.titulo).toBe('Leilao novo');
    expect(leilaoRepository.atualizar).toHaveBeenCalledTimes(1);
  });
});

describe('leilaoService.consultarDisponibilidade', () => {
  test('leilao ABERTO dentro do periodo aceita lances', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({
      id: 1,
      status: 'ABERTO',
      lance_inicial: '5000.00',
      incremento_minimo: '100.00',
      data_inicio: emHoras(-1),
      data_fim: emHoras(1),
    });

    const resultado = await leilaoService.consultarDisponibilidade(1);

    expect(resultado.aceitandoLances).toBe(true);
    expect(resultado.lanceInicial).toBe(5000);
  });

  test('leilao AGENDADO ainda nao aceita lances', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({
      id: 1,
      status: 'AGENDADO',
      lance_inicial: '5000.00',
      incremento_minimo: '100.00',
      data_inicio: emHoras(24),
      data_fim: emHoras(26),
    });

    const resultado = await leilaoService.consultarDisponibilidade(1);

    expect(resultado.aceitandoLances).toBe(false);
  });
});

describe('leilaoService.remover', () => {
  test('so remove leilao AGENDADO', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'ABERTO' });

    await expect(leilaoService.remover(1)).rejects.toThrow(/use o cancelamento/);
  });

  test('remove leilao AGENDADO', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'AGENDADO' });
    leilaoRepository.remover.mockResolvedValue(true);

    await expect(leilaoService.remover(1)).resolves.toBe(true);
  });
});
