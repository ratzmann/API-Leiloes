// =============================================================================
// utils/password.js  -  CRIPTOGRAFIA de senhas com bcrypt
// -----------------------------------------------------------------------------
// Guardar senha "em texto puro" no banco e um erro grave: se o banco vazar,
// todas as senhas vazam. Por isso guardamos um HASH:
//   - hash e uma funcao de mao unica: da senha chega-se ao hash, mas do hash
//     NAO se volta para a senha;
//   - o bcrypt ainda mistura um "salt" (valor aleatorio) em cada hash, entao
//     duas pessoas com a mesma senha tem hashes diferentes;
//   - e e propositalmente LENTO, o que atrapalha quem tenta adivinhar senhas
//     testando milhoes de combinacoes.
// =============================================================================

// bcryptjs = implementacao do bcrypt em JavaScript puro.
const bcrypt = require('bcryptjs');

/**
 * Gera o hash de uma senha.
 * @param senhaPlana a senha como o usuario digitou
 * @returns texto do hash (ex.: "$2a$10$..."), que e o que vai para o banco
 */
async function hashSenha(senhaPlana) {
  // 10 = "custo": quanto maior, mais lento (e mais seguro) fica o calculo.
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(senhaPlana, salt);
}

/**
 * Confere se a senha digitada corresponde ao hash guardado.
 * O salt fica gravado dentro do proprio hash, entao o bcrypt consegue
 * refazer o calculo e comparar.
 * @returns true se a senha estiver correta, false caso contrario
 */
async function compararSenha(senhaPlana, hash) {
  return bcrypt.compare(senhaPlana, hash);
}

module.exports = { hashSenha, compararSenha };
