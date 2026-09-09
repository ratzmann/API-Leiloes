const { Router } = require('express');
const leiloeiroController = require('../controllers/leiloeiroController');

const router = Router();

router.get('/', leiloeiroController.listar);
router.get('/:id', leiloeiroController.buscarPorId);
router.post('/', leiloeiroController.cadastrar);
router.put('/:id', leiloeiroController.atualizar);
router.delete('/:id', leiloeiroController.remover);

module.exports = router;
