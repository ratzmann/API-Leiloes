// Cria a tabela ao iniciar. No docker-compose o Postgres roda o init.sql
// sozinho, mas no Render o banco e gerenciado e chega vazio. O SQL e todo
// IF NOT EXISTS, entao rodar a cada inicio nao estraga nada.
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// tenta varias vezes porque o banco pode ainda estar subindo (ou acordando, no plano free)
async function migrar({ tentativas = 10, esperaMs = 2000, banco = pool } = {}) {
  const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
  for (let tentativa = 1; ; tentativa++) {
    try {
      await banco.query(sql);
      return;
    } catch (err) {
      if (tentativa >= tentativas) throw err;
      console.warn(`Banco indisponivel (tentativa ${tentativa}/${tentativas}): ${err.message}`);
      await esperar(esperaMs);
    }
  }
}

module.exports = migrar;
