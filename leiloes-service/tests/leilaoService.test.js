// =============================================================================
// tests/leilaoService.test.js  -  testes das regras do leilao
// -----------------------------------------------------------------------------
// Cobre as regras 1 a 8: dados do evento, data futura, leiloeiro existente
// (usuarios-service mockado, incluindo servico fora do ar -> 503), agenda livre,
// transicoes de status, edicao/remocao so enquanto AGENDADO e a Regra 7
// (autorizacao: so o leiloeiro logado cadastra, e so o dono altera) e a Regra 8
// (cancelar devolve o credito reservado, com repeticao segura se falhar).
// COMO LER UM TESTE (Jest):
//   describe('grupo', () => { ... })   agrupa testes de uma mesma funcao;
//   test('descricao', () => { ... })    um cenario (chamado tambem de it);
//   expect(valor).toBe(esperado)        a VERIFICACAO: se nao bater, o teste falha;
//   expect(() => f()).toThrow('msg')    confere que a funcao LANCA aquele erro;
//   await expect(promessa).rejects...   o mesmo, para funcoes async.
// jest.mock('caminho') troca o modulo real pelo MOCK (pasta __mocks__), entao
// os testes rodam sem banco e sem rede. Rodar:  npm test  (dentro do servico).
// =============================================================================

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

// payloads de token: o leiloeiro 1 (dono dos leiloes dos testes), outro
// leiloeiro e um licitante
const leiloeiro1 = { sub: 10, papel: 'LEILOEIRO', perfilId: 1 };
const leiloeiro2 = { sub: 11, papel: 'LEILOEIRO', perfilId: 2 };
const licitante = { sub: 20, papel: 'LICITANTE', perfilId: 1 };

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
      leilaoService.cadastrar(leilaoValido({ dataInicio: emHoras(-5), dataFim: emHoras(2) }), leiloeiro1)
    ).rejects.toThrow('Data de inicio deve estar no futuro.');
  });

  test('rejeita quando o leiloeiro nao existe no usuarios-service', async () => {
    usuariosClient.buscarLeiloeiro.mockResolvedValue(null);

    await expect(leilaoService.cadastrar(leilaoValido(), leiloeiro1)).rejects.toThrow(
      'Leiloeiro nao encontrado no servico de usuarios.'
    );
    expect(leilaoRepository.criar).not.toHaveBeenCalled();
  });

  test('devolve 503 quando o usuarios-service esta indisponivel', async () => {
    usuariosClient.buscarLeiloeiro.mockRejectedValue(
      new usuariosClient.ServicoIndisponivel('timeout')
    );

    await expect(leilaoService.cadastrar(leilaoValido(), leiloeiro1)).rejects.toMatchObject({
      codigo: 503,
    });
  });

  test('rejeita quando o leiloeiro ja tem leilao no mesmo periodo', async () => {
    leilaoRepository.listarAtivosPorLeiloeiro.mockResolvedValue([
      { id: 7, data_inicio: emHoras(25), data_fim: emHoras(27) },
    ]);

    await expect(leilaoService.cadastrar(leilaoValido(), leiloeiro1)).rejects.toThrow(
      /ja possui o leilao #7 agendado neste periodo/
    );
  });

  test('aceita leilao em periodo que nao conflita com os existentes', async () => {
    leilaoRepository.listarAtivosPorLeiloeiro.mockResolvedValue([
      { id: 7, data_inicio: emHoras(48), data_fim: emHoras(50) },
    ]);
    leilaoRepository.criar.mockResolvedValue({ id: 1, status: 'AGENDADO' });

    const resultado = await leilaoService.cadastrar(leilaoValido(), leiloeiro1);

    expect(resultado.id).toBe(1);
    expect(resultado.status).toBe('AGENDADO');
    expect(leilaoRepository.criar).toHaveBeenCalledTimes(1);
  });

  test('sem leiloeiroId no corpo, usa o leiloeiro logado (perfilId do token)', async () => {
    leilaoRepository.criar.mockResolvedValue({ id: 1, status: 'AGENDADO' });

    await leilaoService.cadastrar(leilaoValido({ leiloeiroId: null }), leiloeiro1);

    expect(leilaoRepository.criar).toHaveBeenCalledWith(expect.objectContaining({ leiloeiroId: 1 }));
  });
});

