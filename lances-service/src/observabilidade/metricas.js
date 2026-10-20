// =============================================================================
// observabilidade/metricas.js  -  METRICAS do lances-service para o Prometheus
// -----------------------------------------------------------------------------
// T2 (observabilidade). Usa a biblioteca prom-client. O Prometheus le
// GET /metrics a cada 15 s e o Grafana desenha os graficos (ver a pasta
// observabilidade/ na raiz do servico).
//
// Tres grupos de metricas, todas com o prefixo lances_:
//   1. do processo Node (CPU, memoria, event loop), coletadas sozinhas;
//   2. HTTP: quantas requisicoes e quanto tempo, por metodo, rota e status;
//   3. de NEGOCIO, da Saga de registro de lance:
//        lances_registrados_total            lances gravados (passo 3 da Saga);
//        lances_sagas_total{status}          status final de cada saga
//                                            (CONCLUIDA, COMPENSADA, FALHOU...);
//        lances_sagas_reprocessadas_total{resultado}
//                                            reprocessamentos do passo 4.
//
// Quem chama: app.js (middlewares e GET /metrics) e sagas/registrarLanceSaga.js
// (contadores de negocio).
// =============================================================================

const client = require('prom-client');

// Registro proprio (em vez do global) pra controlar exatamente o que e exposto.
const registro = new client.Registry();
// CPU, memoria, event loop, GC... do Node, com prefixo lances_
client.collectDefaultMetrics({ register: registro, prefix: 'lances_' });

const ROTULOS_HTTP = ['metodo', 'rota', 'status'];

const requisicoesHttp = new client.Counter({
  name: 'lances_http_requisicoes_total',
  help: 'Total de requisicoes HTTP atendidas pelo lances-service',
  labelNames: ROTULOS_HTTP,
  registers: [registro],
});

const duracaoHttp = new client.Histogram({
  name: 'lances_http_duracao_segundos',
  help: 'Tempo de resposta das requisicoes HTTP, em segundos',
  labelNames: ROTULOS_HTTP,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registro],
});

const lancesRegistrados = new client.Counter({
  name: 'lances_registrados_total',
  help: 'Lances gravados (passo 3 da Saga concluido)',
  registers: [registro],
});

const sagas = new client.Counter({
  name: 'lances_sagas_total',
  help: 'Sagas de registro de lance terminadas, pelo status final',
  labelNames: ['status'],
  registers: [registro],
});

const sagasReprocessadas = new client.Counter({
  name: 'lances_sagas_reprocessadas_total',
  help: 'Reprocessamentos do passo 4 (liberar o credito do superado), pelo resultado',
  labelNames: ['resultado'],
  registers: [registro],
});

/**
 * Rotulos fixos em TODAS as metricas: de qual servico, ambiente e versao vieram.
 * Recebe { ambiente, versao } (de config/ambiente.js).
 */
function definirRotulosPadrao({ ambiente, versao }) {
  registro.setDefaultLabels({ service: 'lances-service', ambiente, versao });
}

/**
 * Devolve o PADRAO da rota (/lances/leilao/:leilaoId), nunca a URL real
 * (/lances/leilao/42): cada id diferente criaria uma serie nova no Prometheus
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
 * Middleware que guarda o prefixo do router (ex.: /lances) na requisicao.
 * Quando um erro sai do router por next(err), o Express apaga o req.baseUrl
 * antes de a resposta terminar; sem isto a rota medida perderia o prefixo
 * (ex.: "/:id" em vez de "/lances/:id"). Uso no app.js:
 * app.use('/lances', lembrarPrefixo, rotas).
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

/** GET /metrics: responde todas as metricas no formato de texto do Prometheus. */
async function responderMetricas(req, res) {
  res.set('Content-Type', registro.contentType);
  res.end(await registro.metrics());
}

/**
 * Conta um lance gravado. A Saga chama no fim da execucao, quando o passo 3
 * (gravar o lance) deu certo - com ou sem pendencia no passo 4.
 */
function registrarLanceGravado() {
  lancesRegistrados.inc();
}

/**
 * Conta uma saga terminada, pelo status final:
 * 'CONCLUIDA' | 'CONCLUIDA_COM_PENDENCIA' | 'FALHOU' | 'COMPENSADA' | 'FALHOU_COMPENSACAO'.
 */
function registrarSaga(status) {
  sagas.inc({ status });
}

/** Conta um reprocessamento do passo 4: resultado 'resolvida' ou 'pendente'. */
function registrarReprocessamento(resultado) {
  sagasReprocessadas.inc({ resultado });
}

module.exports = {
  registro,
  definirRotulosPadrao,
  rotaDaRequisicao,
  lembrarPrefixo,
  medirRequisicoes,
  responderMetricas,
  registrarLanceGravado,
  registrarSaga,
  registrarReprocessamento,
};
