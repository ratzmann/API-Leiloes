const { Router } = require('express');
const licitanteController = require('../controllers/licitanteController');

const router = Router();

router.get('/', licitanteController.listar);
router.get('/:id', licitanteController.buscarPorId);
router.post('/', licitanteController.cadastrar);
router.put('/:id', licitanteController.atualizar);
router.delete('/:id', licitanteController.remover);

module.exports = router;
