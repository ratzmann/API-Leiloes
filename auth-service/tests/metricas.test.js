const metricas = require('../src/observabilidade/metricas');

async function valorDe(nome, rotulos = {}) {
  const { values } = await metricas.registro.getSingleMetric(nome).get();
  const item = values.find((v) =>
    Object.entries(rotulos).every(([chave, valor]) => v.labels[chave] === valor)
  );
  return item ? item.value : 0;
}

describe('contadores de negocio', () => {
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
