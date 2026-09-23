// =============================================================================
// db/migrar.js  -  PREPARA o banco quando o servico inicia ("migracao")
// -----------------------------------------------------------------------------
// Le o init.sql e o executa. Se o Postgres ainda nao estiver pronto (comum
// quando os containers sobem juntos), tenta de novo algumas vezes ("retry").
// Quem chama: server.js. (Igual ao db/migrar.js do usuarios-service.)
// =============================================================================

// Modulos nativos do Node: fs (arquivos) e path (caminhos de arquivo).
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

// Roda o init.sql toda vez que o servico sobe. O Postgres so executa o
// initdb com o volume vazio, entao tabela nova nao chegaria em banco que ja
// existe. Como e tudo IF NOT EXISTS, rodar de novo nao quebra nada.
//
// Opcoes com valor padrao: 10 tentativas, 2000 ms (2 s) entre elas.
async function migrar({ tentativas = 10, esperaMs = 2000 } = {}) {
  // Le o init.sql que fica na mesma pasta deste arquivo (__dirname).
  const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');

  // Laco "infinito" (;;) que termina com return (sucesso) ou throw (desistiu).
  for (let tentativa = 1; ; tentativa++) {
    try {
      await pool.query(sql);
      return;
    } catch (err) {
      if (tentativa >= tentativas) throw err;
      console.warn(`Banco ainda indisponivel (tentativa ${tentativa}/${tentativas}): ${err.message}`);
      // Pausa de esperaMs milissegundos antes da proxima tentativa.
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
}

module.exports = migrar;
