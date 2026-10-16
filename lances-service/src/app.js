// =============================================================================
// app.js  -  MONTAGEM da aplicacao Express do lances-service
// -----------------------------------------------------------------------------
// Este servico registra e consulta LANCES. E tambem o ORQUESTRADOR da Saga de
// registro de lance (pasta sagas/), que coordena leiloes-service e
// usuarios-service para que um lance so valha se tudo der certo.
//
// E uma FABRICA (T2): criarApp(ambiente) recebe o ambiente (config/ambiente.js)
// e devolve o app. Assim os testes criam um app "DEV" e outro "HOMOL" no mesmo
// processo, e o server.js cria o app de verdade.
//
// Middlewares em ordem: metricas -> JSON -> extrairUsuario -> /health,
// /metrics, /docs (so DEV) -> rotas -> 404 -> tratamento de erros.
//
// Quem chama: server.js (e os testes)
// Quem e chamado: routes/lanceRoutes.js, middlewares/ (extrairUsuario e
//                 tratarErros), observabilidade/metricas.js, docs/openapi.js
// =============================================================================

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const criarTratadorDeErros = require('./middlewares/tratarErros');
const extrairUsuario = require('./middlewares/extrairUsuario');
const lanceRoutes = require('./routes/lanceRoutes');
const criarDocumentoOpenApi = require('./docs/openapi');
const metricas = require('./observabilidade/metricas');

/**
 * Monta e devolve a aplicacao Express.
 * Recebe `ambiente` ({ nome, versao, swaggerHabilitado }, de carregarAmbiente()).
 */
function criarApp(ambiente) {
  const app = express();

  // Rotulos ambiente/versao em todas as metricas + medicao de cada requisicao.
  metricas.definirRotulosPadrao({ ambiente: ambiente.nome, versao: ambiente.versao });
  app.use(metricas.medirRequisicoes);

  // Corpo JSON -> req.body.
  app.use(express.json());
  // Token JWT -> req.usuarioAutenticado.
  app.use(extrairUsuario);

  // Healthcheck com versao e ambiente: o smoke test do pipeline confere que a
  // versao nova subiu.
  app.get('/health', (req, res) =>
    res.json({
      status: 'ok',
      service: 'lances-service',
      versao: ambiente.versao,
      ambiente: ambiente.nome,
    })
  );

  // Lido pelo Prometheus (ver observabilidade/prometheus/prometheus.yml).
  app.get('/metrics', metricas.responderMetricas);

  // Swagger so no DEV (e local). No HOMOL a rota nem existe: cai no 404.
  if (ambiente.swaggerHabilitado) {
    const documento = criarDocumentoOpenApi(ambiente.versao);
    app.get('/docs/openapi.json', (req, res) => res.json(documento));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(documento));
  }

  // Rotas de lances e de sagas, todas sob /lances (lembrarPrefixo: ver metricas.js).
  app.use('/lances', metricas.lembrarPrefixo, lanceRoutes);

  // Nenhuma rota atendeu: 404.
  app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

  // Middleware de ERRO (4 parametros): recebe o que os controllers passam em
  // next(err) e responde sempre no formato { erro } (ver middlewares/tratarErros.js).
  // Precisa vir DEPOIS das rotas.
  app.use(criarTratadorDeErros('lances'));

  return app;
}

module.exports = criarApp;
