const leiloeiroRepository = require('../repositories/leiloeiroRepository');
const { ErroDeValidacao } = require('../utils/erros');
const { emailValido } = require('../utils/validadores');

const REGISTRO_REGEX = /^[A-Za-z]{2,8}-\d{4,8}$/; // ex: JUCESC-000123

function validarDados({ nome, email, registroProfissional }) {
  if (!nome || nome.trim().length < 3) {
    throw new ErroDeValidacao('Nome deve ter ao menos 3 caracteres.');
  }
  if (!emailValido(email)) {
    throw new ErroDeValidacao('E-mail invalido.');
  }
  if (!registroProfissional || !REGISTRO_REGEX.test(registroProfissional)) {
    throw new ErroDeValidacao(
      'Registro profissional invalido. Use o formato ORGAO-NUMERO, ex: JUCESC-000123.'
    );
  }
}

async function listar() {
  return leiloeiroRepository.listar();
}

async function buscarPorId(id) {
  const leiloeiro = await leiloeiroRepository.buscarPorId(id);
  if (!leiloeiro) {
    throw new ErroDeValidacao('Leiloeiro nao encontrado.', 404);
  }
  return leiloeiro;
}

// Regra de negocio 1: e-mail e registro profissional sao unicos.
// Regra de negocio 2: registro profissional segue formato de orgao regulador.
// Regra de negocio 3: nome minimo de 3 caracteres.
async function cadastrar({ usuarioId, nome, email, registroProfissional, telefone }) {
  validarDados({ nome, email, registroProfissional });

  const emailExistente = await leiloeiroRepository.buscarPorEmail(email);
  if (emailExistente) {
    throw new ErroDeValidacao('Ja existe um leiloeiro cadastrado com este e-mail.', 409);
  }

  const registroExistente = await leiloeiroRepository.buscarPorRegistroProfissional(
    registroProfissional
  );
  if (registroExistente) {
    throw new ErroDeValidacao('Ja existe um leiloeiro cadastrado com este registro profissional.', 409);
  }

  return leiloeiroRepository.criar({ usuarioId, nome, email, registroProfissional, telefone });
}

async function atualizar(id, dados) {
  await buscarPorId(id);
  if (dados.nome && dados.nome.trim().length < 3) {
    throw new ErroDeValidacao('Nome deve ter ao menos 3 caracteres.');
  }
  return leiloeiroRepository.atualizar(id, dados);
}

async function remover(id) {
  await buscarPorId(id);
  return leiloeiroRepository.remover(id);
}

module.exports = { listar, buscarPorId, cadastrar, atualizar, remover, validarDados };
