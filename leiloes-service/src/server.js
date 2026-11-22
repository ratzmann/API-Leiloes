// =============================================================================
// server.js  -  PONTO DE PARTIDA do leiloes-service
// -----------------------------------------------------------------------------
// Mesma sequencia nos 4 servicos:
//   1. carrega as variaveis de ambiente e o ambiente (DEV, HOMOL...);
//   2. roda a migracao (cria a tabela leiloes, se ainda nao existir, a partir
//      do init.sql);
//   3. so entao abre a porta HTTP;
//   4. ao receber SIGTERM, encerra com calma (utils/encerramento.js).
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
// pool do banco (fechado no encerramento) e o tratamento do SIGTERM do Kubernetes
const pool = require('./config/db');
const { prepararEncerramento } = require('./utils/encerramento');

const ambiente = carregarAmbiente();
// Porta: a da variavel de ambiente (o Render define PORT) ou, se nao houver, 3003.
const PORT = process.env.PORT || 3003;

// Promise com .then (sucesso) e .catch (erro): so abre a porta depois que a
// tabela existe.
migrar()
  .then(() => {
    const servidor = criarApp(ambiente).listen(PORT, () => {
      console.log(
        `leiloes-service ${ambiente.versao} (${ambiente.nome}) ouvindo na porta ${PORT}` +
          ` - swagger ${ambiente.swaggerHabilitado ? 'em /docs' : 'desligado'}`
      );
    });
    // SIGTERM (Kubernetes, Docker, Render) ou Ctrl+C: termina as requisicoes em
    // andamento, fecha o banco e sai, em vez de esperar 30 s e ser morto a forca
    prepararEncerramento(servidor, pool);
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco do leiloes-service:', err.message);
    process.exit(1);
  });
