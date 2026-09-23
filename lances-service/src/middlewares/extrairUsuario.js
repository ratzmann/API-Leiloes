// =============================================================================
// middlewares/extrairUsuario.js  -  descobre QUEM esta fazendo a requisicao
// -----------------------------------------------------------------------------
// Middleware = funcao (req, res, next) executada antes das rotas.
// Aqui ele e especialmente util: se o cliente nao mandar o licitanteId no
// corpo do lance, o controller tenta usar os dados do token (ver lanceController).
// (Copia parecida existe em usuarios e leiloes: cada servico tem a sua.)
// =============================================================================

const jwt = require('jsonwebtoken');

/**
 * A validacao criptografica do token ja e feita pelo Kong (plugin JWT) na
 * borda da arquitetura antes da requisicao chegar aqui. Este middleware
 * apenas decodifica o token (sem re-verificar assinatura) para disponibilizar
 * os dados do usuario autenticado no restante da aplicacao.
 */
function extrairUsuario(req, res, next) {
  // Header esperado: "Authorization: Bearer <token>".
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Tira o prefixo "Bearer " (7 caracteres).
    const token = authHeader.slice(7);
    try {
      // So le o payload; a assinatura ja foi conferida pelo Kong.
      req.usuarioAutenticado = jwt.decode(token);
    } catch (err) {
      req.usuarioAutenticado = null;
    }
  }
  // Continua para a rota.
  next();
}

module.exports = extrairUsuario;
