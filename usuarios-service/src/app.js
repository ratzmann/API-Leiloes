// =============================================================================
// app.js  -  MONTAGEM da aplicacao Express do usuarios-service
// -----------------------------------------------------------------------------
// Este servico cuida de dois "cadastros de dominio":
//   - LEILOEIROS  (quem conduz o leilao)          -> /leiloeiros
//   - LICITANTES  (quem da lances), com o CREDITO -> /licitantes
// e uma rota INTERNA de reservas (so para outros servicos) -> /reservas
//
// Ordem dos middlewares (a ordem importa! o Express executa de cima para baixo):
//   1. express.json()   -> transforma o corpo JSON em req.body;
//   2. extrairUsuario   -> le o token JWT e guarda quem esta logado;
//   3. as rotas;
//   4. o "pega tudo" do 404.
// =============================================================================

const express = require('express');
const extrairUsuario = require('./middlewares/extrairUsuario');
const leiloeiroRoutes = require('./routes/leiloeiroRoutes');
const licitanteRoutes = require('./routes/licitanteRoutes');
const reservaRoutes = require('./routes/reservaRoutes');

const app = express();
app.use(express.json());
app.use(extrairUsuario);

// Healthcheck: rota simples para saber se o servico esta de pe.
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'usuarios-service' }));
// Tudo que comeca com /leiloeiros vai para o roteador de leiloeiros, e assim por
// diante. Dentro do roteador os caminhos sao relativos (ex.: '/:id').
app.use('/leiloeiros', leiloeiroRoutes);
app.use('/licitantes', licitanteRoutes);
// Interna: o Kong nao tem rota /reservas, entao so a rede do Docker alcanca.
app.use('/reservas', reservaRoutes);

// Nenhuma rota atendeu: 404.
app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

module.exports = app;
