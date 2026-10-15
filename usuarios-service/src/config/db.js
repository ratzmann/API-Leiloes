const { Pool } = require('pg');

// Em nuvem (Neon/Render) o provedor entrega uma DATABASE_URL pronta; no
// docker-compose continuam as variaveis DB_* separadas. DB_SSL=true liga o SSL,
// exigido pelos bancos gerenciados.
function opcoesDeConexao(env = process.env) {
  const ssl = String(env.DB_SSL).toLowerCase() === 'true' ? true : undefined;
  if (env.DATABASE_URL) return { connectionString: env.DATABASE_URL, ssl };
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl,
  };
}

const pool = new Pool(opcoesDeConexao());

module.exports = pool;
module.exports.opcoesDeConexao = opcoesDeConexao;
