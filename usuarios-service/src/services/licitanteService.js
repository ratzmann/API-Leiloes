// =============================================================================
// services/licitanteService.js  -  REGRAS DE NEGOCIO do licitante
// -----------------------------------------------------------------------------
// Licitante = a pessoa que da lances. Alem dos dados cadastrais, tem um
// LIMITE DE CREDITO, que define quanto ela pode comprometer em lances
// (o controle das reservas fica no creditoService).
//
// Quem chama: controllers/licitanteController.js
// Quem e chamado: repositories/licitanteRepository.js, utils/validadores.js
// =============================================================================

const licitanteRepository = require('../repositories/licitanteRepository');
const { ErroDeValidacao } = require('../utils/erros');
const { emailValido, cpfValido } = require('../utils/validadores');

/**
 * Valida os dados do licitante. Lanca ErroDeValidacao (400) no primeiro
 * problema. `limiteCredito !== undefined`: o limite e opcional, entao so
 * validamos se ele foi informado.
 */
function validarDados({ nome, email, cpf, limiteCredito }) {
  if (!nome || nome.trim().length < 3) {
    throw new ErroDeValidacao('Nome deve ter ao menos 3 caracteres.');
  }
  if (!emailValido(email)) {
    throw new ErroDeValidacao('E-mail invalido.');
  }
  if (!cpfValido(cpf)) {
    throw new ErroDeValidacao('CPF invalido.');
  }
  if (limiteCredito !== undefined && Number(limiteCredito) < 0) {
    throw new ErroDeValidacao('Limite de credito nao pode ser negativo.');
  }
}

/** Lista todos os licitantes. */
async function listar() {
  return licitanteRepository.listar();
}

/** Busca um licitante; 404 se nao existir. Reaproveitada por atualizar/remover. */
async function buscarPorId(id) {
  const licitante = await licitanteRepository.buscarPorId(id);
  if (!licitante) {
    throw new ErroDeValidacao('Licitante nao encontrado.', 404);
  }
  return licitante;
}

// Regra de negocio 1: CPF valido (digitos verificadores) e unico.
// Regra de negocio 2: e-mail unico.
// Regra de negocio 3: limite de credito nunca pode ser negativo.
/**
 * Cadastra um licitante. O CPF e "limpo" (so digitos) antes de validar e
 * de gravar, para que "529.982.247-25" e "52998224725" sejam o MESMO CPF
 * na checagem de duplicidade.
 */
async function cadastrar({ usuarioId, nome, email, cpf, telefone, limiteCredito }) {
  // (cpf || '') evita erro se o cpf vier vazio: usa texto vazio no lugar.
  const cpfLimpo = (cpf || '').replace(/\D/g, '');
  validarDados({ nome, email, cpf: cpfLimpo, limiteCredito });

  const emailExistente = await licitanteRepository.buscarPorEmail(email);
  if (emailExistente) {
    throw new ErroDeValidacao('Ja existe um licitante cadastrado com este e-mail.', 409);
  }

  const cpfExistente = await licitanteRepository.buscarPorCpf(cpfLimpo);
  if (cpfExistente) {
    throw new ErroDeValidacao('Ja existe um licitante cadastrado com este CPF.', 409);
  }

  return licitanteRepository.criar({
    usuarioId,
    nome,
    email,
    // "cpf: cpfLimpo" = grava o campo cpf com o valor de cpfLimpo.
    cpf: cpfLimpo,
    telefone,
    limiteCredito,
  });
}

/**
 * Atualiza nome, telefone e/ou limite. Cada campo so e validado se foi enviado.
 * Obs.: reduzir o limite abaixo do que ja esta reservado nao e bloqueado aqui.
 */
async function atualizar(id, dados) {
  await buscarPorId(id);
  if (dados.nome && dados.nome.trim().length < 3) {
    throw new ErroDeValidacao('Nome deve ter ao menos 3 caracteres.');
  }
  if (dados.limiteCredito !== undefined && Number(dados.limiteCredito) < 0) {
    throw new ErroDeValidacao('Limite de credito nao pode ser negativo.');
  }
  return licitanteRepository.atualizar(id, dados);
}

/** Remove o licitante (as reservas dele somem junto: ON DELETE CASCADE). */
async function remover(id) {
  await buscarPorId(id);
  return licitanteRepository.remover(id);
}

module.exports = { listar, buscarPorId, cadastrar, atualizar, remover, validarDados };
