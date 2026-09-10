require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3003;

app.listen(PORT, () => {
  console.log(`leiloes-service ouvindo na porta ${PORT}`);
});
