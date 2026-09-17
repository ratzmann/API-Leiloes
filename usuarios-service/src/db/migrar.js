const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

/**
 * Aplica o init.sql ao subir o servico.
 *
 * O Postgres so executa o docker-entrypoint-initdb.d quando o volume esta vazio,
 * entao tabelas novas nunca chegariam a bancos ja existentes. Como o init.sql
 * e todo idempotente (IF NOT EXISTS), roda-lo a cada inicializacao e seguro.
 */
async function migrar({ tentativas = 10, esperaMs = 2000 } = {}) {
  const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');

  for (let tentativa = 1; ; tentativa++) {
    try {
      await pool.query(sql);
      return;
    } catch (err) {
      if (tentativa >= tentativas) throw err;
      console.warn(`Banco ainda indisponivel (tentativa ${tentativa}/${tentativas}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
}

module.exports = migrar;
