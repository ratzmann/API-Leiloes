// =============================================================================
// routes/licitanteRoutes.js  -  ROTAS de licitantes e do CREDITO (usuarios-service)
// -----------------------------------------------------------------------------
// Montado em app.js com o prefixo /licitantes.
//
// CRUD do licitante (mesmo padrao dos leiloeiros):
//   GET /licitantes, GET /licitantes/:id  -> qualquer usuario logado
//   POST /licitantes                      -> INTERNO (so o auth-service, no
//                                            registro; o Kong devolve 403 de fora)
//   PUT /:id, DELETE /:id                 -> so o PROPRIO licitante (403 para os
//                                            demais), que tambem nao pode mudar o
//                                            proprio limiteCredito
//
// Credito do licitante (usado pela Saga de lance do lances-service):
//   GET  /licitantes/:id/credito                         -> limite, reservado e disponivel
//   GET  /licitantes/:id/reservas                        -> historico de reservas
//   POST /licitantes/:id/reservas                        -> bloqueia um valor (passo 2 da Saga)
//   POST /licitantes/:id/reservas/:reservaId/liberar     -> devolve o valor (compensacao / passo 4)
// As rotas de /reservas sao INTERNAS: o Kong devolve 403 se alguem de fora
// tentar chama-las (ver a rota "reservas-credito-internas" no kong.yml).
// =============================================================================

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
// Dois parametros de rota: req.params.id e req.params.reservaId.
router.post('/:id/reservas/:reservaId/liberar', creditoController.liberar);

module.exports = router;
