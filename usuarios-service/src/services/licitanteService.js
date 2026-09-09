const licitanteRepository = require('../repositories/licitanteRepository');
const { ErroDeValidacao } = require('../utils/erros');
const { emailValido, cpfValido } = require('../utils/validadores');

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

async function listar() {
  return licitanteRepository.listar();
}

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
async function cadastrar({ usuarioId, nome, email, cpf, telefone, limiteCredito }) {
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
    cpf: cpfLimpo,
    telefone,
    limiteCredito,
  });
}

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

async function remover(id) {
  await buscarPorId(id);
  return licitanteRepository.remover(id);
}

module.exports = { listar, buscarPorId, cadastrar, atualizar, remover, validarDados };
