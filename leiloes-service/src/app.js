// Monta a aplicacao Express. E uma FABRICA: recebe o ambiente
// (config/ambiente.js) e devolve o app, assim os testes criam um app "DEV" e
// outro "HOMOL" no mesmo processo.
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const extrairUsuario = require('./middlewares/extrairUsuario');
const leilaoRoutes = require('./routes/leilaoRoutes');
const criarDocumentoOpenApi = require('./docs/openapi');
const metricas = require('./observabilidade/metricas');

function criarApp(ambiente) {
  const app = express();

  // rotulos ambiente/versao em todas as metricas + medicao de cada requisicao
  metricas.definirRotulosPadrao({ ambiente: ambiente.nome, versao: ambiente.versao });
  app.use(metricas.medirRequisicoes);

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

  // lido pelo Prometheus (ver observabilidade/prometheus/prometheus.yml)
  app.get('/metrics', metricas.responderMetricas);

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
