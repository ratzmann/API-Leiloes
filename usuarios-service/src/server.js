require('dotenv').config();
const app = require('./app');
const migrar = require('./db/migrar');

const PORT = process.env.PORT || 3002;

migrar()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`usuarios-service ouvindo na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco do usuarios-service:', err.message);
    process.exit(1);
  });
