// =============================================================================
// routes/lanceRoutes.js  -  ROTAS do lances-service (prefixo /lances)
// -----------------------------------------------------------------------------
//   GET  /lances                          -> todos os lances
//   POST /lances                          -> registra um lance (INICIA A SAGA)
//   GET  /lances/sagas                    -> ultimas sagas executadas
//   GET  /lances/sagas/:id                -> uma saga, passo a passo
//   POST /lances/sagas/:id/reprocessar    -> tenta de novo o passo 4 pendente
//   GET  /lances/:id                      -> um lance
//   GET  /lances/leilao/:leilaoId         -> lances de um leilao (maior primeiro)
//   GET  /lances/leilao/:leilaoId/maior   -> maior lance atual do leilao
//
// Quem pode dar lance (Regra 7, conferida no lanceService.autorizarLicitante):
// so um LICITANTE logado, e sempre em nome proprio (perfilId do token). As
// rotas GET e o reprocessamento de sagas ficam abertas a usuarios logados.
//
// ATENCAO A ORDEM: o Express testa as rotas de cima para baixo e usa a
// PRIMEIRA que servir. Se '/:id' viesse antes de '/sagas', um GET /lances/sagas
// seria entendido como "lance de id = 'sagas'".
// =============================================================================

const { Router } = require('express');
const lanceController = require('../controllers/lanceController');

const router = Router();

router.get('/', lanceController.listar);
router.post('/', lanceController.registrar);

// rotas da saga (antes do '/:id', senao "sagas" vira id de lance)
router.get('/sagas', lanceController.listarSagas);
router.get('/sagas/:id', lanceController.buscarSaga);
router.post('/sagas/:id/reprocessar', lanceController.reprocessarSaga);

router.get('/:id', lanceController.buscarPorId);
router.get('/leilao/:leilaoId', lanceController.buscarPorLeilao);
router.get('/leilao/:leilaoId/maior', lanceController.buscarMaiorPorLeilao);

module.exports = router;
