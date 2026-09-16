const { Router } = require('express');
const lanceController = require('../controllers/lanceController');

const router = Router();

router.get('/', lanceController.listar);
router.post('/', lanceController.registrar);
router.get('/:id', lanceController.buscarPorId);
router.get('/leilao/:leilaoId', lanceController.buscarPorLeilao);
router.get('/leilao/:leilaoId/maior', lanceController.buscarMaiorPorLeilao);

module.exports = router;
