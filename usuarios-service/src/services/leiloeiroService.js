// =============================================================================
// services/leiloeiroService.js  -  REGRAS DE NEGOCIO do leiloeiro
// -----------------------------------------------------------------------------
// O service e o "cerebro" da funcionalidade: decide o que e permitido.
// Ele nao sabe nada de HTTP (isso e do controller) nem de SQL (isso e do
// repository). Por isso da para testa-lo sozinho, com o repository "falso"
// (mock) - veja tests/leiloeiroService.test.js.
//
// Quem chama: controllers/leiloeiroController.js
// Quem e chamado: repositories/leiloeiroRepository.js, utils/validadores.js
// =============================================================================

const leiloeiroRepository = require('../repositories/leiloeiroRepository');
const { ErroDeValidacao } = require('../utils/erros');
const { emailValido } = require('../utils/validadores');
const { garantirProprioPerfil } = require('../utils/autorizacao');

// Formato do registro na junta comercial:
//   [A-Za-z]{2,8}  -> de 2 a 8 letras (o orgao, ex.: JUCESC)
//   -              -> um traco
//   \d{4,8}        -> de 4 a 8 digitos (o numero, ex.: 000123)
//   ^ e $          -> o texto inteiro precisa seguir o molde (do inicio ao fim)
const REGISTRO_REGEX = /^[A-Za-z]{2,8}-\d{4,8}$/; // ex: JUCESC-000123

/**
 * Valida os campos obrigatorios do leiloeiro. Lanca ErroDeValidacao (400)
 * no primeiro problema encontrado; se tudo estiver certo, nao faz nada.
 */
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

/** Lista todos os leiloeiros (sem regra extra: so repassa ao repository). */
async function listar() {
  return leiloeiroRepository.listar();
}

/**
 * Busca um leiloeiro; se nao existir, lanca 404.
 * Tambem e reaproveitada por atualizar/remover para garantir que o registro existe.
 * O leiloes-service chama GET /leiloeiros/:id (que cai aqui) para validar o
 * leiloeiro antes de cadastrar um leilao.
 */
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
/**
 * Cadastra um leiloeiro depois de validar os dados e checar duplicidade.
 * 409 Conflict = ja existe alguem com este e-mail ou registro.
 */
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

// Regra de negocio 4: so o proprio leiloeiro altera ou remove o seu cadastro.
/**
 * Atualiza nome/telefone. Primeiro garante que o leiloeiro existe (404 se nao)
 * e que quem esta logado e o dono do cadastro (403 se nao).
 * `dados.nome && ...`: so valida o nome SE ele foi enviado.
 * @param usuario  quem esta logado (payload do token)
 */
async function atualizar(id, dados, usuario) {
  await buscarPorId(id);
  garantirProprioPerfil(usuario, 'LEILOEIRO', id);
  if (dados.nome && dados.nome.trim().length < 3) {
    throw new ErroDeValidacao('Nome deve ter ao menos 3 caracteres.');
  }
  return leiloeiroRepository.atualizar(id, dados);
}

/** Remove o leiloeiro (404 se nao existir; 403 se nao for o proprio). */
async function remover(id, usuario) {
  await buscarPorId(id);
  garantirProprioPerfil(usuario, 'LEILOEIRO', id);
  return leiloeiroRepository.remover(id);
}

module.exports = { listar, buscarPorId, cadastrar, atualizar, remover, validarDados };
