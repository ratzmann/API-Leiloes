// =============================================================================
// server.js  -  PONTO DE PARTIDA do lances-service
// -----------------------------------------------------------------------------
// Mesma ideia do usuarios-service:
//   1. carrega as variaveis de ambiente;
//   2. roda a migracao (cria/atualiza as tabelas lances e sagas_lance);
//   3. so entao abre a porta HTTP.
// Se o banco nao ficar pronto, encerra com erro (exit 1).
// =============================================================================

require('dotenv').config();
const app = require('./app');
const migrar = require('./db/migrar');

// Porta 3003 (a mesma do leiloes-service, mas cada um roda no SEU container,
// entao nao ha conflito: cada container tem sua propria rede interna).
const PORT = process.env.PORT || 3003;

// Promise com .then (sucesso) e .catch (erro).
migrar()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`lances-service ouvindo na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco do lances-service:', err.message);
    process.exit(1);
  });
