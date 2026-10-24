// =============================================================================
// observabilidade/metricas.js  -  METRICAS do leiloes-service para o Prometheus
// -----------------------------------------------------------------------------
// T2 (observabilidade). Usa a biblioteca prom-client. O Prometheus le
// GET /metrics a cada 15 s e o Grafana desenha os graficos (ver a pasta
// observabilidade/ na raiz do servico).
//
// Tres grupos de metricas, todas com o prefixo leiloes_:
//   1. do processo Node (CPU, memoria, event loop), coletadas sozinhas;
//   2. HTTP: quantas requisicoes e quanto tempo, por metodo, rota e status;
//   3. de NEGOCIO:
//        leiloes_cadastrados_total               leiloes cadastrados com sucesso;
//        leiloes_mudancas_status_total{status}   mudancas de status aceitas.
//      Cada serie de negocio ja nasce com zero (comecarEmZero), para o Grafana
//      contar desde a primeira ocorrencia.
//
// Quem chama: app.js (middlewares e GET /metrics) e services/leilaoService.js (contadores).
// =============================================================================

const client = require('prom-client');

// Registro proprio (em vez do global) pra controlar exatamente o que e exposto.
const registro = new client.Registry();
// CPU, memoria, event loop, GC... do Node, com prefixo leiloes_
client.collectDefaultMetrics({ register: registro, prefix: 'leiloes_' });

const ROTULOS_HTTP = ['metodo', 'rota', 'status'];

const requisicoesHttp = new client.Counter({
  name: 'leiloes_http_requisicoes_total',
  help: 'Total de requisicoes HTTP atendidas pelo leiloes-service',
  labelNames: ROTULOS_HTTP,
  registers: [registro],
});

const duracaoHttp = new client.Histogram({
  name: 'leiloes_http_duracao_segundos',
  help: 'Tempo de resposta das requisicoes HTTP, em segundos',
  labelNames: ROTULOS_HTTP,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registro],
});

const leiloesCadastrados = new client.Counter({
  name: 'leiloes_cadastrados_total',
  help: 'Leiloes cadastrados com sucesso',
  registers: [registro],
});

const mudancasStatus = new client.Counter({
  name: 'leiloes_mudancas_status_total',
  help: 'Mudancas de status de leilao, pelo status de destino',
  labelNames: ['status'],
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

comecarEmZero(mudancasStatus, 'status', ['ABERTO', 'ENCERRADO', 'CANCELADO']);

/**
 * Rotulos fixos em TODAS as metricas: de qual servico, ambiente e versao vieram.
 * Recebe { ambiente, versao } (de config/ambiente.js).
 */
function definirRotulosPadrao({ ambiente, versao }) {
  registro.setDefaultLabels({ service: 'leiloes-service', ambiente, versao });
}

/**
 * Devolve o PADRAO da rota (/leiloes/:id), nunca a URL real (/leiloes/42):
 * cada id diferente criaria uma serie nova no Prometheus
 * ("explosao de cardinalidade"). Sem rota (404) devolve 'nao_encontrada'.
 */
function rotaDaRequisicao(req) {
  if (req.route && req.route.path) {
    const caminho = req.route.path === '/' ? '' : req.route.path;
    return `${req.baseUrl || req.prefixoDaRota || ''}${caminho}` || '/';
  }
  if ((req.originalUrl || '').startsWith('/docs')) return '/docs';
  return 'nao_encontrada';
}

/**
 * Middleware que guarda o prefixo do router (ex.: /leiloes) na requisicao.
 * Quando um erro sai do router por next(err), o Express apaga o req.baseUrl
 * antes de a resposta terminar; sem isto a rota medida seria "/:id" em vez de
 * "/leiloes/:id". Uso no app.js: app.use('/leiloes', lembrarPrefixo, rotas).
 */
function lembrarPrefixo(req, res, next) {
  req.prefixoDaRota = req.baseUrl;
  next();
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
 * Conta um leilao cadastrado com sucesso.
 */
function registrarLeilaoCadastrado() {
  leiloesCadastrados.inc();
}

/**
 * Conta uma mudanca de status aceita, pelo status de destino
 * (ABERTO, ENCERRADO ou CANCELADO).
 */
function registrarMudancaStatus(status) {
  mudancasStatus.inc({ status });
}

module.exports = {
  registro,
  definirRotulosPadrao,
  rotaDaRequisicao,
  lembrarPrefixo,
  medirRequisicoes,
  responderMetricas,
  registrarLeilaoCadastrado,
  registrarMudancaStatus,
};
