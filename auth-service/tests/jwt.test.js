// =============================================================================
// tests/jwt.test.js  -  testes do conteudo do token JWT
// -----------------------------------------------------------------------------
// Aqui NAO usamos mock: geramos um token de verdade e o abrimos com
// jwt.verify para conferir o que vai dentro dele (o "payload").
// As variaveis de ambiente sao definidas ANTES do require, porque utils/jwt.js
// le JWT_SECRET e JWT_ISSUER no momento em que e carregado.
// =============================================================================

process.env.JWT_SECRET = 'segredo-de-teste';
process.env.JWT_ISSUER = 'emissor-de-teste';

const jwt = require('jsonwebtoken');
const { gerarToken } = require('../src/utils/jwt');

describe('utils/jwt.gerarToken', () => {
  test('inclui sub, papel e perfilId no payload', () => {
    const token = gerarToken({ id: 7, email: 'a@a.com', papel: 'LICITANTE', perfil_id: 3 });
    const payload = jwt.verify(token, 'segredo-de-teste', { issuer: 'emissor-de-teste' });

    expect(payload.sub).toBe(7);
    expect(payload.papel).toBe('LICITANTE');
    expect(payload.perfilId).toBe(3);
  });

  test('perfilId fica null quando o perfil ainda nao existe', () => {
    const token = gerarToken({ id: 7, email: 'a@a.com', papel: 'LEILOEIRO' });
    const payload = jwt.decode(token);

    expect(payload.perfilId).toBeNull();
  });
});
