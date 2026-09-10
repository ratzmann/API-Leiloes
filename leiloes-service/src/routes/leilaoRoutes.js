const { Router } = require('express');
const leilaoController = require('../controllers/leilaoController');

const router = Router();

router.get('/', leilaoController.listar);
router.get('/:id', leilaoController.buscarPorId);
router.get('/:id/disponibilidade', leilaoController.consultarDisponibilidade);
router.post('/', leilaoController.cadastrar);
router.put('/:id', leilaoController.atualizar);
router.patch('/:id/status', leilaoController.alterarStatus);
router.patch('/:id/abrir', leilaoController.abrir);
router.patch('/:id/encerrar', leilaoController.encerrar);
router.patch('/:id/cancelar', leilaoController.cancelar);
router.delete('/:id', leilaoController.remover);

module.exports = router;
