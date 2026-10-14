// Metricas no formato do Prometheus (biblioteca prom-client).
// O Prometheus le GET /metrics a cada 15 s e o Grafana desenha os graficos
// (ver a pasta observabilidade/ na raiz do servico).
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

// Rotulos fixos em TODAS as metricas: de qual servico, ambiente e versao vieram.
function definirRotulosPadrao({ ambiente, versao }) {
  registro.setDefaultLabels({ service: 'leiloes-service', ambiente, versao });
}

// Usa o PADRAO da rota (/leiloes/:id), nunca a URL real (/leiloes/42): cada id
// diferente criaria uma serie nova no Prometheus ("explosao de cardinalidade").
function rotaDaRequisicao(req) {
  if (req.route && req.route.path) {
    const caminho = req.route.path === '/' ? '' : req.route.path;
    return `${req.baseUrl || ''}${caminho}` || '/';
  }
  if ((req.originalUrl || '').startsWith('/docs')) return '/docs';
  return 'nao_encontrada';
}

// Middleware: mede cada requisicao quando a resposta termina ('finish').
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

async function responderMetricas(req, res) {
  res.set('Content-Type', registro.contentType);
  res.end(await registro.metrics());
}

function registrarLeilaoCadastrado() {
  leiloesCadastrados.inc();
}

function registrarMudancaStatus(status) {
  mudancasStatus.inc({ status });
}

module.exports = {
  registro,
  definirRotulosPadrao,
  rotaDaRequisicao,
  medirRequisicoes,
  responderMetricas,
  registrarLeilaoCadastrado,
  registrarMudancaStatus,
};
