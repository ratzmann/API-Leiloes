const metricas = require('../src/observabilidade/metricas');

async function valorDe(nome, rotulos = {}) {
  const { values } = await metricas.registro.getSingleMetric(nome).get();
  const item = values.find((v) =>
    Object.entries(rotulos).every(([chave, valor]) => v.labels[chave] === valor)
  );
  return item ? item.value : 0;
}

describe('contadores de negocio', () => {
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
