require('dotenv').config();
const criarApp = require('./app');
const { carregarAmbiente } = require('./config/ambiente');
const migrar = require('./db/migrar');

const ambiente = carregarAmbiente();
const PORT = process.env.PORT || 3001;

// so abre a porta depois que a tabela existe
migrar()
  .then(() => {
    criarApp(ambiente).listen(PORT, () => {
      console.log(
        `auth-service ${ambiente.versao} (${ambiente.nome}) ouvindo na porta ${PORT}` +
          ` - swagger ${ambiente.swaggerHabilitado ? 'em /docs' : 'desligado'}`
      );
    });
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco do auth-service:', err.message);
    process.exit(1);
  });
