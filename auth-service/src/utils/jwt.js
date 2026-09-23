// =============================================================================
// utils/jwt.js  -  GERACAO do token JWT
// -----------------------------------------------------------------------------
// JWT (JSON Web Token) e um "cracha digital". Depois do login o cliente recebe
// um texto no formato  xxxxx.yyyyy.zzzzz  e o envia em toda requisicao no
// header:  Authorization: Bearer <token>
//
// As tres partes (separadas por ponto) sao:
//   1. header     -> qual algoritmo foi usado (aqui HS256);
//   2. payload    -> os dados ("claims"): quem e o usuario, quando expira...;
//   3. assinatura -> calculada com o SEGREDO (JWT_SECRET). Se alguem alterar o
//                    payload, a assinatura deixa de bater e o token e recusado.
// Atencao: o payload NAO e criptografado, so codificado (qualquer um le).
// Por isso nunca colocamos senha ou dado sigiloso dentro do token.
//
// Quem VALIDA o token nas rotas protegidas e o Kong (plugin jwt), que conhece
// o mesmo segredo (ver kong/kong.yml, secao consumers). Por isso o "issuer"
// (claim iss) precisa ser igual a "key" configurada no Kong.
// =============================================================================

// Biblioteca que sabe criar (sign) e conferir (verify) tokens JWT.
const jwt = require('jsonwebtoken');

// Configuracoes lidas das variaveis de ambiente (docker-compose.yml).
// SECRET: a "chave" da assinatura - precisa ser a mesma configurada no Kong.
const SECRET = process.env.JWT_SECRET;
// ISSUER: "quem emitiu" o token (claim iss). O Kong usa esse valor para achar
// qual segredo usar na conferencia (key_claim_name: iss no kong.yml).
const ISSUER = process.env.JWT_ISSUER;
// Tempo de validade do token ('2h' = duas horas). Depois disso o Kong recusa.
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

/**
 * Cria e assina um token para o usuario.
 * @param usuario  objeto com id, email e papel (vindo do banco)
 * @returns o token em texto (xxxxx.yyyyy.zzzzz)
 */
function gerarToken(usuario) {
  return jwt.sign(
    // 1o argumento: o PAYLOAD (dados que vao dentro do token).
    {
      // "sub" (subject) = de quem e o token: o id do usuario no auth-db.
      sub: usuario.id,
      email: usuario.email,
      // O papel (LEILOEIRO/LICITANTE) viaja no token para os outros servicos saberem.
      papel: usuario.papel,
    },
    // 2o argumento: o segredo usado para calcular a assinatura.
    SECRET,
    // 3o argumento: opcoes (quem emitiu, validade e algoritmo).
    {
      issuer: ISSUER,
      expiresIn: EXPIRES_IN,
      // HS256 = HMAC com SHA-256: o mesmo segredo assina e confere.
      algorithm: 'HS256',
    }
  );
}

/**
 * Confere assinatura, emissor e validade de um token e devolve o payload.
 * Lanca erro se o token for invalido ou estiver expirado.
 * Obs.: hoje quem confere os tokens e o Kong; esta funcao nao e chamada
 * pelo codigo do servico (candidata a remocao futura).
 */
function verificarToken(token) {
  return jwt.verify(token, SECRET, { issuer: ISSUER });
}

module.exports = { gerarToken, verificarToken };
