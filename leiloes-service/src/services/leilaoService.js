const leilaoRepository = require('../repositories/leilaoRepository');
const usuariosClient = require('../clients/usuariosClient');
const { ErroDeValidacao } = require('../utils/erros');
const {
  dataValida,
  paraData,
  numeroPositivo,
  inteiroPositivo,
  statusValido,
  transicaoPermitida,
  periodosSobrepoem,
} = require('../utils/validadores');

const DURACAO_MINIMA_MINUTOS = 30;

/**
 * Regra de negocio 1: validacao do evento.
 * Titulo, periodo, lote e valores precisam fazer sentido para um leilao de bois.
 */
function validarDados({
  titulo,
  quantidadeBois,
  lanceInicial,
  incrementoMinimo,
  dataInicio,
  dataFim,
}) {
  if (!titulo || titulo.trim().length < 3) {
    throw new ErroDeValidacao('Titulo deve ter ao menos 3 caracteres.');
  }
  if (!inteiroPositivo(quantidadeBois)) {
    throw new ErroDeValidacao('Quantidade de bois deve ser um numero inteiro maior que zero.');
  }
  if (!numeroPositivo(lanceInicial)) {
    throw new ErroDeValidacao('Lance inicial deve ser maior que zero.');
  }
  if (!numeroPositivo(incrementoMinimo)) {
    throw new ErroDeValidacao('Incremento minimo deve ser maior que zero.');
  }
  if (Number(incrementoMinimo) > Number(lanceInicial)) {
    throw new ErroDeValidacao('Incremento minimo nao pode ser maior que o lance inicial.');
  }
  if (!dataValida(dataInicio) || !dataValida(dataFim)) {
    throw new ErroDeValidacao('Datas de inicio e fim devem estar no formato ISO 8601.');
  }

  const inicio = paraData(dataInicio);
  const fim = paraData(dataFim);

  if (fim <= inicio) {
    throw new ErroDeValidacao('Data de fim deve ser posterior a data de inicio.');
  }
  const duracaoMinutos = (fim - inicio) / 60000;
  if (duracaoMinutos < DURACAO_MINIMA_MINUTOS) {
    throw new ErroDeValidacao(
      `Leilao deve durar ao menos ${DURACAO_MINIMA_MINUTOS} minutos.`
    );
  }
}

function validarDataFutura(dataInicio) {
  if (paraData(dataInicio) <= new Date()) {
    throw new ErroDeValidacao('Data de inicio deve estar no futuro.');
  }
}

async function listar(filtros) {
  return leilaoRepository.listar(filtros);
}

async function buscarPorId(id) {
  const leilao = await leilaoRepository.buscarPorId(id);
  if (!leilao) {
    throw new ErroDeValidacao('Leilao nao encontrado.', 404);
  }
  return leilao;
}

/**
 * Regra de negocio 2: o leilao so existe se o leiloeiro existir.
 * A checagem e feita chamando o usuarios-service via REST (comunicacao entre
 * microsservicos), com a URL vinda de variavel de ambiente.
 */
async function garantirLeiloeiroExiste(leiloeiroId) {
  if (!inteiroPositivo(leiloeiroId)) {
    throw new ErroDeValidacao('Informe o leiloeiroId responsavel pelo leilao.');
  }

  let leiloeiro;
  try {
    leiloeiro = await usuariosClient.buscarLeiloeiro(leiloeiroId);
  } catch (err) {
    if (err instanceof usuariosClient.ServicoIndisponivel) {
      throw new ErroDeValidacao(
        'Nao foi possivel validar o leiloeiro: servico de usuarios indisponivel.',
        503
      );
    }
    throw err;
  }

  // Sem USUARIOS_SERVICE_URL configurada o client devolve null; nesse caso nao
  // ha como validar e o cadastro segue (util para rodar o servico isolado).
  if (leiloeiro === null && process.env.USUARIOS_SERVICE_URL) {
    throw new ErroDeValidacao('Leiloeiro nao encontrado no servico de usuarios.', 404);
  }
  return leiloeiro;
}

/**
 * Regra de negocio 3: um leiloeiro nao pode conduzir dois leiloes ao mesmo
 * tempo — periodos de eventos AGENDADOS ou ABERTOS nao podem se sobrepor.
 */
async function garantirAgendaLivre(leiloeiroId, dataInicio, dataFim, ignorarId = null) {
  const ativos = await leilaoRepository.listarAtivosPorLeiloeiro(leiloeiroId, ignorarId);
  const conflito = (ativos || []).find((leilao) =>
    periodosSobrepoem(dataInicio, dataFim, leilao.data_inicio, leilao.data_fim)
  );

  if (conflito) {
    throw new ErroDeValidacao(
      `Leiloeiro ja possui o leilao #${conflito.id} agendado neste periodo.`,
      409
    );
  }
}

