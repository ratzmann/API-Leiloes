// =============================================================================
// tests/configSaga.test.js  -  testes da CONFIGURACAO da Saga
// -----------------------------------------------------------------------------
// config/saga.js le SAGA_PERMITIR_FALHA_SIMULADA e SAGA_ESPERA_REPETICAO_MS.
// Cada teste passa um objeto `env` proprio: sem servidor, sem banco e sem
// mexer no process.env de verdade.
// =============================================================================

const { falhaSimuladaPermitida, esperaEntreTentativasMs } = require('../src/config/saga');

describe('falhaSimuladaPermitida', () => {
  test('so liga com SAGA_PERMITIR_FALHA_SIMULADA=true', () => {
    expect(falhaSimuladaPermitida({ SAGA_PERMITIR_FALHA_SIMULADA: 'true' })).toBe(true);
    expect(falhaSimuladaPermitida({ SAGA_PERMITIR_FALHA_SIMULADA: 'false' })).toBe(false);
    expect(falhaSimuladaPermitida({ SAGA_PERMITIR_FALHA_SIMULADA: 'sim' })).toBe(false);
  });

  test('desligada quando a variavel nao existe (padrao seguro)', () => {
    expect(falhaSimuladaPermitida({})).toBe(false);
  });
});

describe('esperaEntreTentativasMs', () => {
  test('usa SAGA_ESPERA_REPETICAO_MS como numero', () => {
    expect(esperaEntreTentativasMs({ SAGA_ESPERA_REPETICAO_MS: '0' })).toBe(0);
    expect(esperaEntreTentativasMs({ SAGA_ESPERA_REPETICAO_MS: '1500' })).toBe(1500);
  });

  test('padrao de 300 ms sem a variavel', () => {
    expect(esperaEntreTentativasMs({})).toBe(300);
  });
});
