// =============================================================================
// server.js  -  PONTO DE PARTIDA do usuarios-service
// -----------------------------------------------------------------------------
// Primeiro arquivo executado quando o container sobe (CMD do Dockerfile).
// Mesma sequencia nos 4 servicos:
//   1. carregar as variaveis de ambiente e o ambiente (DEV, HOMOL...);
//   2. rodar a "migracao" (criar/atualizar as tabelas do banco);
//   3. so entao abrir a porta HTTP.
// Se o banco nao ficar pronto, o processo encerra com erro (exit 1) e o
// Docker (ou o Render) mostra a falha, em vez de subir um servico "meio quebrado".
// =============================================================================

// Le o arquivo .env (quando existir) para dentro de process.env.
require('dotenv').config();
// criarApp(ambiente) monta a aplicacao Express (ver app.js).
const criarApp = require('./app');
// carregarAmbiente() le APP_ENV, versao da imagem, Swagger ligado ou nao.
const { carregarAmbiente } = require('./config/ambiente');
// migrar() executa o arquivo db/init.sql no banco (ver db/migrar.js).
const migrar = require('./db/migrar');

const ambiente = carregarAmbiente();
// Porta: a da variavel de ambiente (o Render define PORT) ou, se nao houver, 3002.
const PORT = process.env.PORT || 3002;

// migrar() devolve uma PROMISE: um "vale" de um resultado que chegara no futuro.
//   .then(fn)  -> roda fn quando a promise der certo;
//   .catch(fn) -> roda fn se ela der errado.
// (E o mesmo que usar await dentro de try/catch, so que em outro estilo.)
// So abre a porta depois que as tabelas existem.
migrar()
  .then(() => {
    criarApp(ambiente).listen(PORT, () => {
      console.log(
        `usuarios-service ${ambiente.versao} (${ambiente.nome}) ouvindo na porta ${PORT}` +
          ` - swagger ${ambiente.swaggerHabilitado ? 'em /docs' : 'desligado'}`
      );
    });
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco do usuarios-service:', err.message);
    // Encerra o processo Node com codigo 1 (convencao para "terminou com erro").
    process.exit(1);
  });
