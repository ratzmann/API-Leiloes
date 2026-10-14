require('dotenv').config();
const criarApp = require('./app');
const { carregarAmbiente } = require('./config/ambiente');
const migrar = require('./db/migrar');

const ambiente = carregarAmbiente();
const PORT = process.env.PORT || 3002;

// so abre a porta depois que as tabelas existem
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
    process.exit(1);
  });
