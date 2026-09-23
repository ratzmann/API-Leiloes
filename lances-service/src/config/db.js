// =============================================================================
// config/db.js  -  CONEXAO com o banco de dados PostgreSQL (lances-db)
// -----------------------------------------------------------------------------
// "Pool" de conexoes reaproveitaveis. Banco EXCLUSIVO do lances-service.
// Repare: os dados de leilao e de credito NAO estao aqui - por isso o registro
// de lance precisa da Saga, que conversa com os outros servicos via HTTP.
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
