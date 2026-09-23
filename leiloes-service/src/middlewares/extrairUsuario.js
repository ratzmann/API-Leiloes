// =============================================================================
// middlewares/extrairUsuario.js  -  descobre QUEM esta fazendo a requisicao
// -----------------------------------------------------------------------------
// MIDDLEWARE e uma funcao que o Express executa ANTES da rota. Ela recebe
// (req, res, next) e, ao terminar, chama next() para passar a requisicao
// adiante. Se nao chamar next(), a requisicao "trava" ali.
//
// Resultado: req.usuarioAutenticado recebe o conteudo (payload) do token JWT,
// por exemplo { sub: 1, email: '...', papel: 'LICITANTE', perfilId: 3, iss, exp }.
//
// Por que so DECODIFICAR (e nao verificar a assinatura)?
//   A verificacao criptografica ja foi feita pelo Kong (plugin jwt) na borda.
//   E os servicos nao tem porta exposta: so da para chega-los pelo Kong ou
//   pela rede interna do Docker. Por isso o conteudo do token e confiavel aqui.
//
// Por que NAO bloquear quando nao ha token?
//   Porque os servicos tambem recebem chamadas INTERNAS, sem token (ex.: o
//   auth-service cria perfis no usuarios-service; o lances-service consulta a
//   disponibilidade no leiloes-service). Quem exige usuario logado sao as
//   regras de negocio, nos services.
//
// (Arquivo identico em usuarios, leiloes e lances: cada servico tem a sua copia.)
// =============================================================================

const jwt = require('jsonwebtoken');

/**
 * Recebe (req, res, next), como todo middleware do Express.
 * Se a requisicao trouxer o header "Authorization: Bearer <token>", guarda o
 * conteudo do token em req.usuarioAutenticado; sem token, o campo fica vazio.
 * Nunca responde nem bloqueia a requisicao: sempre chama next() no final.
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
