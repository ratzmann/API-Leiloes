const lanceRepository = require('../repositories/lanceRepository');
const sagaRepository = require('../repositories/sagaRepository');
const registrarLanceSaga = require('../sagas/registrarLanceSaga');
const { ErroDeValidacao } = require('../utils/erros');
const { idValido, valorValido } = require('../utils/validadores');

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

async function listar() {
  return lanceRepository.listar();
}

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

async function buscarPorLeilao(leilaoId) {
  if (!idValido(leilaoId)) {
    throw new ErroDeValidacao('leilaoId invalido.');
  }
  return lanceRepository.buscarPorLeilao(leilaoId);
}

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
async function registrarLance({ leilaoId, licitanteId, valor, simularFalha = null }) {
  validarDados({ leilaoId, licitanteId, valor });

  return registrarLanceSaga.executar({
    leilaoId: Number(leilaoId),
    licitanteId: Number(licitanteId),
    valor: Number(valor),
    simularFalha,
  });
}

async function listarSagas() {
  return sagaRepository.listar();
}

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
