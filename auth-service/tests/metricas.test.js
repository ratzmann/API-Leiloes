// =============================================================================
// tests/metricas.test.js  -  testes das METRICAS do auth-service (T2)
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

/** Lista, em ordem alfabetica, os valores do rotulo que ja tem serie na metrica. */
async function valoresDoRotulo(nome, rotulo) {
  const { values } = await metricas.registro.getSingleMetric(nome).get();
  return values.map((v) => v.labels[rotulo]).sort();
}

describe('contadores de negocio', () => {
  test('as series de negocio ja nascem com zero (comecarEmZero)', async () => {
    expect(await valoresDoRotulo('auth_registros_total', 'papel')).toEqual([
      'LEILOEIRO', 'LICITANTE',
    ]);
    expect(await valoresDoRotulo('auth_logins_total', 'resultado')).toEqual([
      'falha', 'sucesso',
    ]);
  });

  test('registrarRegistro separa por papel', async () => {
    const antes = await valorDe('auth_registros_total', { papel: 'LICITANTE' });
    metricas.registrarRegistro('LICITANTE');
    expect(await valorDe('auth_registros_total', { papel: 'LICITANTE' })).toBe(antes + 1);
  });

  test('registrarLogin separa por resultado', async () => {
    const antes = await valorDe('auth_logins_total', { resultado: 'falha' });
    metricas.registrarLogin('falha');
    expect(await valorDe('auth_logins_total', { resultado: 'falha' })).toBe(antes + 1);
  });
});

describe('rotaDaRequisicao', () => {
  test.each([
    [{ baseUrl: '', route: { path: '/login' } }, '/login'],
    [{ baseUrl: '', route: { path: '/registrar' } }, '/registrar'],
    [{ baseUrl: '', route: { path: '/health' } }, '/health'],
    [{ originalUrl: '/docs/swagger-ui.css' }, '/docs'],
    [{ originalUrl: '/qualquer/coisa' }, 'nao_encontrada'],
  ])('%j -> %s', (req, esperado) => {
    expect(metricas.rotaDaRequisicao(req)).toBe(esperado);
  });
});
