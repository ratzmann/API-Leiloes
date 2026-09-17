const { Router } = require('express');
const lanceController = require('../controllers/lanceController');

const router = Router();

router.get('/', lanceController.listar);
router.post('/', lanceController.registrar);

// Saga de registro de lance: acompanhamento e reprocessamento.
// Declaradas antes de '/:id' para 'sagas' nao ser lido como id de lance.
router.get('/sagas', lanceController.listarSagas);
router.get('/sagas/:id', lanceController.buscarSaga);
router.post('/sagas/:id/reprocessar', lanceController.reprocessarSaga);

router.get('/:id', lanceController.buscarPorId);
router.get('/leilao/:leilaoId', lanceController.buscarPorLeilao);
router.get('/leilao/:leilaoId/maior', lanceController.buscarMaiorPorLeilao);

module.exports = router;
