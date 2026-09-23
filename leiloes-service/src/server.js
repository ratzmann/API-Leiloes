// =============================================================================
// server.js  -  PONTO DE PARTIDA do leiloes-service
// -----------------------------------------------------------------------------
// Carrega as variaveis de ambiente e abre a porta HTTP.
// Obs.: diferente de usuarios e lances, este servico NAO roda migrar() ao
// subir: as tabelas vem so do init.sql executado pelo Postgres na primeira vez.
// =============================================================================

// Le o arquivo .env (quando existir) para dentro de process.env.
require('dotenv').config();
// A aplicacao Express montada em app.js.
const app = require('./app');

// Porta: a da variavel de ambiente ou, se nao houver, 3003.
const PORT = process.env.PORT || 3003;

// Abre a porta e avisa no log quando estiver pronto.
app.listen(PORT, () => {
  console.log(`leiloes-service ouvindo na porta ${PORT}`);
});
