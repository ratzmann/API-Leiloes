// =============================================================================
// services/leilaoService.js  -  REGRAS DE NEGOCIO do leilao
// -----------------------------------------------------------------------------
// Todas as regras do leilao estao aqui (numeradas como no README):
//   Regra 1 - dados coerentes (titulo, lote, valores, datas, duracao minima)
//   Regra 2 - data de inicio no futuro
//   Regra 3 - o leiloeiro precisa existir (consulta REST ao usuarios-service)
//   Regra 4 - o leiloeiro nao pode ter dois leiloes ativos no mesmo horario
//   Regra 5 - ciclo de vida: AGENDADO -> ABERTO -> ENCERRADO (ou CANCELADO)
//   Regra 6 - editar/remover so enquanto AGENDADO
//   Regra 7 - autorizacao: so um LEILOEIRO cadastra (em nome proprio), e so o
//             DONO do leilao edita, muda status ou remove
//   Regra 8 - cancelar o leilao devolve o credito reservado pelos licitantes
//             (chamada REST ao usuarios-service)
//
// Quem chama: controllers/leilaoController.js
// Quem e chamado: repositories/leilaoRepository.js (banco),
//                 clients/usuariosClient.js (outro microsservico),
//                 utils/validadores.js
// =============================================================================

const leilaoRepository = require('../repositories/leilaoRepository');
const usuariosClient = require('../clients/usuariosClient');
const { ErroDeValidacao } = require('../utils/erros');
// Importa varias funcoes de uma vez com desestruturacao.
const {
  dataValida,
  paraData,
  numeroPositivo,
  inteiroPositivo,
  statusValido,
  transicaoPermitida,
  periodosSobrepoem,
} = require('../utils/validadores');

// Um leilao precisa durar pelo menos meia hora.
const DURACAO_MINIMA_MINUTOS = 30;

/**
 * Regra 1: titulo, lote, valores e datas precisam fazer sentido.
 * Valida os dados do leilao. Usada no cadastro e na edicao.
 * Lanca ErroDeValidacao (400) no primeiro problema encontrado.
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

  // Datas podem ser comparadas com <, >, <= (o JS compara os milissegundos).
  if (fim <= inicio) {
    throw new ErroDeValidacao('Data de fim deve ser posterior a data de inicio.');
  }
  // Subtrair duas datas da a diferenca em MILISSEGUNDOS.
  // 60000 ms = 60 s = 1 minuto.
  const duracaoMinutos = (fim - inicio) / 60000;
  if (duracaoMinutos < DURACAO_MINIMA_MINUTOS) {
    throw new ErroDeValidacao(
      `Leilao deve durar ao menos ${DURACAO_MINIMA_MINUTOS} minutos.`
    );
  }
}

/** Regra 2: nao da para agendar leilao no passado (400). */
function validarDataFutura(dataInicio) {
  // new Date() sem argumentos = o momento atual.
  if (paraData(dataInicio) <= new Date()) {
    throw new ErroDeValidacao('Data de inicio deve estar no futuro.');
  }
}

/** Lista leiloes, com filtros opcionais { status, leiloeiroId }. */
async function listar(filtros) {
  return leilaoRepository.listar(filtros);
}

/** Busca um leilao; 404 se nao existir. Reaproveitada por varias funcoes abaixo. */
async function buscarPorId(id) {
  const leilao = await leilaoRepository.buscarPorId(id);
  if (!leilao) {
    throw new ErroDeValidacao('Leilao nao encontrado.', 404);
  }
  return leilao;
}

/**
 * Regra 3: o leiloeiro tem que existir no usuarios-service.
 * Pergunta ao usuarios-service se o leiloeiro existe (comunicacao REST).
 * Traducao dos resultados do client em respostas HTTP:
 *   - servico fora do ar (ServicoIndisponivel) -> 503;
 *   - leiloeiro nao existe (null)              -> 404;
 *   - existe                                   -> segue o cadastro.
 */
