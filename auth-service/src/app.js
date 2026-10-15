// =============================================================================
// app.js  -  MONTAGEM da aplicacao Express do auth-service
// -----------------------------------------------------------------------------
// Express e a biblioteca que transforma o Node.js num servidor web.
// Aqui dizemos a ele:
//   - como ler o corpo das requisicoes (JSON);
//   - quais rotas existem (/health, /metrics, /docs e routes/authRoutes.js);
//   - o que responder quando ninguem conhece a rota pedida (404);
//   - como responder os erros (middlewares/tratarErros.js).
//
// E uma FABRICA: criarApp(ambiente) recebe o ambiente (config/ambiente.js) e
// devolve o app. Assim os testes criam um app "DEV" e outro "HOMOL" no mesmo
// processo, e o server.js cria o app de verdade.
//
// Caminho de uma requisicao dentro deste servico:
//   Kong -> app.js -> routes/authRoutes.js -> controllers/authController.js
//        -> services/authService.js -> repositories/usuarioRepository.js -> Postgres
// =============================================================================

// Importa a biblioteca Express (instalada via npm, listada no package.json).
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const criarTratadorDeErros = require('./middlewares/tratarErros');
// Importa o "roteador" com as rotas deste servico (/registrar e /login).
const authRoutes = require('./routes/authRoutes');
const criarDocumentoOpenApi = require('./docs/openapi');
const metricas = require('./observabilidade/metricas');

/**
 * Monta e devolve a aplicacao Express.
 * Recebe `ambiente` ({ nome, versao, swaggerHabilitado }, de carregarAmbiente()).
 */
function criarApp(ambiente) {
  // Cria a aplicacao. A partir daqui "app" representa o nosso servidor.
  const app = express();

  // Rotulos ambiente/versao em todas as metricas + medicao de cada requisicao.
  metricas.definirRotulosPadrao({ ambiente: ambiente.nome, versao: ambiente.versao });
  app.use(metricas.medirRequisicoes);

  // app.use(...) registra um MIDDLEWARE: uma funcao que roda em TODA requisicao,
  // antes de ela chegar na rota. express.json() le o corpo da requisicao (texto
  // JSON) e o transforma em objeto JavaScript, disponivel em req.body.
  app.use(express.json());

  // Healthcheck com versao e ambiente: o smoke test do pipeline confere que a
  // versao nova subiu. Pelo Kong: GET /auth/health.
  app.get('/health', (req, res) =>
    res.json({
      status: 'ok',
      service: 'auth-service',
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

  // Pendura as rotas na raiz '/'. O Kong recebe "/auth/login" e, por causa do
  // strip_path: true (ver kong/kong.yml), repassa so "/login" para ca.
  app.use('/', authRoutes);

  // Ultimo middleware: se nenhuma rota acima respondeu, a requisicao cai aqui.
  // Status 404 = "Not Found" (recurso nao encontrado).
  app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

  // Middleware de ERRO (4 parametros): recebe o que os controllers passam em
  // next(err) e responde sempre no formato { erro } (ver middlewares/tratarErros.js).
  // Precisa vir DEPOIS das rotas.
  app.use(criarTratadorDeErros('autenticacao'));

  return app;
}

// module.exports define o que este arquivo "entrega" para quem fizer require.
// O server.js importa esta fabrica para colocar o app no ar.
module.exports = criarApp;
