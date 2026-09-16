const express = require('express');
const extrairUsuario = require('./middlewares/extrairUsuario');
const lanceRoutes = require('./routes/lanceRoutes');

const app = express();
app.use(express.json());
app.use(extrairUsuario);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'lances-service' }));
app.use('/lances', lanceRoutes);

app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

module.exports = app;
