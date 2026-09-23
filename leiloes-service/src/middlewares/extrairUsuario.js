// =============================================================================
// middlewares/extrairUsuario.js  -  descobre QUEM esta fazendo a requisicao
// -----------------------------------------------------------------------------
// Middleware = funcao (req, res, next) executada antes das rotas. Ao terminar,
// chama next() para a requisicao seguir adiante.
// Resultado: req.usuarioAutenticado recebe o conteudo (payload) do token JWT.
// (Existe uma copia parecida em usuarios e lances: cada servico tem a sua.)
// =============================================================================

const jwt = require('jsonwebtoken');

// O Kong ja valida o token antes de chegar aqui, entao so decodifico
// pra saber quem esta logado. Sem token nao bloqueia, porque o lances-service
// chama esse servico direto pela rede interna.
function extrairUsuario(req, res, next) {
  // Header esperado: "Authorization: Bearer <token>".
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Remove o prefixo "Bearer " (7 caracteres).
    const token = authHeader.slice(7);
    try {
      // decode apenas le o payload (nao confere a assinatura - o Kong ja fez isso).
      req.usuarioAutenticado = jwt.decode(token);
    } catch (err) {
      req.usuarioAutenticado = null;
    }
  }
  // Segue para a proxima etapa (rota).
  next();
}

module.exports = extrairUsuario;
