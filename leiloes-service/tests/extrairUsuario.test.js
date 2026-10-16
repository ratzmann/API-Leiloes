// =============================================================================
// tests/extrairUsuario.test.js  -  testes do middleware que le o token JWT
// -----------------------------------------------------------------------------
// Chama o middleware direto, com req/res/next falsos: sem servidor e sem banco.
// Confere que o token so vale se estiver assinado com o JWT_SECRET, emitido
// pelo JWT_ISSUER e dentro da validade; e que chamadas sem token seguem.
// (Arquivo identico em usuarios, leiloes e lances.)
// =============================================================================

const jwt = require('jsonwebtoken');
const extrairUsuario = require('../src/middlewares/extrairUsuario');

const SEGREDO = 'segredo-de-teste';
const EMISSOR = 'sistema-leilao-auth';
const PAYLOAD = { sub: 7, papel: 'LICITANTE', perfilId: 3 };

/** Roda o middleware com o header informado e devolve { req, erro }. */
function executar(authorization) {
  const req = { headers: authorization ? { authorization } : {} };
  const next = jest.fn();
  extrairUsuario(req, {}, next);
  return { req, erro: next.mock.calls[0][0] };
}

/** Monta um token assinado (por padrao, com o segredo e o emissor certos). */
function token(opcoes = {}, segredo = SEGREDO) {
  return jwt.sign(PAYLOAD, segredo, { issuer: EMISSOR, expiresIn: '1h', ...opcoes });
}

beforeEach(() => {
  process.env.JWT_SECRET = SEGREDO;
  process.env.JWT_ISSUER = EMISSOR;
});

describe('extrairUsuario', () => {
  test('sem token: segue sem usuario (chamadas internas continuam passando)', () => {
    const { req, erro } = executar(undefined);
    expect(erro).toBeUndefined();
    expect(req.usuarioAutenticado).toBeUndefined();
  });

  test('header sem "Bearer " e ignorado', () => {
    const { req, erro } = executar('Basic abc');
    expect(erro).toBeUndefined();
    expect(req.usuarioAutenticado).toBeUndefined();
  });

  test('token valido: guarda o conteudo em req.usuarioAutenticado', () => {
    const { req, erro } = executar(`Bearer ${token()}`);
    expect(erro).toBeUndefined();
    expect(req.usuarioAutenticado).toMatchObject(PAYLOAD);
  });

  test.each([
    ['assinado com outro segredo (token forjado)', () => token({}, 'segredo-falso')],
    ['vencido', () => token({ expiresIn: -10 })],
    ['de outro emissor', () => token({ issuer: 'outro-sistema' })],
    ['malformado', () => 'nao-e-um-jwt'],
  ])('token %s responde 401', (descricao, gerar) => {
    const { req, erro } = executar(`Bearer ${gerar()}`);
    expect(erro).toMatchObject({ codigo: 401 });
    expect(req.usuarioAutenticado).toBeUndefined();
  });

  test('sem JWT_SECRET configurado: 500 (nao ha como conferir o token)', () => {
    delete process.env.JWT_SECRET;
    const { erro } = executar(`Bearer ${token()}`);
    expect(erro).toMatchObject({ codigo: 500 });
  });
});
