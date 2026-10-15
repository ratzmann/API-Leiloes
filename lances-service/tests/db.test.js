const { opcoesDeConexao } = require('../src/config/db');

describe('opcoesDeConexao', () => {
  test('DATABASE_URL (Render/Neon) tem prioridade e liga SSL com DB_SSL=true', () => {
    expect(
      opcoesDeConexao({
        DATABASE_URL: 'postgres://u:s@h:5432/lances',
        DB_SSL: 'true',
        DB_HOST: 'ignorado',
      })
    ).toEqual({ connectionString: 'postgres://u:s@h:5432/lances', ssl: true });
  });

  test('sem DATABASE_URL usa as variaveis DB_* do docker-compose, sem SSL', () => {
    expect(
      opcoesDeConexao({
        DB_HOST: 'lances-db',
        DB_PORT: '5432',
        DB_USER: 'u',
        DB_PASSWORD: 's',
        DB_NAME: 'lances_db',
      })
    ).toEqual({
      host: 'lances-db',
      port: '5432',
      user: 'u',
      password: 's',
      database: 'lances_db',
      ssl: undefined,
    });
  });
});
