// =============================================================================
// app.js  -  MONTAGEM da aplicacao Express do leiloes-service
// -----------------------------------------------------------------------------
// Este servico cuida do LEILAO (o evento/pregao): lote de bois, valores,
// periodo e ciclo de vida (AGENDADO -> ABERTO -> ENCERRADO, ou CANCELADO).
//
// Middlewares em ordem: JSON -> extrairUsuario -> rotas -> 404.
// =============================================================================

const express = require('express');
const extrairUsuario = require('./middlewares/extrairUsuario');
const leilaoRoutes = require('./routes/leilaoRoutes');

const app = express();
// Converte o corpo JSON das requisicoes em objeto (req.body).
app.use(express.json());
// Decodifica o token JWT (se houver) em req.usuarioAutenticado.
app.use(extrairUsuario);

// Healthcheck.
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'leiloes-service' }));
// Todas as rotas de leilao ficam sob /leiloes.
app.use('/leiloes', leilaoRoutes);

// Nenhuma rota atendeu: 404.
app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

module.exports = app;
