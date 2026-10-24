// =============================================================================
// tests/metricas.test.js  -  testes das METRICAS do lances-service (T2)
// -----------------------------------------------------------------------------
// Confere os contadores de negocio da Saga e o rotulo de rota usado nas
// metricas HTTP (sempre o PADRAO da rota, nunca a URL com o id).
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
    expect(await valoresDoRotulo('lances_sagas_total', 'status')).toEqual([
      'COMPENSADA', 'CONCLUIDA', 'CONCLUIDA_COM_PENDENCIA', 'FALHOU', 'FALHOU_COMPENSACAO',
    ]);
    expect(await valoresDoRotulo('lances_sagas_reprocessadas_total', 'resultado')).toEqual([
      'pendente', 'resolvida',
    ]);
  });

  test('registrarLanceGravado soma em lances_registrados_total', async () => {
    const antes = await valorDe('lances_registrados_total');
    metricas.registrarLanceGravado();
    expect(await valorDe('lances_registrados_total')).toBe(antes + 1);
  });

  test('registrarSaga separa pelo status final', async () => {
    const antes = await valorDe('lances_sagas_total', { status: 'COMPENSADA' });
    metricas.registrarSaga('COMPENSADA');
    expect(await valorDe('lances_sagas_total', { status: 'COMPENSADA' })).toBe(antes + 1);
  });

  test('registrarReprocessamento separa pelo resultado', async () => {
    const antes = await valorDe('lances_sagas_reprocessadas_total', { resultado: 'resolvida' });
    metricas.registrarReprocessamento('resolvida');
    expect(await valorDe('lances_sagas_reprocessadas_total', { resultado: 'resolvida' })).toBe(antes + 1);
  });
});

describe('rotaDaRequisicao', () => {
  test.each([
    [{ baseUrl: '/lances', route: { path: '/:id' } }, '/lances/:id'],
    [{ baseUrl: '/lances', route: { path: '/' } }, '/lances'],
    [{ baseUrl: '/lances', route: { path: '/leilao/:leilaoId/maior' } }, '/lances/leilao/:leilaoId/maior'],
    [{ baseUrl: '/lances', route: { path: '/sagas/:id/reprocessar' } }, '/lances/sagas/:id/reprocessar'],
    // erro que saiu do router: o Express apagou o baseUrl, vale o prefixo guardado
    [{ baseUrl: '', prefixoDaRota: '/lances', route: { path: '/:id' } }, '/lances/:id'],
    [{ baseUrl: '', route: { path: '/health' } }, '/health'],
    [{ originalUrl: '/docs/swagger-ui.css' }, '/docs'],
    [{ originalUrl: '/qualquer/coisa' }, 'nao_encontrada'],
  ])('%j -> %s', (req, esperado) => {
    expect(metricas.rotaDaRequisicao(req)).toBe(esperado);
  });
});
