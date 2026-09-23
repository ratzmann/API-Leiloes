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

/** GET /lances  ->  todos os lances (mais recentes primeiro). */
async function listar(req, res, next) {
  try {
    const lances = await lanceService.listar();
    res.json(lances);
  } catch (err) {
    next(err);
  }
}

/** GET /lances/:id  (a validacao do id e feita no service) */
async function buscarPorId(req, res, next) {
  try {
    const lance = await lanceService.buscarPorId(req.params.id);
    res.json(lance);
  } catch (err) {
    next(err);
  }
}

/** GET /lances/leilao/:leilaoId  ->  lances do leilao, do maior para o menor. */
async function buscarPorLeilao(req, res, next) {
  try {
    const lances = await lanceService.buscarPorLeilao(req.params.leilaoId);
    res.json(lances);
  } catch (err) {
    next(err);
  }
}

/** GET /lances/leilao/:leilaoId/maior  ->  o lance vencedor ate agora (404 se nao houver). */
async function buscarMaiorPorLeilao(req, res, next) {
  try {
    const lance = await lanceService.buscarMaiorPorLeilao(req.params.leilaoId);
    res.json(lance);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /lances   corpo: { leilaoId, valor, licitanteId? }
 * Dispara a SAGA de registro de lance. Resposta 201 com o lance gravado e
 * os campos sagaId e sagaStatus.
 *
 * O licitante do lance e SEMPRE quem esta logado (perfilId do token). O
 * licitanteId no corpo e opcional; se vier, precisa ser o proprio (senao 403).
 * Essa regra de autorizacao fica no service (lanceService.autorizarLicitante),
 * onde pode ser testada.
 *
 * Header opcional (so para demonstracao): X-Simular-Falha: <nome-do-passo>
 * forca uma falha naquele passo, para mostrar a compensacao funcionando.
 */
async function registrar(req, res, next) {
  try {
    const { leilaoId, valor, licitanteId } = req.body;

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
      // quem esta logado (colocado em req pelo middleware extrairUsuario)
      usuario: req.usuarioAutenticado,
      simularFalha,
    });
    res.status(201).json(lance);
  } catch (err) {
    next(err);
  }
}

/** GET /lances/sagas  ->  ultimas 50 sagas. */
async function listarSagas(req, res, next) {
  try {
    res.json(await lanceService.listarSagas());
  } catch (err) {
    next(err);
  }
}

/** GET /lances/sagas/:id  ->  uma saga com a lista de passos (o "diario de bordo"). */
async function buscarSaga(req, res, next) {
  try {
    res.json(await lanceService.buscarSaga(req.params.id));
  } catch (err) {
    next(err);
  }
}

/** POST /lances/sagas/:id/reprocessar  ->  tenta concluir uma saga pendente. */
async function reprocessarSaga(req, res, next) {
  try {
    res.json(await lanceService.reprocessarSaga(req.params.id));
  } catch (err) {
    next(err);
  }
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
