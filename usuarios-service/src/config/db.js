// =============================================================================
// config/db.js  -  CONEXAO com o banco de dados PostgreSQL (usuarios-db)
// -----------------------------------------------------------------------------
// Cria um "pool" (piscina) de conexoes: algumas conexoes ficam abertas e sao
// "emprestadas" a cada consulta, o que e bem mais rapido do que abrir uma nova
// a cada vez. Quem usa: repositories/ e db/migrar.js.
//
// Este banco e EXCLUSIVO do usuarios-service: outros servicos que precisam
// destes dados pedem via HTTP (REST), nunca acessam o banco diretamente.
// (Arquivo identico nos 4 servicos de proposito: cada um e independente.)
// =============================================================================

// Desestruturacao: pega so a classe Pool de dentro da biblioteca 'pg'.
const { Pool } = require('pg');

// Credenciais vindas de variaveis de ambiente (definidas no docker-compose.yml).
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

module.exports = pool;