async function cadastrar(dados) {
  const {
    leiloeiroId,
    titulo,
    descricao,
    localEvento,
    raca,
    quantidadeBois,
    lanceInicial,
    incrementoMinimo,
    dataInicio,
    dataFim,
  } = dados;

  validarDados(dados);
  validarDataFutura(dataInicio);
  await garantirLeiloeiroExiste(leiloeiroId);
  await garantirAgendaLivre(leiloeiroId, dataInicio, dataFim);

  return leilaoRepository.criar({
    leiloeiroId: Number(leiloeiroId),
    titulo: titulo.trim(),
    descricao,
    localEvento,
    raca,
    quantidadeBois: Number(quantidadeBois),
    lanceInicial: Number(lanceInicial),
    incrementoMinimo: Number(incrementoMinimo),
    dataInicio: paraData(dataInicio),
    dataFim: paraData(dataFim),
  });
}

/**
 * Regra de negocio 4: leilao so pode ser editado enquanto esta AGENDADO —
 * depois de aberto ja existem lances dependendo das regras publicadas.
 */
async function atualizar(id, dados) {
  const leilao = await buscarPorId(id);

  if (leilao.status !== 'AGENDADO') {
    throw new ErroDeValidacao(
      `Leilao com status ${leilao.status} nao pode mais ser editado.`,
      409
    );
  }

  const atualizado = {
    titulo: dados.titulo ?? leilao.titulo,
    quantidadeBois: dados.quantidadeBois ?? leilao.quantidade_bois,
    lanceInicial: dados.lanceInicial ?? leilao.lance_inicial,
    incrementoMinimo: dados.incrementoMinimo ?? leilao.incremento_minimo,
    dataInicio: dados.dataInicio ?? leilao.data_inicio,
    dataFim: dados.dataFim ?? leilao.data_fim,
  };

  validarDados(atualizado);

  if (dados.dataInicio || dados.dataFim) {
    await garantirAgendaLivre(
      leilao.leiloeiro_id,
      atualizado.dataInicio,
      atualizado.dataFim,
      id
    );
  }

  return leilaoRepository.atualizar(id, {
    ...dados,
    dataInicio: dados.dataInicio ? paraData(dados.dataInicio) : null,
    dataFim: dados.dataFim ? paraData(dados.dataFim) : null,
  });
}

/**
 * Regra de negocio 5: o ciclo de vida do leilao segue
 * AGENDADO -> ABERTO -> ENCERRADO, e AGENDADO/ABERTO podem ir para CANCELADO.
 * Qualquer outra transicao e recusada.
 */
async function alterarStatus(id, novoStatus) {
  if (!statusValido(novoStatus)) {
    throw new ErroDeValidacao('Status invalido. Use AGENDADO, ABERTO, ENCERRADO ou CANCELADO.');
  }

  const leilao = await buscarPorId(id);

  if (!transicaoPermitida(leilao.status, novoStatus)) {
    throw new ErroDeValidacao(
      `Transicao de status invalida: ${leilao.status} -> ${novoStatus}.`,
      409
    );
  }

  return leilaoRepository.atualizarStatus(id, novoStatus);
}

async function abrir(id) {
  return alterarStatus(id, 'ABERTO');
}

async function encerrar(id) {
  return alterarStatus(id, 'ENCERRADO');
}

async function cancelar(id) {
  return alterarStatus(id, 'CANCELADO');
}

/**
 * Consultado pelo microsservico de lances antes de aceitar um lance:
 * devolve o leilao e se ele esta aceitando lances no momento.
 */
async function consultarDisponibilidade(id) {
  const leilao = await buscarPorId(id);
  const agora = new Date();

  const dentroDoPeriodo =
    paraData(leilao.data_inicio) <= agora && agora <= paraData(leilao.data_fim);

  return {
    id: leilao.id,
    status: leilao.status,
    aceitandoLances: leilao.status === 'ABERTO' && dentroDoPeriodo,
    lanceInicial: Number(leilao.lance_inicial),
    incrementoMinimo: Number(leilao.incremento_minimo),
    dataInicio: leilao.data_inicio,
    dataFim: leilao.data_fim,
  };
}

async function remover(id) {
  const leilao = await buscarPorId(id);
  if (leilao.status !== 'AGENDADO') {
    throw new ErroDeValidacao(
      'Somente leiloes ainda AGENDADOS podem ser removidos; use o cancelamento.',
      409
    );
  }
  return leilaoRepository.remover(id);
}

module.exports = {
  listar,
  buscarPorId,
  cadastrar,
  atualizar,
  alterarStatus,
  abrir,
  encerrar,
  cancelar,
  consultarDisponibilidade,
  remover,
  validarDados,
  validarDataFutura,
  garantirLeiloeiroExiste,
  garantirAgendaLivre,
};