async function garantirLeiloeiroExiste(leiloeiroId) {
  if (!inteiroPositivo(leiloeiroId)) {
    throw new ErroDeValidacao('Informe o leiloeiroId responsavel pelo leilao.');
  }

  // `let` sem valor inicial: sera preenchida dentro do try.
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
    // Erro desconhecido: repassa como esta (vira 500 no controller).
    throw err;
  }

  // sem USUARIOS_SERVICE_URL (servico rodando sozinho) nao tem como validar
  // === compara valor E tipo (null === null e verdadeiro; undefined === null nao).
  if (leiloeiro === null && process.env.USUARIOS_SERVICE_URL) {
    throw new ErroDeValidacao('Leiloeiro nao encontrado no servico de usuarios.', 404);
  }
  return leiloeiro;
}

/**
 * Regra 4: o mesmo leiloeiro nao pode ter dois leiloes no mesmo horario.
 * Busca os leiloes ATIVOS (AGENDADO/ABERTO) do leiloeiro e verifica se algum
 * se sobrepoe ao periodo informado. 409 Conflict se houver choque de agenda.
 * @param ignorarId  na edicao, o proprio leilao nao conta como conflito
 */
async function garantirAgendaLivre(leiloeiroId, dataInicio, dataFim, ignorarId = null) {
  const ativos = await leilaoRepository.listarAtivosPorLeiloeiro(leiloeiroId, ignorarId);
  // find() percorre a lista e devolve o PRIMEIRO item para o qual a funcao
  // retornar true (ou undefined se nenhum servir).
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

/**
 * Regra 7: so um LEILOEIRO cadastra leilao, e so em nome proprio.
 * AUTORIZACAO do cadastro: decide EM NOME DE QUAL leiloeiro o leilao sera criado.
 *
 * Autenticacao x autorizacao:
 *   - autenticacao = "quem e voce?"  -> o Kong confere o token JWT;
 *   - autorizacao  = "voce PODE fazer isto?" -> esta funcao.
 *
 *   - sem usuario logado                             -> 401
 *   - papel diferente de LEILOEIRO                   -> 403
 *   - token sem perfilId                             -> 403
 *   - leiloeiroId informado diferente do proprio     -> 403
 *
 * @param usuario              payload do token (req.usuarioAutenticado)
 * @param leiloeiroIdInformado leiloeiroId do corpo (opcional)
 * @returns o id do leiloeiro logado (perfilId do token)
 */
function autorizarLeiloeiro(usuario, leiloeiroIdInformado) {
  if (!usuario) {
    throw new ErroDeValidacao('Faca login para gerenciar leiloes.', 401);
  }
  if (usuario.papel !== 'LEILOEIRO') {
    throw new ErroDeValidacao('Apenas leiloeiros podem cadastrar leiloes.', 403);
  }
  if (!inteiroPositivo(usuario.perfilId)) {
    throw new ErroDeValidacao(
      'Seu usuario nao tem perfil de leiloeiro vinculado. Faca login novamente.',
      403
    );
  }
  // O corpo pode trazer o leiloeiroId (compatibilidade), mas ele precisa ser o proprio.
  // `!= null` cobre undefined e null ao mesmo tempo; '' (texto vazio) tambem e ignorado.
  if (leiloeiroIdInformado != null && leiloeiroIdInformado !== ''
      && Number(leiloeiroIdInformado) !== Number(usuario.perfilId)) {
    throw new ErroDeValidacao('Voce so pode cadastrar leiloes em seu proprio nome.', 403);
  }
  return Number(usuario.perfilId);
}

/**
 * Regra 7 (tambem): editar, mudar status e remover, so o DONO do leilao.
 * Confere se quem esta logado e o leiloeiro responsavel pelo leilao.
 * Chamada DEPOIS de buscarPorId: assim, leilao inexistente continua 404.
 */
function garantirDono(leilao, usuario) {
  if (!usuario) {
    throw new ErroDeValidacao('Faca login para gerenciar leiloes.', 401);
  }
  if (usuario.papel !== 'LEILOEIRO' || Number(leilao.leiloeiro_id) !== Number(usuario.perfilId)) {
    throw new ErroDeValidacao('Apenas o leiloeiro responsavel pode alterar este leilao.', 403);
  }
}

/**
 * Cadastra um leilao aplicando as regras, nesta ordem:
 * autorizacao, validacoes baratas (sem rede/banco) e depois as que consultam
 * outro servico e o banco. Se tudo passar, grava com status AGENDADO.
 * @param usuario  quem esta logado (payload do token)
 */
async function cadastrar(dados, usuario) {
  // O leiloeiro do leilao e SEMPRE quem esta logado.
  const leiloeiroId = autorizarLeiloeiro(usuario, dados.leiloeiroId);
  const {
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

  // Normaliza os dados antes de gravar: converte textos em numeros/datas e
  // remove espacos extras do titulo.
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
 * Regra 6: so edita enquanto esta AGENDADO (depois de aberto ja tem lance).
 * Edita um leilao. Como o cliente pode mandar so ALGUNS campos, montamos o
 * leilao "como ficaria" (campo novo ?? campo atual) e validamos o conjunto.
 */
async function atualizar(id, dados, usuario) {
  const leilao = await buscarPorId(id);
  garantirDono(leilao, usuario);

  if (leilao.status !== 'AGENDADO') {
    throw new ErroDeValidacao(
      `Leilao com status ${leilao.status} nao pode mais ser editado.`,
      409
    );
  }

  // ?? usa o valor da direita quando o da esquerda for null/undefined.
  // Repare na diferenca de nomes: o banco usa snake_case (quantidade_bois)
  // e o JavaScript usa camelCase (quantidadeBois).
  const atualizado = {
    titulo: dados.titulo ?? leilao.titulo,
    quantidadeBois: dados.quantidadeBois ?? leilao.quantidade_bois,
    lanceInicial: dados.lanceInicial ?? leilao.lance_inicial,
    incrementoMinimo: dados.incrementoMinimo ?? leilao.incremento_minimo,
    dataInicio: dados.dataInicio ?? leilao.data_inicio,
    dataFim: dados.dataFim ?? leilao.data_fim,
  };

  validarDados(atualizado);

  // So confere a agenda se alguma data mudou (passando o proprio id para ignorar).
  if (dados.dataInicio || dados.dataFim) {
    await garantirAgendaLivre(
      leilao.leiloeiro_id,
      atualizado.dataInicio,
      atualizado.dataFim,
      id
    );
  }

  // ...dados copia todos os campos enviados; as datas sao convertidas em Date
  // (ou null, para o COALESCE do SQL manter o valor atual).
  return leilaoRepository.atualizar(id, {
    ...dados,
    dataInicio: dados.dataInicio ? paraData(dados.dataInicio) : null,
    dataFim: dados.dataFim ? paraData(dados.dataFim) : null,
  });
}

/**
 * Regra 5: AGENDADO -> ABERTO -> ENCERRADO; agendado ou aberto pode ser cancelado.
 * Muda o status do leilao consultando a maquina de estados
 * (TRANSICOES_PERMITIDAS em utils/validadores.js).
 * 400 se o status nao existir; 409 se a transicao nao for permitida
 * (ex.: tentar reabrir um leilao ENCERRADO).
 *
 * Ao CANCELAR, tambem libera o credito reservado no leilao (Regra 8).
 */
async function alterarStatus(id, novoStatus, usuario) {
  if (!statusValido(novoStatus)) {
    throw new ErroDeValidacao('Status invalido. Use AGENDADO, ABERTO, ENCERRADO ou CANCELADO.');
  }

  const leilao = await buscarPorId(id);
  garantirDono(leilao, usuario);

  // Cancelar de novo um leilao ja CANCELADO nao muda o status: serve para
  // TENTAR DE NOVO a liberacao do credito, caso ela tenha falhado antes.
  if (novoStatus === 'CANCELADO' && leilao.status === 'CANCELADO') {
    await liberarCreditoDoLeilao(id);
    return leilao;
  }

  if (!transicaoPermitida(leilao.status, novoStatus)) {
    throw new ErroDeValidacao(
      `Transicao de status invalida: ${leilao.status} -> ${novoStatus}.`,
      409
    );
  }

  const atualizado = await leilaoRepository.atualizarStatus(id, novoStatus);

  // A ORDEM importa: primeiro o status vira CANCELADO (a partir daqui o leilao
  // nao aceita mais lances), depois o credito e liberado.
  if (novoStatus === 'CANCELADO') {
    await liberarCreditoDoLeilao(id);
  }
  return atualizado;
}

/**
 * Regra 8: leilao CANCELADO devolve o credito reservado pelos licitantes.
 * Pede ao usuarios-service para liberar todas as reservas de credito do
 * leilao. Sem isso, o credito de quem estava ganhando ficaria bloqueado para
 * sempre, ja que ninguem mais pode vencer um leilao cancelado.
 *
 * Se o usuarios-service estiver fora do ar, o leilao CONTINUA cancelado e
 * respondemos 503 pedindo para repetir o cancelamento - a liberacao e
 * idempotente, entao repetir e seguro.
 */
async function liberarCreditoDoLeilao(leilaoId) {
  try {
    await usuariosClient.liberarReservasDoLeilao(leilaoId);
  } catch (err) {
    if (err instanceof usuariosClient.ServicoIndisponivel) {
      throw new ErroDeValidacao(
        'Leilao cancelado, mas o credito reservado nao pode ser liberado agora ' +
          '(servico de usuarios indisponivel). Repita o cancelamento para tentar de novo.',
        503
      );
    }
    throw err;
  }
}

// Atalhos: cada um reaproveita alterarStatus com um status fixo.
// (Reaproveitar em vez de copiar codigo evita que as regras fiquem diferentes.)
async function abrir(id, usuario) {
  return alterarStatus(id, 'ABERTO', usuario);
}

async function encerrar(id, usuario) {
  return alterarStatus(id, 'ENCERRADO', usuario);
}

async function cancelar(id, usuario) {
  return alterarStatus(id, 'CANCELADO', usuario);
}

/**
 * Consultado pelo lances-service no passo 1 da Saga.
 * Responde se o leilao esta aceitando lances AGORA: precisa estar ABERTO e
 * o momento atual precisa estar entre data_inicio e data_fim.
 * Tambem devolve lanceInicial e incrementoMinimo, que o lances-service usa
 * para validar o valor do lance.
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
    // O Postgres devolve NUMERIC como texto ("5000.00"); Number converte.
    lanceInicial: Number(leilao.lance_inicial),
    incrementoMinimo: Number(leilao.incremento_minimo),
    dataInicio: leilao.data_inicio,
    dataFim: leilao.data_fim,
  };
}

/** Regra 6 (tambem): so remove enquanto AGENDADO; depois disso, tem que cancelar (409). */
async function remover(id, usuario) {
  const leilao = await buscarPorId(id);
  garantirDono(leilao, usuario);
  if (leilao.status !== 'AGENDADO') {
    throw new ErroDeValidacao(
      'Somente leiloes ainda AGENDADOS podem ser removidos; use o cancelamento.',
      409
    );
  }
  return leilaoRepository.remover(id);
}

// As funcoes de validacao tambem sao exportadas para serem testadas isoladamente.
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
  autorizarLeiloeiro,
  garantirDono,
  garantirLeiloeiroExiste,
  garantirAgendaLivre,
};
