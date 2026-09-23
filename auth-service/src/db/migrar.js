// =============================================================================
// db/migrar.js  -  PREPARA o banco quando o servico inicia ("migracao")
// -----------------------------------------------------------------------------
// Le o arquivo init.sql e o executa no banco. Tambem trata um problema comum
// no Docker: o container do servico pode subir ANTES de o Postgres estar
// pronto para aceitar conexoes. Por isso tentamos varias vezes, esperando um
// pouco entre as tentativas ("retry").
// Quem chama: server.js, antes de abrir a porta HTTP.
// (Arquivo identico nos 4 servicos: cada microsservico tem a sua copia.)
// =============================================================================

// fs (file system) = modulo nativo do Node para ler/escrever arquivos.
const fs = require('fs');
// path = modulo nativo para montar caminhos de arquivo sem se preocupar com / ou \.
const path = require('path');
const pool = require('../config/db');

/**
 * Roda o init.sql toda vez que o servico sobe. O Postgres so executa o
 * initdb com o volume vazio, entao tabela nova nao chegaria em banco que ja
 * existe. Como e tudo IF NOT EXISTS, rodar de novo nao quebra nada.
 *
 * Parametros com valor padrao: { tentativas = 10, esperaMs = 2000 } = {}
 * significa "recebo um objeto de opcoes; se nao vier nada, uso 10 tentativas
 * com 2 segundos (2000 ms) de espera".
 * Termina sem devolver nada quando o SQL roda; se o banco nao responder em
 * nenhuma tentativa, lanca o erro da ultima.
 */
async function migrar({ tentativas = 10, esperaMs = 2000 } = {}) {
  // __dirname = pasta onde este arquivo esta (src/db). readFileSync le o
  // arquivo inteiro como texto ('utf8').
  const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');

  // for sem condicao de parada (;;): o laco so termina pelo `return`
  // (deu certo) ou pelo `throw` (acabaram as tentativas).
  for (let tentativa = 1; ; tentativa++) {
    try {
      await pool.query(sql);
      return;
    } catch (err) {
      if (tentativa >= tentativas) throw err;
      console.warn(`Banco ainda indisponivel (tentativa ${tentativa}/${tentativas}): ${err.message}`);
      // "Dormir" esperaMs milissegundos: cria uma Promise que so se resolve
      // quando o setTimeout disparar, e o await espera por ela.
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
}

module.exports = migrar;
