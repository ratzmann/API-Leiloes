// =============================================================================
// server.js  -  PONTO DE PARTIDA do auth-service
// -----------------------------------------------------------------------------
// E o primeiro arquivo executado quando o container sobe (veja o CMD do
// Dockerfile: `node src/server.js`). Ele tem so duas tarefas:
//   1. carregar as variaveis de ambiente;
//   2. "ligar" o servidor HTTP numa porta, para comecar a receber requisicoes.
//
// Por que separar server.js de app.js?
//   O app.js MONTA a aplicacao (rotas, middlewares), mas NAO abre porta.
//   Assim testes podem importar o app sem subir um servidor de verdade.
// =============================================================================

// dotenv le o arquivo .env (se existir) e coloca cada linha em process.env.
// Ex.: a linha "PORT=3001" do .env vira process.env.PORT === '3001'.
// No Docker as variaveis ja vem do docker-compose.yml, entao o .env e opcional.
require('dotenv').config();

// require() importa outro arquivo JavaScript. Aqui pegamos o "app" do Express
// montado em app.js (o './' significa "nesta mesma pasta").
const app = require('./app');

// Porta em que o servico vai escutar. O operador || funciona como "senao":
// se process.env.PORT nao existir (undefined), usamos 3001 como padrao.
const PORT = process.env.PORT || 3001;

// app.listen abre a porta e fica esperando requisicoes indefinidamente.
// A funcao passada como segundo argumento (um "callback") roda uma unica vez,
// assim que o servidor estiver pronto. A crase (`) cria uma "template string",
// que permite colocar variaveis dentro do texto com ${...}.
app.listen(PORT, () => {
  console.log(`auth-service ouvindo na porta ${PORT}`);
});
