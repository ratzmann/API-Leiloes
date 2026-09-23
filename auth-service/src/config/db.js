// =============================================================================
// config/db.js  -  CONEXAO com o banco de dados PostgreSQL
// -----------------------------------------------------------------------------
// Cria um "pool" (piscina) de conexoes com o Postgres. Em vez de abrir e fechar
// uma conexao a cada consulta (lento), o pool mantem algumas conexoes abertas
// e as "empresta" para quem precisar. Quem usa: os arquivos de repositories/.
//
// Cada microsservico tem O PROPRIO banco (aqui: auth-db). Nenhum outro servico
// acessa este banco - essa e uma regra basica de microsservicos.
// (Este arquivo e identico nos 4 servicos de proposito: cada um e independente.)
// =============================================================================

// 'pg' e a biblioteca do Node para falar com o Postgres.
// As chaves { Pool } fazem "desestruturacao": pegamos so a propriedade Pool
// de dentro do objeto exportado pela biblioteca.
const { Pool } = require('pg');

// Os dados de acesso vem de variaveis de ambiente (docker-compose.yml ou .env),
// nunca escritos direto no codigo. Assim a mesma imagem roda em qualquer lugar
// e a senha do banco nao fica exposta no repositorio.
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Exporta o pool: quem fizer require('../config/db') recebe este mesmo objeto.
module.exports = pool;
