// =============================================================================
// controllers/lanceController.js  -  CONTROLLER de lances e sagas
// -----------------------------------------------------------------------------
// Roteiro de sempre: ler req -> chamar lanceService -> responder res.
// Particularidade deste servico: os erros da Saga carregam o `sagaId`, que e
// devolvido ao cliente para ele poder consultar o que aconteceu
// (GET /lances/sagas/:id).
//
// Quem chama: routes/lanceRoutes.js | Quem e chamado: services/lanceService.js
// =============================================================================

const lanceService = require('../services/lanceService');
const { ErroDeValidacao } = require('../utils/erros');

/** GET /lances  ->  todos os lances (mais recentes primeiro). */
async function listar(req, res) {
  try {
    const lances = await lanceService.listar();
    res.json(lances);
  } catch (err) {
    tratarErro(res, err);
  }
}

/** GET /lances/:id  (a validacao do id e feita no service) */
async function buscarPorId(req, res) {
  try {
    const lance = await lanceService.buscarPorId(req.params.id);
    res.json(lance);
  } catch (err) {
    tratarErro(res, err);
  }
}

/** GET /lances/leilao/:leilaoId  ->  lances do leilao, do maior para o menor. */
async function buscarPorLeilao(req, res) {
  try {
    const lances = await lanceService.buscarPorLeilao(req.params.leilaoId);
    res.json(lances);
  } catch (err) {
    tratarErro(res, err);
  }
}

/** GET /lances/leilao/:leilaoId/maior  ->  o lance vencedor ate agora (404 se nao houver). */
async function buscarMaiorPorLeilao(req, res) {
  try {
    const lance = await lanceService.buscarMaiorPorLeilao(req.params.leilaoId);
    res.json(lance);
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * POST /lances   corpo: { leilaoId, licitanteId, valor }
 * Dispara a SAGA de registro de lance. Resposta 201 com o lance gravado e
 * os campos sagaId e sagaStatus.
 *
 * Header opcional (so para demonstracao): X-Simular-Falha: <nome-do-passo>
 * forca uma falha naquele passo, para mostrar a compensacao funcionando.
 */
async function registrar(req, res) {
  try {
    const { leilaoId, valor } = req.body;
    // `let` porque o valor pode ser trocado logo abaixo.
    let licitanteId = req.body.licitanteId;

    // Se licitanteId nao for passado no body, tenta extrair do token do usuario autenticado
    // Obs.: o token gerado pelo auth-service nao tem "perfilId"; entao cai no
    // "sub", que e o id do USUARIO no auth-db - nem sempre igual ao id do
    // LICITANTE no usuarios-db. Por isso o README orienta enviar licitanteId.
    if (!licitanteId && req.usuarioAutenticado) {
      licitanteId = req.usuarioAutenticado.perfilId || req.usuarioAutenticado.sub;
    }

    // forca uma falha num passo da saga, pra mostrar a compensacao.
    // so funciona com SAGA_PERMITIR_FALHA_SIMULADA=true
    // req.get('Nome') le um header da requisicao. Se a variavel de ambiente
    // nao estiver ligada, o header e ignorado (seguranca em producao).
    const simularFalha =
      process.env.SAGA_PERMITIR_FALHA_SIMULADA === 'true' ? req.get('X-Simular-Falha') || null : null;

    const lance = await lanceService.registrarLance({
      leilaoId,
      licitanteId,
      valor,
      simularFalha,
    });
    res.status(201).json(lance);
  } catch (err) {
    tratarErro(res, err);
  }
}

/** GET /lances/sagas  ->  ultimas 50 sagas. */
async function listarSagas(req, res) {
  try {
    res.json(await lanceService.listarSagas());
  } catch (err) {
    tratarErro(res, err);
  }
}

/** GET /lances/sagas/:id  ->  uma saga com a lista de passos (o "diario de bordo"). */
async function buscarSaga(req, res) {
  try {
    res.json(await lanceService.buscarSaga(req.params.id));
  } catch (err) {
    tratarErro(res, err);
  }
}

/** POST /lances/sagas/:id/reprocessar  ->  tenta concluir uma saga pendente. */
async function reprocessarSaga(req, res) {
  try {
    res.json(await lanceService.reprocessarSaga(req.params.id));
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * Erro de negocio -> codigo do erro, com sagaId quando houver.
 * Exemplo de resposta: 409 { "erro": "Credito insuficiente...", "sagaId": 12 }
 * Erro inesperado -> 500 generico.
 */
function tratarErro(res, err) {
  if (err instanceof ErroDeValidacao) {
    const corpo = { erro: err.message };
    // Acrescenta a propriedade sagaId ao objeto so se ela existir no erro.
    if (err.sagaId) corpo.sagaId = err.sagaId;
    return res.status(err.codigo).json(corpo);
  }
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno no servico de lances.' });
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorLeilao,
  buscarMaiorPorLeilao,
  registrar,
  listarSagas,
  buscarSaga,
  reprocessarSaga,
};
