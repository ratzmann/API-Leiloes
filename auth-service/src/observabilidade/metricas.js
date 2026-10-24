// =============================================================================
// observabilidade/metricas.js  -  METRICAS do auth-service para o Prometheus
// -----------------------------------------------------------------------------
// T2 (observabilidade). Usa a biblioteca prom-client. O Prometheus le
// GET /metrics a cada 15 s e o Grafana desenha os graficos (ver a pasta
// observabilidade/ na raiz do servico).
//
// Tres grupos de metricas, todas com o prefixo auth_:
//   1. do processo Node (CPU, memoria, event loop), coletadas sozinhas;
//   2. HTTP: quantas requisicoes e quanto tempo, por metodo, rota e status;
//   3. de NEGOCIO:
//        auth_registros_total{papel}   registros feitos com sucesso;
//        auth_logins_total{resultado}  logins com sucesso ou com credencial errada.
//      Cada serie de negocio ja nasce com zero (comecarEmZero), para o Grafana
//      contar desde a primeira ocorrencia.
//
// Quem chama: app.js (middlewares e GET /metrics) e services/authService.js (contadores).
// =============================================================================

const client = require('prom-client');

// Registro proprio (em vez do global) pra controlar exatamente o que e exposto.
const registro = new client.Registry();
// CPU, memoria, event loop, GC... do Node, com prefixo auth_
client.collectDefaultMetrics({ register: registro, prefix: 'auth_' });

const ROTULOS_HTTP = ['metodo', 'rota', 'status'];

const requisicoesHttp = new client.Counter({
  name: 'auth_http_requisicoes_total',
  help: 'Total de requisicoes HTTP atendidas pelo auth-service',
  labelNames: ROTULOS_HTTP,
  registers: [registro],
});

const duracaoHttp = new client.Histogram({
  name: 'auth_http_duracao_segundos',
  help: 'Tempo de resposta das requisicoes HTTP, em segundos',
  labelNames: ROTULOS_HTTP,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registro],
});

const registros = new client.Counter({
  name: 'auth_registros_total',
  help: 'Usuarios registrados com sucesso, por papel',
  labelNames: ['papel'],
  registers: [registro],
});

const logins = new client.Counter({
  name: 'auth_logins_total',
  help: 'Tentativas de login, por resultado',
  labelNames: ['resultado'],
  registers: [registro],
});

/**
 * Cria a serie de cada valor conhecido do rotulo ja com ZERO. Sem isto, a serie
 * so nasce no primeiro .inc(), e o increase() do Prometheus nao enxerga esse
 * primeiro incremento (nao ha leitura anterior para comparar): os paineis
 * "no periodo" do Grafana mostrariam 0 ate a segunda ocorrencia.
 * Recebe o contador, o nome do rotulo e a lista de valores possiveis.
 */
function comecarEmZero(contador, rotulo, valores) {
  valores.forEach((valor) => contador.inc({ [rotulo]: valor }, 0));
}

comecarEmZero(registros, 'papel', ['LEILOEIRO', 'LICITANTE']);
comecarEmZero(logins, 'resultado', ['sucesso', 'falha']);

/**
 * Rotulos fixos em TODAS as metricas: de qual servico, ambiente e versao vieram.
 * Recebe { ambiente, versao } (de config/ambiente.js).
 */
function definirRotulosPadrao({ ambiente, versao }) {
  registro.setDefaultLabels({ service: 'auth-service', ambiente, versao });
}

/**
 * Devolve o PADRAO da rota registrada no Express, nunca a URL real: cada URL
 * diferente (ex.: /qualquer-coisa) criaria uma serie nova no Prometheus
 * ("explosao de cardinalidade"). Sem rota (404) devolve 'nao_encontrada'.
 */
function rotaDaRequisicao(req) {
  if (req.route && req.route.path) {
    const caminho = req.route.path === '/' ? '' : req.route.path;
    return `${req.baseUrl || ''}${caminho}` || '/';
  }
  if ((req.originalUrl || '').startsWith('/docs')) return '/docs';
  return 'nao_encontrada';
}

/**
 * Middleware que mede cada requisicao quando a resposta termina ('finish'):
 * conta a requisicao e registra quanto tempo ela levou.
 */
function medirRequisicoes(req, res, next) {
  // a leitura do proprio Prometheus nao conta como trafego da aplicacao
  if (req.path === '/metrics') return next();

  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const rotulos = {
      metodo: req.method,
      rota: rotaDaRequisicao(req),
      status: String(res.statusCode),
    };
    requisicoesHttp.inc(rotulos);
    duracaoHttp.observe(rotulos, Number(process.hrtime.bigint() - inicio) / 1e9);
  });
  return next();
}

/**
 * GET /metrics: responde todas as metricas no formato de texto do Prometheus.
 */
async function responderMetricas(req, res) {
  res.set('Content-Type', registro.contentType);
  res.end(await registro.metrics());
}

/**
 * Conta um registro feito com sucesso, pelo papel: 'LEILOEIRO' | 'LICITANTE'.
 */
function registrarRegistro(papel) {
  registros.inc({ papel });
}

/**
 * Conta um login pelo resultado: 'sucesso' | 'falha' (credencial errada ou faltando;
 * erro de infraestrutura, como banco fora do ar, nao conta).
 */
function registrarLogin(resultado) {
  logins.inc({ resultado });
}

module.exports = {
  registro,
  definirRotulosPadrao,
  rotaDaRequisicao,
  medirRequisicoes,
  responderMetricas,
  registrarRegistro,
  registrarLogin,
};
