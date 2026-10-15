// Metricas no formato do Prometheus (biblioteca prom-client).
// O Prometheus le GET /metrics a cada 15 s e o Grafana desenha os graficos
// (ver a pasta observabilidade/ na raiz do servico).
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

// Rotulos fixos em TODAS as metricas: de qual servico, ambiente e versao vieram.
function definirRotulosPadrao({ ambiente, versao }) {
  registro.setDefaultLabels({ service: 'auth-service', ambiente, versao });
}

// Usa o PADRAO da rota registrada no Express, nunca a URL real: cada URL
// diferente (ex.: /qualquer-coisa) criaria uma serie nova no Prometheus
// ("explosao de cardinalidade").
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

// papel: 'LEILOEIRO' | 'LICITANTE'
function registrarRegistro(papel) {
  registros.inc({ papel });
}

// resultado: 'sucesso' | 'falha'
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
