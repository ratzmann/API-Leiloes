// =============================================================================
// app.js  -  MONTAGEM da aplicacao Express do lances-service
// -----------------------------------------------------------------------------
// Este servico registra e consulta LANCES. E tambem o ORQUESTRADOR da Saga de
// registro de lance (pasta sagas/), que coordena leiloes-service e
// usuarios-service para que um lance so valha se tudo der certo.
//
// Middlewares em ordem: JSON -> extrairUsuario -> rotas -> 404.
// =============================================================================

const express = require('express');
const extrairUsuario = require('./middlewares/extrairUsuario');
const lanceRoutes = require('./routes/lanceRoutes');

const app = express();
// Corpo JSON -> req.body.
app.use(express.json());
// Token JWT -> req.usuarioAutenticado.
app.use(extrairUsuario);

// Healthcheck.
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'lances-service' }));
// Rotas de lances e de sagas, todas sob /lances.
app.use('/lances', lanceRoutes);

// Nenhuma rota atendeu: 404.
app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

module.exports = app;
