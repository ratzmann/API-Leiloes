// =============================================================================
// config/db.js  -  CONEXAO com o banco de dados PostgreSQL (leiloes-db)
// -----------------------------------------------------------------------------
// "Pool" de conexoes: mantem conexoes abertas e as empresta a cada consulta.
// Banco EXCLUSIVO deste servico: o lances-service, por exemplo, NAO le esta
// tabela direto - ele pergunta via HTTP (GET /leiloes/:id/disponibilidade).
// (Arquivo identico nos 4 servicos de proposito: cada um e independente.)
// =============================================================================

// Desestruturacao: pega so a classe Pool da biblioteca 'pg'.
const { Pool } = require('pg');

// Credenciais vindas das variaveis de ambiente (docker-compose.yml).
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

module.exports = pool;
