// =============================================================================
// utils/autorizacao.js  -  "voce PODE mexer neste cadastro?"
// -----------------------------------------------------------------------------
// Autenticacao x autorizacao:
//   - autenticacao = "quem e voce?"  -> o Kong confere o token JWT;
//   - autorizacao  = "voce PODE fazer isto?" -> esta funcao.
//
// Regras:
//   - um cadastro (leiloeiro ou licitante) so pode ser alterado ou removido
//     pelo PROPRIO dono;
//   - dados pessoais (CPF, e-mail, telefone, limite de credito) so aparecem
//     para o PROPRIO dono; os demais veem so os campos publicos (LGPD).
//
// O dono e identificado pelo token:
//   papel    -> LEILOEIRO ou LICITANTE
//   perfilId -> o id do cadastro dele nesta tabela (leiloeiros ou licitantes)
//
// Quem chama: services/leiloeiroService.js e services/licitanteService.js
// =============================================================================

const { ErroDeValidacao } = require('./erros');

/**
 * @returns true se quem esta logado e o dono do cadastro `perfilId`
 *          (mesmo papel e mesmo perfilId do token).
 */
function ehOProprio(usuario, papelEsperado, perfilId) {
  return Boolean(usuario) && usuario.papel === papelEsperado
    && Number(usuario.perfilId) === Number(perfilId);
}

/**
 * Lanca erro se `usuario` nao for o dono do cadastro `perfilId`.
 *   - sem usuario logado                          -> 401
 *   - papel diferente do esperado ou outro perfil -> 403
 *
 * @param usuario       payload do token (req.usuarioAutenticado)
 * @param papelEsperado 'LEILOEIRO' ou 'LICITANTE'
 * @param perfilId      id do cadastro que se quer alterar
 */
function garantirProprioPerfil(usuario, papelEsperado, perfilId) {
  if (!usuario) {
    throw new ErroDeValidacao('Faca login para alterar cadastros.', 401);
  }
  if (!ehOProprio(usuario, papelEsperado, perfilId)) {
    throw new ErroDeValidacao('Voce so pode alterar o seu proprio cadastro.', 403);
  }
}

/**
 * VISIBILIDADE (LGPD): devolve o cadastro inteiro para o proprio dono e, para
 * qualquer outra pessoa, so os `camposPublicos`.
 * Ex.: um licitante ve o proprio CPF, mas ve so id e nome dos outros.
 *
 * @param registro       linha do banco (leiloeiro ou licitante)
 * @param usuario        payload do token (pode ser vazio em chamadas internas)
 * @param papel          'LEILOEIRO' ou 'LICITANTE' (o tipo do cadastro)
 * @param camposPublicos lista de campos que qualquer um pode ver
 */
function visaoPara(registro, usuario, papel, camposPublicos) {
  if (ehOProprio(usuario, papel, registro.id)) return registro;
  // Object.fromEntries monta um objeto novo so com os pares [campo, valor] escolhidos.
  return Object.fromEntries(camposPublicos.map((campo) => [campo, registro[campo]]));
}

module.exports = { garantirProprioPerfil, visaoPara };
