// =============================================================================
// server.js  -  PONTO DE PARTIDA do lances-service
// -----------------------------------------------------------------------------
// Mesma sequencia nos 4 servicos:
//   1. carrega as variaveis de ambiente e o ambiente (DEV, HOMOL...);
//   2. roda a migracao (cria/atualiza as tabelas lances e sagas_lance);
//   3. so entao abre a porta HTTP.
// Se o banco nao ficar pronto, encerra com erro (exit 1): no Render o container
// e reiniciado e o erro aparece no log.
// =============================================================================

// Le o arquivo .env (quando existir) para dentro de process.env.
require('dotenv').config();
// criarApp(ambiente) monta a aplicacao Express (ver app.js).
const criarApp = require('./app');
// carregarAmbiente() le APP_ENV, versao da imagem, Swagger ligado ou nao.
const { carregarAmbiente } = require('./config/ambiente');
// migrar() executa o db/init.sql no banco, com novas tentativas se preciso.
const migrar = require('./db/migrar');

const ambiente = carregarAmbiente();
// Porta 3003 (a mesma do leiloes-service, mas cada um roda no SEU container,
// entao nao ha conflito: cada container tem o seu proprio endereco na rede do
// Docker - leiloes-service:3003 e lances-service:3003). No Render a porta vem
// da variavel PORT.
const PORT = process.env.PORT || 3003;

// Promise com .then (sucesso) e .catch (erro): so abre a porta depois que as
// tabelas existem.
migrar()
  .then(() => {
    criarApp(ambiente).listen(PORT, () => {
      console.log(
        `lances-service ${ambiente.versao} (${ambiente.nome}) ouvindo na porta ${PORT}` +
          ` - swagger ${ambiente.swaggerHabilitado ? 'em /docs' : 'desligado'}`
      );
    });
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco do lances-service:', err.message);
    process.exit(1);
  });
