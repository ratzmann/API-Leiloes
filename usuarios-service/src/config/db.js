// =============================================================================
// config/db.js  -  CONEXAO com o banco de dados PostgreSQL do servico
// -----------------------------------------------------------------------------
// Cria um "pool" (piscina) de conexoes: algumas conexoes ficam abertas e sao
// "emprestadas" a cada consulta, o que e bem mais rapido do que abrir uma nova
// a cada vez. Quem usa: repositories/ e db/migrar.js.
//
// Cada microsservico tem O PROPRIO banco (auth-db, usuarios-db, leiloes-db,
// lances-db) e so ele acessa esse banco. Quem precisa de dados de outro servico
// pede via HTTP (REST) - essa e uma regra basica de microsservicos.
// (Arquivo identico nos 4 servicos: cada microsservico tem a sua copia.)
// =============================================================================

// Desestruturacao: pega so a classe Pool de dentro da biblioteca 'pg'.
const { Pool } = require('pg');

// Os dados de acesso vem de variaveis de ambiente (docker-compose.yml ou .env),
// nunca escritos no codigo: a mesma imagem roda em qualquer lugar e a senha do
// banco nao fica exposta no repositorio. O DB_NAME diz qual banco e este.
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Exporta o pool: quem fizer require('../config/db') recebe este mesmo objeto.
module.exports = pool;
