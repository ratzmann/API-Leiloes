const { Router } = require('express');
const licitanteController = require('../controllers/licitanteController');
const creditoController = require('../controllers/creditoController');

const router = Router();

router.get('/', licitanteController.listar);
router.get('/:id', licitanteController.buscarPorId);
router.post('/', licitanteController.cadastrar);
router.put('/:id', licitanteController.atualizar);
router.delete('/:id', licitanteController.remover);

// credito do licitante (usado pela saga de lance; o Kong bloqueia as reservas de fora)
router.get('/:id/credito', creditoController.consultar);
router.get('/:id/reservas', creditoController.listarReservas);
router.post('/:id/reservas', creditoController.reservar);
router.post('/:id/reservas/:reservaId/liberar', creditoController.liberar);

module.exports = router;
