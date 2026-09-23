// =============================================================================
// server.js  -  PONTO DE PARTIDA do leiloes-service
// -----------------------------------------------------------------------------
// Mesma sequencia de usuarios e lances:
//   1. carrega as variaveis de ambiente;
//   2. roda a migracao (cria/atualiza a tabela leiloes a partir do init.sql);
//   3. so entao abre a porta HTTP.
// Se o banco nao ficar pronto, encerra com erro (exit 1).
// =============================================================================

// Le o arquivo .env (quando existir) para dentro de process.env.
require('dotenv').config();
// A aplicacao Express montada em app.js.
const app = require('./app');
// migrar() executa o db/init.sql no banco, com novas tentativas se preciso.
const migrar = require('./db/migrar');

// Porta: a da variavel de ambiente ou, se nao houver, 3003.
const PORT = process.env.PORT || 3003;

// Promise com .then (sucesso) e .catch (erro).
migrar()
  .then(() => {
    // Abre a porta e avisa no log quando estiver pronto.
    app.listen(PORT, () => {
      console.log(`leiloes-service ouvindo na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco do leiloes-service:', err.message);
    process.exit(1);
  });
