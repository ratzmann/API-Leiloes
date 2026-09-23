// =============================================================================
// server.js  -  PONTO DE PARTIDA do usuarios-service
// -----------------------------------------------------------------------------
// Primeiro arquivo executado quando o container sobe (CMD do Dockerfile).
// Diferente do auth-service, aqui ha um passo a mais ANTES de abrir a porta:
//   1. carregar variaveis de ambiente;
//   2. rodar a "migracao" (criar/atualizar as tabelas do banco);
//   3. so entao abrir a porta HTTP.
// Se o banco nao ficar pronto, o processo encerra com erro (exit 1) e o
// Docker mostra a falha, em vez de subir um servico "meio quebrado".
// =============================================================================

require('dotenv').config();
const app = require('./app');
// migrar() executa o arquivo db/init.sql no banco (ver db/migrar.js).
const migrar = require('./db/migrar');

const PORT = process.env.PORT || 3002;

// migrar() devolve uma PROMISE: um "vale" de um resultado que chegara no futuro.
//   .then(fn)  -> roda fn quando a promise der certo;
//   .catch(fn) -> roda fn se ela der errado.
// (E o mesmo que usar await dentro de try/catch, so que em outro estilo.)
migrar()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`usuarios-service ouvindo na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco do usuarios-service:', err.message);
    // Encerra o processo Node com codigo 1 (convencao para "terminou com erro").
    process.exit(1);
  });
