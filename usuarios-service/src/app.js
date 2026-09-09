const express = require('express');
const extrairUsuario = require('./middlewares/extrairUsuario');
const leiloeiroRoutes = require('./routes/leiloeiroRoutes');
const licitanteRoutes = require('./routes/licitanteRoutes');

const app = express();
app.use(express.json());
app.use(extrairUsuario);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'usuarios-service' }));
app.use('/leiloeiros', leiloeiroRoutes);
app.use('/licitantes', licitanteRoutes);

app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

module.exports = app;
