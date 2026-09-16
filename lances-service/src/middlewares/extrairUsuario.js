const jwt = require('jsonwebtoken');

/**
 * A validacao criptografica do token ja e feita pelo Kong (plugin JWT) na
 * borda da arquitetura antes da requisicao chegar aqui. Este middleware
 * apenas decodifica o token (sem re-verificar assinatura) para disponibilizar
 * os dados do usuario autenticado no restante da aplicacao.
 */
function extrairUsuario(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      req.usuarioAutenticado = jwt.decode(token);
    } catch (err) {
      req.usuarioAutenticado = null;
    }
  }
  next();
}

module.exports = extrairUsuario;
