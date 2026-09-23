// =============================================================================
// utils/autorizacao.js  -  "voce PODE mexer neste cadastro?"
// -----------------------------------------------------------------------------
// Autenticacao x autorizacao:
//   - autenticacao = "quem e voce?"  -> o Kong confere o token JWT;
//   - autorizacao  = "voce PODE fazer isto?" -> esta funcao.
//
// Regra: um cadastro (leiloeiro ou licitante) so pode ser alterado ou removido
// pelo PROPRIO dono. O dono e identificado pelo token:
//   papel    -> LEILOEIRO ou LICITANTE
//   perfilId -> o id do cadastro dele nesta tabela (leiloeiros ou licitantes)
//
// Quem chama: services/leiloeiroService.js e services/licitanteService.js
// =============================================================================

const { ErroDeValidacao } = require('./erros');

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
  if (usuario.papel !== papelEsperado || Number(usuario.perfilId) !== Number(perfilId)) {
    throw new ErroDeValidacao('Voce so pode alterar o seu proprio cadastro.', 403);
  }
}

module.exports = { garantirProprioPerfil };
