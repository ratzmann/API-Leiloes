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
// Quem VALIDA o token: o Kong (plugin jwt, ver kong/kong.yml, secao consumers)
// e, de novo, cada servico que recebe o token (usuarios, leiloes e lances, no
// middlewares/extrairUsuario.js, com jwt.verify). Todos conhecem o mesmo
// segredo, e o "issuer" (claim iss) precisa ser igual a "key" do Kong e ao
// JWT_ISSUER dos servicos.
//
// Quem chama: services/authService.js (gerarToken, no registro e no login)
// =============================================================================

// Biblioteca que sabe criar (sign) e conferir (verify) tokens JWT.
const jwt = require('jsonwebtoken');

// Configuracoes lidas das variaveis de ambiente (docker-compose.yml).
// SECRET: a "chave" da assinatura - precisa ser a mesma do Kong e dos servicos.
const SECRET = process.env.JWT_SECRET;
// ISSUER: "quem emitiu" o token (claim iss). O Kong usa esse valor para achar
// qual segredo usar na conferencia (key_claim_name: iss no kong.yml), e os
// servicos conferem se ele e o esperado (JWT_ISSUER).
const ISSUER = process.env.JWT_ISSUER;
// Tempo de validade do token ('2h' = duas horas). Depois disso o Kong e os
// servicos recusam o token (401).
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

/**
 * Cria e assina um token para o usuario.
 * @param usuario  objeto com id, email, papel e perfil_id (vindo do banco)
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
      // perfilId = id do leiloeiro ou do licitante no usuarios-service.
      // ATENCAO: e diferente do "sub"! O usuario 7 do auth-db pode ser o
      // licitante 3 do usuarios-db. Os servicos de leiloes e lances usam o
      // perfilId para saber "em nome de quem" a pessoa pode agir.
      // (null se o perfil ainda nao foi criado.)
      perfilId: usuario.perfil_id ?? null,
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

// Nao ha funcao de "verificar token" aqui: o auth-service so EMITE tokens.
// Quem confere assinatura e validade e o Kong e o extrairUsuario.js dos outros
// servicos.
module.exports = { gerarToken };
