// =============================================================================
// app.js  -  MONTAGEM da aplicacao Express do usuarios-service
// -----------------------------------------------------------------------------
// Este servico cuida de dois "cadastros de dominio":
//   - LEILOEIROS  (quem conduz o leilao)          -> /leiloeiros
//   - LICITANTES  (quem da lances), com o CREDITO -> /licitantes
// e uma rota INTERNA de reservas (so para outros servicos) -> /reservas
//
// E uma FABRICA: criarApp(ambiente) recebe o ambiente (config/ambiente.js) e
// devolve o app. Assim os testes criam um app "DEV" e outro "HOMOL" no mesmo
// processo, e o server.js cria o app de verdade.
//
// Ordem dos middlewares (a ordem importa! o Express executa de cima para baixo):
//   1. metricas         -> mede cada requisicao para o Prometheus;
//   2. express.json()   -> transforma o corpo JSON em req.body;
//   3. extrairUsuario   -> le o token JWT e guarda quem esta logado;
//   4. /health, /metrics e /docs (este so no DEV);
//   5. as rotas;
//   6. o "pega tudo" do 404;
//   7. o tratamento de erros.
// =============================================================================

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const criarTratadorDeErros = require('./middlewares/tratarErros');
const extrairUsuario = require('./middlewares/extrairUsuario');
const leiloeiroRoutes = require('./routes/leiloeiroRoutes');
const licitanteRoutes = require('./routes/licitanteRoutes');
const reservaRoutes = require('./routes/reservaRoutes');
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

  app.use(express.json());
  app.use(extrairUsuario);

  // Healthcheck com versao e ambiente: o smoke test do pipeline confere que a
  // versao nova subiu.
  app.get('/health', (req, res) =>
    res.json({
      status: 'ok',
      service: 'usuarios-service',
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

  // Tudo que comeca com /leiloeiros vai para o roteador de leiloeiros, e assim por
  // diante. Dentro do roteador os caminhos sao relativos (ex.: '/:id').
  // lembrarPrefixo guarda o prefixo para as metricas (ver observabilidade/metricas.js).
  app.use('/leiloeiros', metricas.lembrarPrefixo, leiloeiroRoutes);
  app.use('/licitantes', metricas.lembrarPrefixo, licitanteRoutes);
  // Interna: o Kong nao tem rota /reservas, entao so a rede do Docker alcanca.
  app.use('/reservas', metricas.lembrarPrefixo, reservaRoutes);

  // Nenhuma rota atendeu: 404.
  app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

  // Middleware de ERRO (4 parametros): recebe o que os controllers passam em
  // next(err) e responde sempre no formato { erro } (ver middlewares/tratarErros.js).
  // Precisa vir DEPOIS das rotas.
  app.use(criarTratadorDeErros('usuarios'));

  return app;
}

module.exports = criarApp;
