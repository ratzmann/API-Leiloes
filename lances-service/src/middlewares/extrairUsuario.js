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
// Por que VERIFICAR a assinatura aqui, se o Kong ja verifica?
//   No docker-compose, so se chega aos servicos pelo Kong ou pela rede interna.
//   Mas no deploy do T2 (Render) cada servico fica exposto na internet SEM o
//   Kong na frente: se o servico so lesse o token (jwt.decode), qualquer pessoa
//   poderia montar um token falso dizendo "sou o leiloeiro 1". Com jwt.verify,
//   so vale o token assinado com o JWT_SECRET (o mesmo do auth-service e do
//   kong.yml) e emitido pelo JWT_ISSUER. Defesa em profundidade.
//
// Por que NAO bloquear quando nao ha token?
//   Porque os servicos tambem recebem chamadas INTERNAS, sem token (ex.: o
//   auth-service cria perfis no usuarios-service; o lances-service consulta a
//   disponibilidade no leiloes-service). Quem exige usuario logado sao as
//   regras de negocio, nos services. Token PRESENTE e invalido, porem, e 401.
//
// (Arquivo identico em usuarios, leiloes e lances: cada servico tem a sua copia.)
// =============================================================================

const jwt = require('jsonwebtoken');
const { ErroDeValidacao } = require('../utils/erros');

/**
 * Recebe (req, res, next), como todo middleware do Express.
 * - Sem o header "Authorization: Bearer <token>": segue sem usuario (chamada
 *   interna ou rota livre; os services decidem se precisa de login).
 * - Com token valido (assinatura, emissor e validade conferidos): guarda o
 *   conteudo em req.usuarioAutenticado e segue.
 * - Com token invalido ou vencido: next(erro 401), respondido pelo tratarErros.
 * - Sem JWT_SECRET configurado: next(erro 500), porque nao ha como conferir.
 * O segredo e lido a cada requisicao (os testes trocam o valor).
 */
function extrairUsuario(req, res, next) {
  // Headers sao "metadados" da requisicao. O token vem no header
  // Authorization no formato "Bearer <token>".
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const segredo = process.env.JWT_SECRET;
  if (!segredo) {
    return next(new ErroDeValidacao('JWT_SECRET nao configurado: nao da para conferir o token.', 500));
  }

  // slice(7) corta os 7 primeiros caracteres ("Bearer "), sobrando o token.
  const token = authHeader.slice(7);
  try {
    // algorithms: so aceita HS256 (impede o truque de trocar o algoritmo no token);
    // issuer: confere quem emitiu, quando JWT_ISSUER estiver configurado.
    req.usuarioAutenticado = jwt.verify(token, segredo, {
      algorithms: ['HS256'],
      issuer: process.env.JWT_ISSUER || undefined,
    });
    return next();
  } catch (err) {
    return next(new ErroDeValidacao('Token invalido ou expirado.', 401));
  }
}

module.exports = extrairUsuario;
