// =============================================================================
// tests/metricas.test.js  -  testes das METRICAS do leiloes-service (T2)
// -----------------------------------------------------------------------------
// Confere os contadores de negocio e o rotulo de rota usado nas metricas HTTP
// (sempre o PADRAO da rota, nunca a URL com o id).
// =============================================================================

const metricas = require('../src/observabilidade/metricas');

/** Le o valor atual de uma metrica (com os rotulos pedidos) no registro. */
async function valorDe(nome, rotulos = {}) {
  const { values } = await metricas.registro.getSingleMetric(nome).get();
  const item = values.find((v) =>
    Object.entries(rotulos).every(([chave, valor]) => v.labels[chave] === valor)
  );
  return item ? item.value : 0;
}

describe('contadores de negocio', () => {
  test('registrarLeilaoCadastrado soma 1', async () => {
    const antes = await valorDe('leiloes_cadastrados_total');
    metricas.registrarLeilaoCadastrado();
    expect(await valorDe('leiloes_cadastrados_total')).toBe(antes + 1);
  });

  test('registrarMudancaStatus separa por status', async () => {
    const antes = await valorDe('leiloes_mudancas_status_total', { status: 'ABERTO' });
    metricas.registrarMudancaStatus('ABERTO');
    expect(await valorDe('leiloes_mudancas_status_total', { status: 'ABERTO' })).toBe(antes + 1);
  });
});

describe('rotaDaRequisicao', () => {
  test.each([
    [{ baseUrl: '/leiloes', route: { path: '/:id' } }, '/leiloes/:id'],
    [{ baseUrl: '/leiloes', route: { path: '/' } }, '/leiloes'],
    [{ baseUrl: '', route: { path: '/health' } }, '/health'],
    [{ originalUrl: '/docs/swagger-ui.css' }, '/docs'],
    [{ originalUrl: '/qualquer/coisa' }, 'nao_encontrada'],
  ])('%j -> %s', (req, esperado) => {
    expect(metricas.rotaDaRequisicao(req)).toBe(esperado);
  });
});
