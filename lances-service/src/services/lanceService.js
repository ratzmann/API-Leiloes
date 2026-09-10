const lanceRepository = require('../repositories/lanceRepository');
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
// Regra de negocio 3: novo lance deve ser superior ao maior lance atual do leilao.
// Regra de negocio 4: mesmo licitante nao pode cobrir seu proprio lance atual.
async function registrarLance({ leilaoId, licitanteId, valor }) {
  validarDados({ leilaoId, licitanteId, valor });

  const valorNum = Number(valor);
  const maiorLanceAtual = await lanceRepository.buscarMaiorPorLeilao(Number(leilaoId));

  if (maiorLanceAtual) {
    const maiorValor = Number(maiorLanceAtual.valor);

    if (Number(maiorLanceAtual.licitante_id) === Number(licitanteId)) {
      throw new ErroDeValidacao('Voce ja detem o maior lance atual para este leilao.');
    }

    if (valorNum <= maiorValor) {
      throw new ErroDeValidacao(
        `O lance deve ser estritamente maior que o lance atual de R$ ${maiorValor.toFixed(2)}.`
      );
    }
  }

  return lanceRepository.criar({
    leilaoId: Number(leilaoId),
    licitanteId: Number(licitanteId),
    valor: valorNum,
  });
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorLeilao,
  buscarMaiorPorLeilao,
  registrarLance,
  validarDados,
};
