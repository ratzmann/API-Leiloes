// =============================================================================
// middlewares/exigirChaveInterna.js  -  protege as ROTAS INTERNAS
// -----------------------------------------------------------------------------
// Rotas internas sao as que so os OUTROS SERVICOS chamam, nunca o usuario:
//   POST /leiloeiros e POST /licitantes        -> auth-service, no registro;
//   /licitantes/:id/reservas e .../liberar     -> Saga do lances-service;
//   POST /reservas/leilao/:leilaoId/liberar    -> leiloes-service, ao cancelar.
// Elas criam perfis e mexem no credito, e chegam SEM token (quem chama e um
// servico, nao uma pessoa logada).
//
// Por que conferir aqui, se o Kong ja bloqueia essas rotas?
//   No docker-compose, quem vem de fora so chega pelo Kong. Mas no deploy do
//   T2 (Render) cada servico fica exposto na internet SEM o Kong na frente:
//   qualquer pessoa com a URL poderia reservar ou liberar o credito de outra.
//   Entao o proprio servico confere uma CHAVE COMPARTILHADA:
//     - os outros servicos mandam o header X-Chave-Interna (clients/http.js);
//     - o valor vem da variavel CHAVE_INTERNA, IGUAL em todos os servicos do
//       mesmo ambiente (como o JWT_SECRET).
//   Defesa em profundidade: o Kong continua bloqueando, e o servico tambem.
//
// Quem chama: routes/leiloeiroRoutes.js, routes/licitanteRoutes.js e
//             routes/reservaRoutes.js (so nas rotas internas)
// =============================================================================

// crypto = modulo nativo do Node com funcoes de criptografia (hash etc.).
const crypto = require('crypto');
const { ErroDeValidacao } = require('../utils/erros');

/**
 * Compara dois textos em TEMPO CONSTANTE e devolve true se forem iguais.
 * Uma comparacao comum (===) para no primeiro caractere diferente; medindo
 * esse tempo, um atacante poderia adivinhar a chave aos poucos.
 * crypto.timingSafeEqual exige tamanhos iguais, entao comparamos o hash
 * SHA-256 dos dois textos (sempre 32 bytes).
 */
function mesmoValor(recebido, esperado) {
  const hash = (texto) => crypto.createHash('sha256').update(String(texto)).digest();
  return crypto.timingSafeEqual(hash(recebido), hash(esperado));
}

/**
 * Middleware das rotas internas. Recebe (req, res, next), como todo middleware.
 * - Sem CHAVE_INTERNA configurada: next(erro 500). As rotas internas ficam
 *   desligadas ate alguem configurar a variavel (padrao seguro: nunca abertas).
 * - Header X-Chave-Interna ausente ou diferente: next(erro 403).
 * - Chave certa: next(), e a rota segue normalmente.
 * A chave e lida a cada requisicao (os testes trocam o valor).
 */
function exigirChaveInterna(req, res, next) {
  const esperada = process.env.CHAVE_INTERNA;
  if (!esperada) {
    return next(new ErroDeValidacao('CHAVE_INTERNA nao configurada: rotas internas desligadas.', 500));
  }
  // req.get('Nome') le um header da requisicao (sem diferenca de maiusculas).
  const recebida = req.get('X-Chave-Interna');
  if (!recebida || !mesmoValor(recebida, esperada)) {
    return next(new ErroDeValidacao('Rota interna: so os servicos do sistema podem chamar.', 403));
  }
  return next();
}

module.exports = exigirChaveInterna;
