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

// Regra de negocio 1: leilaoId, licitanteId e valor obrigatorios e validos.
// Regra de negocio 2: valor estritamente maior que zero.
// Regra de negocio 3: primeiro lance >= lance inicial; depois, >= maior lance + incremento.
// Regra de negocio 4: mesmo licitante nao pode cobrir seu proprio lance atual.
// Regra de negocio 5: o licitante precisa ter credito pro valor do lance.
// As regras 3 a 5 dependem do leiloes e do usuarios, por isso o registro passa pela saga.
/**
 * Registra um lance: valida localmente e entrega para a Saga executar.
 * Os valores sao convertidos para Number aqui, uma unica vez, para a Saga
 * trabalhar sempre com numeros.
 * @param simularFalha  nome de um passo para falhar de proposito (demonstracao)
 */
async function registrarLance({ leilaoId, licitanteId, valor, simularFalha = null }) {
  validarDados({ leilaoId, licitanteId, valor });

  return registrarLanceSaga.executar({
    leilaoId: Number(leilaoId),
    licitanteId: Number(licitanteId),
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
};
