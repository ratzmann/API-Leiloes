const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const ISSUER = process.env.JWT_ISSUER;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

function gerarToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      email: usuario.email,
      papel: usuario.papel,
    },
    SECRET,
    {
      issuer: ISSUER,
      expiresIn: EXPIRES_IN,
      algorithm: 'HS256',
    }
  );
}

function verificarToken(token) {
  return jwt.verify(token, SECRET, { issuer: ISSUER });
}

module.exports = { gerarToken, verificarToken };
