require('dotenv').config();
const app = require('./app');
const migrar = require('./db/migrar');

const PORT = process.env.PORT || 3003;

migrar()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`lances-service ouvindo na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco do lances-service:', err.message);
    process.exit(1);
  });
