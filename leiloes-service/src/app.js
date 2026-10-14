// Monta a aplicacao Express. E uma FABRICA: recebe o ambiente
// (config/ambiente.js) e devolve o app, assim os testes criam um app "DEV" e
// outro "HOMOL" no mesmo processo.
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const extrairUsuario = require('./middlewares/extrairUsuario');
const leilaoRoutes = require('./routes/leilaoRoutes');
const criarDocumentoOpenApi = require('./docs/openapi');

function criarApp(ambiente) {
  const app = express();
  app.use(express.json());
  app.use(extrairUsuario);

  // versao e ambiente: o smoke test do pipeline confere que a versao nova subiu
  app.get('/health', (req, res) =>
    res.json({
      status: 'ok',
      service: 'leiloes-service',
      versao: ambiente.versao,
      ambiente: ambiente.nome,
    })
  );

  // Swagger so no DEV (e local). No HOMOL a rota nem existe: cai no 404.
  if (ambiente.swaggerHabilitado) {
    const documento = criarDocumentoOpenApi(ambiente.versao);
    app.get('/docs/openapi.json', (req, res) => res.json(documento));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(documento));
  }

  app.use('/leiloes', leilaoRoutes);

  app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

  return app;
}

module.exports = criarApp;
