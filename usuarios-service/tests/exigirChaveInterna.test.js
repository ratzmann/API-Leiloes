// =============================================================================
// tests/exigirChaveInterna.test.js  -  testes do middleware das ROTAS INTERNAS
// -----------------------------------------------------------------------------
// O middleware e chamado direto, com req/res/next falsos: sem servidor e sem
// banco. Confere os tres caminhos: sem CHAVE_INTERNA configurada (500), chave
// ausente ou errada (403) e chave certa (segue para a rota).
// =============================================================================

const exigirChaveInterna = require('../src/middlewares/exigirChaveInterna');
const { ErroDeValidacao } = require('../src/utils/erros');

/** Requisicao falsa: so o req.get('X-Chave-Interna') importa aqui. */
const requisicao = (chave) => ({ get: (nome) => (nome === 'X-Chave-Interna' ? chave : undefined) });

/** Roda o middleware e devolve o que ele passou para o next (undefined = seguiu). */
function rodar(chave) {
  const next = jest.fn();
  exigirChaveInterna(requisicao(chave), {}, next);
  expect(next).toHaveBeenCalledTimes(1);
  return next.mock.calls[0][0];
}

beforeEach(() => {
  process.env.CHAVE_INTERNA = 'chave-de-teste';
});

afterAll(() => {
  delete process.env.CHAVE_INTERNA;
});

describe('exigirChaveInterna', () => {
  test('chave certa: segue para a rota', () => {
    expect(rodar('chave-de-teste')).toBeUndefined();
  });

  test('sem o header: 403', () => {
    const erro = rodar(undefined);
    expect(erro).toBeInstanceOf(ErroDeValidacao);
    expect(erro.codigo).toBe(403);
  });

  test('chave errada (inclusive de outro tamanho): 403', () => {
    expect(rodar('chave-de-outro').codigo).toBe(403);
    expect(rodar('x').codigo).toBe(403);
  });

  test('sem CHAVE_INTERNA configurada: 500 (rotas internas desligadas, nunca abertas)', () => {
    delete process.env.CHAVE_INTERNA;
    const erro = rodar('qualquer-coisa');
    expect(erro.codigo).toBe(500);
    expect(erro.message).toMatch('CHAVE_INTERNA');
  });
});
