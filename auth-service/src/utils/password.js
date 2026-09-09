const bcrypt = require('bcryptjs');

async function hashSenha(senhaPlana) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(senhaPlana, salt);
}

async function compararSenha(senhaPlana, hash) {
  return bcrypt.compare(senhaPlana, hash);
}

module.exports = { hashSenha, compararSenha };
