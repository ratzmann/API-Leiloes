// =============================================================================
// tests/ambiente.test.js  -  testes do AMBIENTE (T2)
// -----------------------------------------------------------------------------
// APP_ENV, NODE_ENV, SWAGGER_ENABLED e VERSAO_IMAGEM decidem o nome do ambiente,
// a versao e se o Swagger liga (config/ambiente.js). Sem servidor e sem banco.
// (Arquivo identico nos 4 servicos.)
// =============================================================================

const { carregarAmbiente } = require('../src/config/ambiente');
const { version } = require('../package.json');

describe('carregarAmbiente', () => {
  test('sem variaveis (rodando na maquina): local com swagger', () => {
    expect(carregarAmbiente({})).toEqual({ nome: 'local', versao: version, swaggerHabilitado: true });
  });

  test('dev liga o swagger', () => {
    expect(carregarAmbiente({ APP_ENV: 'dev' }).swaggerHabilitado).toBe(true);
  });

  test('homol desliga o swagger', () => {
    expect(carregarAmbiente({ APP_ENV: 'homol' }).swaggerHabilitado).toBe(false);
  });

  test('APP_ENV esquecido dentro da imagem (NODE_ENV=production) desliga o swagger', () => {
    const ambiente = carregarAmbiente({ NODE_ENV: 'production' });
    expect(ambiente.nome).toBe('desconhecido');
    expect(ambiente.swaggerHabilitado).toBe(false);
  });

  test('SWAGGER_ENABLED explicito vence o padrao', () => {
    expect(carregarAmbiente({ APP_ENV: 'homol', SWAGGER_ENABLED: 'true' }).swaggerHabilitado).toBe(true);
    expect(carregarAmbiente({ APP_ENV: 'dev', SWAGGER_ENABLED: 'false' }).swaggerHabilitado).toBe(false);
  });

  test('APP_ENV em maiusculas e normalizado', () => {
    expect(carregarAmbiente({ APP_ENV: 'DEV' }).nome).toBe('dev');
  });

  test('VERSAO_IMAGEM (tag da imagem) substitui a versao do package.json', () => {
    expect(carregarAmbiente({ VERSAO_IMAGEM: '1.1.0-dev.12' }).versao).toBe('1.1.0-dev.12');
  });
});
