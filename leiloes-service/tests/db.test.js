const { opcoesDeConexao } = require('../src/config/db');

describe('opcoesDeConexao', () => {
  test('DATABASE_URL (Render/Neon) tem prioridade e liga SSL com DB_SSL=true', () => {
    expect(
      opcoesDeConexao({
        DATABASE_URL: 'postgres://u:s@h:5432/leiloes',
        DB_SSL: 'true',
        DB_HOST: 'ignorado',
      })
    ).toEqual({ connectionString: 'postgres://u:s@h:5432/leiloes', ssl: true });
  });

  test('sem DATABASE_URL usa as variaveis DB_* do docker-compose, sem SSL', () => {
    expect(
      opcoesDeConexao({
        DB_HOST: 'leiloes-db',
        DB_PORT: '5432',
        DB_USER: 'u',
        DB_PASSWORD: 's',
        DB_NAME: 'leiloes_db',
      })
    ).toEqual({
      host: 'leiloes-db',
      port: '5432',
      user: 'u',
      password: 's',
      database: 'leiloes_db',
      ssl: undefined,
    });
  });
});
