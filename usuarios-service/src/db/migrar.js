const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

// Roda o init.sql toda vez que o servico sobe. O Postgres so executa o
// initdb com o volume vazio, entao tabela nova nao chegaria em banco que ja
// existe. Como e tudo IF NOT EXISTS, rodar de novo nao quebra nada.
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
