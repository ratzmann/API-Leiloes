// =============================================================================
// services/leiloeiroService.js  -  REGRAS DE NEGOCIO do leiloeiro
// -----------------------------------------------------------------------------
// O service e o "cerebro" da funcionalidade: decide o que e permitido.
// Ele nao sabe nada de HTTP (isso e do controller) nem de SQL (isso e do
// repository). Por isso da para testa-lo sozinho, com o repository "falso"
// (mock) - veja tests/leiloeiroService.test.js.
//
// Regras de negocio do leiloeiro (mesma numeracao do README):
//   1. nome (min. 3 letras), e-mail e registro profissional obrigatorios e validos -> validarDados
//   2. e-mail unico                                                           -> cadastrar
//   3. registro profissional unico e no formato ORGAO-NUMERO (ex.: JUCESC-000123) -> cadastrar
//   4. so o proprio leiloeiro altera ou remove o cadastro                     -> atualizar / remover
//   5. e-mail e telefone so aparecem para o proprio leiloeiro (LGPD)          -> listar / consultar
//
// Quem chama: controllers/leiloeiroController.js
// Quem e chamado: repositories/leiloeiroRepository.js, utils/validadores.js
// =============================================================================

const leiloeiroRepository = require('../repositories/leiloeiroRepository');
const { ErroDeValidacao } = require('../utils/erros');
const { emailValido } = require('../utils/validadores');
const { garantirProprioPerfil, visaoPara } = require('../utils/autorizacao');

// O que QUALQUER usuario logado pode ver de um leiloeiro. O registro
// profissional e publico por natureza (identifica o leiloeiro oficial).
// E-mail, telefone e usuario_id so aparecem para o proprio leiloeiro.
const CAMPOS_PUBLICOS = ['id', 'nome', 'registro_profissional', 'criado_em'];

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

/**
 * Regra 5. Lista todos os leiloeiros. Cada um aparece inteiro so para o
 * proprio leiloeiro; para os demais, so os CAMPOS_PUBLICOS (visaoPara).
 * @param usuario  quem esta logado (payload do token)
 */
async function listar(usuario) {
  const leiloeiros = await leiloeiroRepository.listar();
  return leiloeiros.map((leiloeiro) => visaoPara(leiloeiro, usuario, 'LEILOEIRO', CAMPOS_PUBLICOS));
}

/**
 * Regra 5. GET /leiloeiros/:id: busca um leiloeiro (404 se nao existir) e
 * aplica a visibilidade - dados completos so para o proprio leiloeiro.
 * O leiloes-service chama esta rota (sem token) para validar o leiloeiro antes
 * de cadastrar um leilao: ele so precisa saber se existe, entao a visao publica basta.
 */
async function consultar(id, usuario) {
  const leiloeiro = await buscarPorId(id);
  return visaoPara(leiloeiro, usuario, 'LEILOEIRO', CAMPOS_PUBLICOS);
}

/**
 * Busca um leiloeiro COMPLETO; se nao existir, lanca 404. Uso interno do
 * service (consultar, atualizar, remover) - nao aplica a visibilidade.
 */
async function buscarPorId(id) {
  const leiloeiro = await leiloeiroRepository.buscarPorId(id);
  if (!leiloeiro) {
    throw new ErroDeValidacao('Leiloeiro nao encontrado.', 404);
  }
  return leiloeiro;
}

/**
 * Regras 1 a 3. Cadastra um leiloeiro depois de validar os dados e
 * checar duplicidade.
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

/**
 * Regra 4: so o proprio leiloeiro altera ou remove o seu cadastro.
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

module.exports = { listar, consultar, buscarPorId, cadastrar, atualizar, remover, validarDados };
