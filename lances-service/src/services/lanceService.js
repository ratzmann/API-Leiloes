// =============================================================================
// services/lanceService.js  -  REGRAS DE NEGOCIO de lances (porta de entrada)
// -----------------------------------------------------------------------------
// Este service faz as validacoes "locais" (que nao dependem de ninguem) e,
// para registrar um lance, DELEGA para a Saga (sagas/registrarLanceSaga.js),
// porque as demais regras dependem de dados que estao em outros servicos.
//
// Quem chama: controllers/lanceController.js
// Quem e chamado: repositories/lanceRepository.js, repositories/sagaRepository.js,
//                 sagas/registrarLanceSaga.js, utils/validadores.js
// =============================================================================

const lanceRepository = require('../repositories/lanceRepository');
const sagaRepository = require('../repositories/sagaRepository');
const registrarLanceSaga = require('../sagas/registrarLanceSaga');
const { ErroDeValidacao } = require('../utils/erros');
const { idValido, valorValido } = require('../utils/validadores');

/**
 * Regras 1 e 2: ids inteiros positivos e valor maior que zero.
 * Sao conferidas ANTES de iniciar a Saga: se o dado for invalido, nem
 * chegamos a criar uma saga ou chamar outro servico (400 Bad Request).
 */
function validarDados({ leilaoId, licitanteId, valor }) {
  if (!idValido(leilaoId)) {
    throw new ErroDeValidacao('leilaoId deve ser um numero inteiro positivo.');
  }
  if (!idValido(licitanteId)) {
    throw new ErroDeValidacao('licitanteId deve ser um numero inteiro positivo.');
  }
  if (!valorValido(valor)) {
    throw new ErroDeValidacao('Valor do lance deve ser um numero maior que zero.');
  }
}

/** Todos os lances. */
async function listar() {
  return lanceRepository.listar();
}

/** Um lance pelo id: 400 se o id for invalido, 404 se nao existir. */
async function buscarPorId(id) {
  if (!idValido(id)) {
    throw new ErroDeValidacao('ID invalido.');
  }
  const lance = await lanceRepository.buscarPorId(id);
  if (!lance) {
    throw new ErroDeValidacao('Lance nao encontrado.', 404);
  }
  return lance;
}

/** Lances de um leilao (lista vazia se nao houver nenhum). */
async function buscarPorLeilao(leilaoId) {
  if (!idValido(leilaoId)) {
    throw new ErroDeValidacao('leilaoId invalido.');
  }
  return lanceRepository.buscarPorLeilao(leilaoId);
}

/** Maior lance do leilao; 404 se o leilao ainda nao recebeu lances. */
async function buscarMaiorPorLeilao(leilaoId) {
  if (!idValido(leilaoId)) {
    throw new ErroDeValidacao('leilaoId invalido.');
  }
  const maior = await lanceRepository.buscarMaiorPorLeilao(leilaoId);
  if (!maior) {
    throw new ErroDeValidacao('Nenhum lance encontrado para este leilao.', 404);
  }
  return maior;
}

/**
 * AUTORIZACAO: decide EM NOME DE QUEM o lance sera dado.
 *
 * Autenticacao x autorizacao:
 *   - autenticacao = "quem e voce?"  -> o Kong confere o token JWT;
 *   - autorizacao  = "voce PODE fazer isto?" -> esta funcao.
 *
 * Regras:
 *   - sem usuario logado                              -> 401
 *   - papel diferente de LICITANTE (ex.: leiloeiro)   -> 403
 *   - token sem perfilId (perfil nao criado/token antigo) -> 403
 *   - licitanteId informado diferente do proprio      -> 403 (ninguem da
 *     lance em nome de outra pessoa nem gasta o credito dela)
 *
 * @param usuario              payload do token (req.usuarioAutenticado)
 * @param licitanteIdInformado licitanteId do corpo (opcional)
 * @returns o id do licitante logado (perfilId do token)
 */
function autorizarLicitante(usuario, licitanteIdInformado) {
  if (!usuario) {
    throw new ErroDeValidacao('Faca login para dar lances.', 401);
  }
  if (usuario.papel !== 'LICITANTE') {
    throw new ErroDeValidacao('Apenas licitantes podem dar lances.', 403);
  }
  if (!idValido(usuario.perfilId)) {
    throw new ErroDeValidacao(
      'Seu usuario nao tem perfil de licitante vinculado. Faca login novamente.',
      403
    );
  }
  // O corpo pode trazer o licitanteId (compatibilidade), mas ele precisa ser o proprio.
  // `!= null` cobre undefined e null ao mesmo tempo; '' (texto vazio) tambem e ignorado.
  if (licitanteIdInformado != null && licitanteIdInformado !== ''
      && Number(licitanteIdInformado) !== Number(usuario.perfilId)) {
    throw new ErroDeValidacao('Voce so pode dar lances em seu proprio nome.', 403);
  }
  return Number(usuario.perfilId);
}

// Regras de negocio do lance (mesma numeracao do README):
//   1. leilaoId, licitanteId e valor obrigatorios e validos      -> validarDados
//   2. valor estritamente maior que zero                         -> validarDados
//   3. o leilao existe e esta aceitando lances                   -> Saga, passo 1
//   4. primeiro lance >= lance inicial; depois >= maior + incremento -> regrasDoLance
//   5. ninguem cobre o proprio lance atual                       -> regrasDoLance
//   6. o licitante precisa ter credito para o valor do lance     -> Saga, passo 2
//   7. so um LICITANTE logado da lance, e em nome proprio        -> autorizarLicitante
// As regras 3 a 6 dependem do leiloes e do usuarios, por isso o registro passa pela saga.
/**
 * Registra um lance: autoriza, valida localmente e entrega para a Saga.
 * Os valores sao convertidos para Number aqui, uma unica vez, para a Saga
 * trabalhar sempre com numeros.
 * @param usuario       quem esta logado (payload do token)
 * @param simularFalha  nome de um passo para falhar de proposito (demonstracao)
 */
async function registrarLance({ leilaoId, licitanteId: licitanteIdInformado, valor, usuario, simularFalha = null }) {
  // Primeiro a autorizacao: o licitante do lance e SEMPRE quem esta logado.
  const licitanteId = autorizarLicitante(usuario, licitanteIdInformado);
  validarDados({ leilaoId, licitanteId, valor });

  return registrarLanceSaga.executar({
    leilaoId: Number(leilaoId),
    licitanteId,
    valor: Number(valor),
    simularFalha,
  });
}

/** Ultimas sagas executadas (auditoria). */
async function listarSagas() {
  return sagaRepository.listar();
}

/** Uma saga com todos os passos; 404 se nao existir. */
async function buscarSaga(id) {
  if (!idValido(id)) {
    throw new ErroDeValidacao('ID de saga invalido.');
  }
  const saga = await sagaRepository.buscarPorId(Number(id));
  if (!saga) {
    throw new ErroDeValidacao('Saga nao encontrada.', 404);
  }
  return saga;
}

/** Reexecuta o passo 4 de uma saga CONCLUIDA_COM_PENDENCIA. */
async function reprocessarSaga(id) {
  if (!idValido(id)) {
    throw new ErroDeValidacao('ID de saga invalido.');
  }
  return registrarLanceSaga.reprocessar(Number(id));
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorLeilao,
  buscarMaiorPorLeilao,
  registrarLance,
  listarSagas,
  buscarSaga,
  reprocessarSaga,
  validarDados,
  autorizarLicitante,
};
