// =============================================================================
// middlewares/extrairUsuario.js  -  descobre QUEM esta fazendo a requisicao
// -----------------------------------------------------------------------------
// MIDDLEWARE e uma funcao que o Express executa ANTES da rota. Ela recebe
// (req, res, next) e, ao terminar, chama next() para passar a requisicao
// adiante. Se nao chamar next(), a requisicao "trava" ali.
//
// Este middleware aparece (com pequenas diferencas) em usuarios, leiloes e
// lances: cada microsservico carrega sua propria copia.
// =============================================================================

const jwt = require('jsonwebtoken');

/**
 * A validacao criptografica do token ja e feita pelo Kong (plugin JWT) na
 * borda da arquitetura antes da requisicao chegar aqui. Este middleware
 * apenas decodifica o token (sem re-verificar assinatura) para disponibilizar
 * os dados do usuario autenticado no restante da aplicacao (ex: auditoria).
 * Nao bloqueia a requisicao caso o header esteja ausente, pois este servico
 * tambem recebe chamadas internas do auth-service (rede interna do Docker).
 *
 * Resultado: depois dele, req.usuarioAutenticado tem o payload do token
 * (ex.: { sub: 1, email: '...', papel: 'LICITANTE', iss, exp }) ou fica vazio.
 */
function extrairUsuario(req, res, next) {
  // Headers sao "metadados" da requisicao. O token vem no header
  // Authorization no formato "Bearer <token>".
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // slice(7) corta os 7 primeiros caracteres ("Bearer "), sobrando o token.
    const token = authHeader.slice(7);
    try {
      // decode so LE o conteudo; quem garante que o token e autentico e o Kong.
      req.usuarioAutenticado = jwt.decode(token);
    } catch (err) {
      req.usuarioAutenticado = null;
    }
  }
  // Passa a vez para o proximo middleware/rota.
  next();
}

module.exports = extrairUsuario;
