const { Router } = require('express');
const licitanteController = require('../controllers/licitanteController');
const creditoController = require('../controllers/creditoController');

const router = Router();

router.get('/', licitanteController.listar);
router.get('/:id', licitanteController.buscarPorId);
router.post('/', licitanteController.cadastrar);
router.put('/:id', licitanteController.atualizar);
router.delete('/:id', licitanteController.remover);

// Credito do licitante: usado pela Saga de registro de lance (lances-service).
// As rotas de reserva sao internas — o Kong bloqueia o acesso externo a elas.
router.get('/:id/credito', creditoController.consultar);
router.get('/:id/reservas', creditoController.listarReservas);
router.post('/:id/reservas', creditoController.reservar);
router.post('/:id/reservas/:reservaId/liberar', creditoController.liberar);

module.exports = router;