describe('leilaoService - autorizacao (Regra 7)', () => {
  test('401 ao cadastrar sem usuario logado', async () => {
    await expect(leilaoService.cadastrar(leilaoValido())).rejects.toMatchObject({ codigo: 401 });
  });

  test('403 quando um licitante tenta cadastrar leilao', async () => {
    await expect(leilaoService.cadastrar(leilaoValido(), licitante)).rejects.toMatchObject({
      codigo: 403,
      message: 'Apenas leiloeiros podem cadastrar leiloes.',
    });
    expect(leilaoRepository.criar).not.toHaveBeenCalled();
  });

  test('403 ao cadastrar leilao em nome de outro leiloeiro', async () => {
    await expect(leilaoService.cadastrar(leilaoValido({ leiloeiroId: 1 }), leiloeiro2)).rejects.toMatchObject({
      codigo: 403,
      message: 'Voce so pode cadastrar leiloes em seu proprio nome.',
    });
  });

  test('403 quando outro leiloeiro tenta abrir o leilao', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'AGENDADO', leiloeiro_id: 1 });

    await expect(leilaoService.abrir(1, leiloeiro2)).rejects.toMatchObject({ codigo: 403 });
    expect(leilaoRepository.atualizarStatus).not.toHaveBeenCalled();
  });

  test('403 quando outro leiloeiro tenta editar ou remover o leilao', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'AGENDADO', leiloeiro_id: 1 });

    await expect(leilaoService.atualizar(1, { titulo: 'Invasao' }, leiloeiro2)).rejects.toMatchObject({ codigo: 403 });
    await expect(leilaoService.remover(1, leiloeiro2)).rejects.toMatchObject({ codigo: 403 });
    expect(leilaoRepository.atualizar).not.toHaveBeenCalled();
    expect(leilaoRepository.remover).not.toHaveBeenCalled();
  });

  test('leilao inexistente continua 404 (existencia e conferida antes do dono)', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue(null);

    await expect(leilaoService.cancelar(999, leiloeiro2)).rejects.toMatchObject({ codigo: 404 });
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
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'AGENDADO', leiloeiro_id: 1 });
    leilaoRepository.atualizarStatus.mockResolvedValue({ id: 1, status: 'ABERTO' });

    const resultado = await leilaoService.abrir(1, leiloeiro1);

    expect(resultado.status).toBe('ABERTO');
    expect(leilaoRepository.atualizarStatus).toHaveBeenCalledWith(1, 'ABERTO');
  });

  test('recusa AGENDADO -> ENCERRADO', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'AGENDADO', leiloeiro_id: 1 });

    await expect(leilaoService.encerrar(1, leiloeiro1)).rejects.toThrow(
      'Transicao de status invalida: AGENDADO -> ENCERRADO.'
    );
  });

  test('recusa qualquer mudanca em leilao ENCERRADO', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'ENCERRADO', leiloeiro_id: 1 });

    await expect(leilaoService.cancelar(1, leiloeiro1)).rejects.toThrow(/Transicao de status invalida/);
  });

  test('recusa status inexistente', async () => {
    await expect(leilaoService.alterarStatus(1, 'PAUSADO', leiloeiro1)).rejects.toThrow(/Status invalido/);
  });
});

describe('leilaoService.atualizar', () => {
  test('recusa edicao de leilao ja aberto', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'ABERTO', leiloeiro_id: 1 });

    await expect(leilaoService.atualizar(1, { titulo: 'Novo titulo' }, leiloeiro1)).rejects.toThrow(
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

    const resultado = await leilaoService.atualizar(1, { titulo: 'Leilao novo' }, leiloeiro1);

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
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'ABERTO', leiloeiro_id: 1 });

    await expect(leilaoService.remover(1, leiloeiro1)).rejects.toThrow(/use o cancelamento/);
  });

  test('remove leilao AGENDADO', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'AGENDADO', leiloeiro_id: 1 });
    leilaoRepository.remover.mockResolvedValue(true);

    await expect(leilaoService.remover(1, leiloeiro1)).resolves.toBe(true);
  });
});

