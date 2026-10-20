// =============================================================================
// config/db.js  -  CONEXAO com o banco de dados PostgreSQL do servico
// -----------------------------------------------------------------------------
// Cria um "pool" (piscina) de conexoes: algumas conexoes ficam abertas e sao
// "emprestadas" a cada consulta, o que e bem mais rapido do que abrir uma nova
// a cada vez.
//
// Cada microsservico tem O PROPRIO banco (auth-db, usuarios-db, leiloes-db,
// lances-db) e so ele acessa esse banco. Quem precisa de dados de outro servico
// pede via HTTP (REST) - essa e uma regra basica de microsservicos.
//
// Dois jeitos de configurar (T2):
//   - na nuvem (Neon/Render) o provedor entrega uma DATABASE_URL pronta;
//   - no docker-compose continuam as variaveis DB_* separadas.
// DB_SSL=true liga o SSL, exigido pelos bancos gerenciados.
//
// Quem chama: repositories/*.js e db/migrar.js | Quem e chamado: biblioteca pg
// (Arquivo identico nos 4 servicos: cada microsservico tem a sua copia.)
// =============================================================================

// Desestruturacao: pega so a classe Pool de dentro da biblioteca 'pg'.
const { Pool } = require('pg');

/**
 * Monta as opcoes de conexao a partir das variaveis de ambiente.
 * Recebe `env` (padrao: process.env; os testes passam um objeto proprio).
 * Devolve { connectionString, ssl } quando existe DATABASE_URL, ou
 * { host, port, user, password, database, ssl } com as variaveis DB_*.
 * Os dados de acesso vem sempre do ambiente, nunca escritos no codigo: a mesma
 * imagem roda em qualquer lugar e a senha do banco nao fica no repositorio.
 */
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

// Exporta o pool: quem fizer require('../config/db') recebe este mesmo objeto.
// opcoesDeConexao vai junto para os testes (tests/db.test.js).
module.exports = pool;
module.exports.opcoesDeConexao = opcoesDeConexao;
