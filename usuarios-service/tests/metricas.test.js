// =============================================================================
// tests/metricas.test.js  -  testes das METRICAS do usuarios-service (T2)
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
    expect(await valoresDoRotulo('usuarios_cadastros_total', 'tipo')).toEqual([
      'leiloeiro', 'licitante',
    ]);
    expect(await valoresDoRotulo('usuarios_reservas_credito_total', 'operacao')).toEqual([
      'liberada', 'reservada',
    ]);
  });

  test('registrarCadastro separa por tipo', async () => {
    const antes = await valorDe('usuarios_cadastros_total', { tipo: 'licitante' });
    metricas.registrarCadastro('licitante');
    expect(await valorDe('usuarios_cadastros_total', { tipo: 'licitante' })).toBe(antes + 1);
  });

  test('registrarOperacaoCredito separa por operacao', async () => {
    const antes = await valorDe('usuarios_reservas_credito_total', { operacao: 'reservada' });
    metricas.registrarOperacaoCredito('reservada');
    expect(await valorDe('usuarios_reservas_credito_total', { operacao: 'reservada' })).toBe(
      antes + 1
    );
  });
});

describe('rotaDaRequisicao', () => {
  test.each([
    [{ baseUrl: '/licitantes', route: { path: '/:id' } }, '/licitantes/:id'],
    [{ baseUrl: '/leiloeiros', route: { path: '/' } }, '/leiloeiros'],
    [{ baseUrl: '/licitantes', route: { path: '/:id/reservas/:reservaId/liberar' } }, '/licitantes/:id/reservas/:reservaId/liberar'],
    [{ baseUrl: '', route: { path: '/health' } }, '/health'],
    [{ originalUrl: '/docs/swagger-ui.css' }, '/docs'],
    [{ originalUrl: '/qualquer/coisa' }, 'nao_encontrada'],
  ])('%j -> %s', (req, esperado) => {
    expect(metricas.rotaDaRequisicao(req)).toBe(esperado);
  });
});
