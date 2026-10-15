// =============================================================================
// db/migrar.js  -  PREPARA o banco quando o servico inicia ("migracao")
// -----------------------------------------------------------------------------
// Le o arquivo init.sql e o executa no banco. No docker-compose o Postgres ja
// roda o init.sql sozinho (so com o volume vazio), mas na nuvem (Render/Neon) o
// banco e gerenciado e chega vazio: alguem precisa criar as tabelas. Como o SQL
// e todo IF NOT EXISTS, rodar a cada inicio nao estraga nada.
//
// Tambem trata um problema comum: o servico pode subir ANTES de o banco estar
// pronto (ou acordando, no plano gratuito). Por isso tentamos varias vezes,
// esperando um pouco entre as tentativas ("retry").
// Quem chama: server.js, antes de abrir a porta HTTP.
// (Arquivo identico nos 4 servicos: cada microsservico tem a sua copia.)
// =============================================================================

// fs (file system) = modulo nativo do Node para ler/escrever arquivos.
const fs = require('fs');
// path = modulo nativo para montar caminhos de arquivo sem se preocupar com / ou \.
const path = require('path');
const pool = require('../config/db');

/**
 * "Dorme" `ms` milissegundos: cria uma Promise que so se resolve quando o
 * setTimeout disparar; quem faz `await esperar(...)` fica parado ate la.
 */
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Roda o init.sql no banco, com novas tentativas.
 * Parametros com valor padrao: { tentativas = 10, esperaMs = 2000, banco = pool } = {}
 * significa "recebo um objeto de opcoes; se nao vier nada, uso 10 tentativas
 * com 2 segundos (2000 ms) de espera, no pool de verdade" (os testes passam um
 * banco falso em `banco`).
 * Termina sem devolver nada quando o SQL roda; se o banco nao responder em
 * nenhuma tentativa, lanca o erro da ultima.
 */
async function migrar({ tentativas = 10, esperaMs = 2000, banco = pool } = {}) {
  // __dirname = pasta onde este arquivo esta (src/db). readFileSync le o
  // arquivo inteiro como texto ('utf8').
  const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');

  // for sem condicao de parada (;;): o laco so termina pelo `return`
  // (deu certo) ou pelo `throw` (acabaram as tentativas).
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
