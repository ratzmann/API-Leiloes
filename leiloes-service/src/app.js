const express = require('express');
const extrairUsuario = require('./middlewares/extrairUsuario');
const leilaoRoutes = require('./routes/leilaoRoutes');

const app = express();
app.use(express.json());
app.use(extrairUsuario);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'leiloes-service' }));
app.use('/leiloes', leilaoRoutes);

app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

module.exports = app;