describe('leilaoService - Regra 8: cancelar devolve o credito reservado', () => {
  test('cancelar muda o status e DEPOIS pede a liberacao do credito ao usuarios-service', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'ABERTO', leiloeiro_id: 1 });
    leilaoRepository.atualizarStatus.mockResolvedValue({ id: 1, status: 'CANCELADO' });
    usuariosClient.liberarReservasDoLeilao.mockResolvedValue({ leilaoId: 1, liberadas: 1 });

    const resultado = await leilaoService.cancelar(1, leiloeiro1);

    expect(resultado.status).toBe('CANCELADO');
    expect(usuariosClient.liberarReservasDoLeilao).toHaveBeenCalledWith(1);
    // a ordem importa: primeiro para de aceitar lances, depois devolve o credito
    const ordemStatus = leilaoRepository.atualizarStatus.mock.invocationCallOrder[0];
    const ordemLiberar = usuariosClient.liberarReservasDoLeilao.mock.invocationCallOrder[0];
    expect(ordemStatus).toBeLessThan(ordemLiberar);
  });

  test('PATCH /status para CANCELADO tambem libera o credito', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'AGENDADO', leiloeiro_id: 1 });
    leilaoRepository.atualizarStatus.mockResolvedValue({ id: 1, status: 'CANCELADO' });

    await leilaoService.alterarStatus(1, 'CANCELADO', leiloeiro1);

    expect(usuariosClient.liberarReservasDoLeilao).toHaveBeenCalledWith(1);
  });

  test('encerrar NAO libera o credito (a reserva do vencedor continua valendo)', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'ABERTO', leiloeiro_id: 1 });
    leilaoRepository.atualizarStatus.mockResolvedValue({ id: 1, status: 'ENCERRADO' });

    await leilaoService.encerrar(1, leiloeiro1);

    expect(usuariosClient.liberarReservasDoLeilao).not.toHaveBeenCalled();
  });

  test('usuarios-service fora do ar: o leilao fica cancelado e a resposta e 503', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'ABERTO', leiloeiro_id: 1 });
    leilaoRepository.atualizarStatus.mockResolvedValue({ id: 1, status: 'CANCELADO' });
    usuariosClient.liberarReservasDoLeilao.mockRejectedValue(new usuariosClient.ServicoIndisponivel('timeout'));

    await expect(leilaoService.cancelar(1, leiloeiro1)).rejects.toMatchObject({
      codigo: 503,
      message: expect.stringMatching(/Repita o cancelamento/),
    });
    expect(leilaoRepository.atualizarStatus).toHaveBeenCalledWith(1, 'CANCELADO');
  });

  test('cancelar de novo um leilao ja CANCELADO so tenta liberar o credito outra vez', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'CANCELADO', leiloeiro_id: 1 });
    usuariosClient.liberarReservasDoLeilao.mockResolvedValue({ leilaoId: 1, liberadas: 1 });

    const resultado = await leilaoService.cancelar(1, leiloeiro1);

    expect(resultado.status).toBe('CANCELADO');
    expect(leilaoRepository.atualizarStatus).not.toHaveBeenCalled();
    expect(usuariosClient.liberarReservasDoLeilao).toHaveBeenCalledWith(1);
  });

  test('so o dono pode repetir o cancelamento', async () => {
    leilaoRepository.buscarPorId.mockResolvedValue({ id: 1, status: 'CANCELADO', leiloeiro_id: 1 });
    await expect(leilaoService.cancelar(1, leiloeiro2)).rejects.toMatchObject({ codigo: 403 });
    expect(usuariosClient.liberarReservasDoLeilao).not.toHaveBeenCalled();
  });
});
