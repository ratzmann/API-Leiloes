require('dotenv').config();
const criarApp = require('./app');
const { carregarAmbiente } = require('./config/ambiente');

const ambiente = carregarAmbiente();
const PORT = process.env.PORT || 3003;

criarApp(ambiente).listen(PORT, () => {
  console.log(
    `leiloes-service ${ambiente.versao} (${ambiente.nome}) ouvindo na porta ${PORT}` +
      ` - swagger ${ambiente.swaggerHabilitado ? 'em /docs' : 'desligado'}`
  );
});
