const jwt = require('jsonwebtoken');

// O Kong ja valida o token antes de chegar aqui, entao so decodifico
// pra saber quem esta logado. Sem token nao bloqueia, porque o lances-service
// chama esse servico direto pela rede interna.
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
