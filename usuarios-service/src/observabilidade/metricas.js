// Metricas no formato do Prometheus (biblioteca prom-client).
// O Prometheus le GET /metrics a cada 15 s e o Grafana desenha os graficos
// (ver a pasta observabilidade/ na raiz do servico).
const client = require('prom-client');

// Registro proprio (em vez do global) pra controlar exatamente o que e exposto.
const registro = new client.Registry();
// CPU, memoria, event loop, GC... do Node, com prefixo usuarios_
client.collectDefaultMetrics({ register: registro, prefix: 'usuarios_' });

const ROTULOS_HTTP = ['metodo', 'rota', 'status'];

const requisicoesHttp = new client.Counter({
  name: 'usuarios_http_requisicoes_total',
  help: 'Total de requisicoes HTTP atendidas pelo usuarios-service',
  labelNames: ROTULOS_HTTP,
  registers: [registro],
});

const duracaoHttp = new client.Histogram({
  name: 'usuarios_http_duracao_segundos',
  help: 'Tempo de resposta das requisicoes HTTP, em segundos',
  labelNames: ROTULOS_HTTP,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registro],
});

const cadastros = new client.Counter({
  name: 'usuarios_cadastros_total',
  help: 'Leiloeiros e licitantes cadastrados com sucesso, por tipo',
  labelNames: ['tipo'],
  registers: [registro],
});

const reservasCredito = new client.Counter({
  name: 'usuarios_reservas_credito_total',
  help: 'Operacoes de credito da saga de lance (reserva nova ou liberacao)',
  labelNames: ['operacao'],
  registers: [registro],
});

// Rotulos fixos em TODAS as metricas: de qual servico, ambiente e versao vieram.
function definirRotulosPadrao({ ambiente, versao }) {
  registro.setDefaultLabels({ service: 'usuarios-service', ambiente, versao });
}

// Usa o PADRAO da rota (/licitantes/:id), nunca a URL real (/licitantes/42): cada id
// diferente criaria uma serie nova no Prometheus ("explosao de cardinalidade").
function rotaDaRequisicao(req) {
  if (req.route && req.route.path) {
    const caminho = req.route.path === '/' ? '' : req.route.path;
    return `${req.baseUrl || req.prefixoDaRota || ''}${caminho}` || '/';
  }
  if ((req.originalUrl || '').startsWith('/docs')) return '/docs';
  return 'nao_encontrada';
}

/**
 * Middleware que guarda o prefixo do router (ex.: /leiloeiros) na requisicao.
 * Quando um erro sai do router por next(err), o Express apaga o req.baseUrl
 * antes de a resposta terminar; sem isto a rota medida perderia o prefixo
 * (ex.: "/:id" em vez de "/leiloeiros/:id"). Uso no app.js:
 * app.use('/leiloeiros', lembrarPrefixo, rotas).
 */
function lembrarPrefixo(req, res, next) {
  req.prefixoDaRota = req.baseUrl;
  next();
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

// tipo: 'leiloeiro' | 'licitante'
function registrarCadastro(tipo) {
  cadastros.inc({ tipo });
}

// operacao: 'reservada' | 'liberada' (repeticoes idempotentes nao contam)
function registrarOperacaoCredito(operacao) {
  reservasCredito.inc({ operacao });
}

module.exports = {
  registro,
  definirRotulosPadrao,
  rotaDaRequisicao,
  lembrarPrefixo,
  medirRequisicoes,
  responderMetricas,
  registrarCadastro,
  registrarOperacaoCredito,
};
