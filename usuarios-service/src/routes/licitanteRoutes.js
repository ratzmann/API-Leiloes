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
// Credito do licitante:
//   GET  /licitantes/:id/credito                         -> limite, reservado e disponivel
//                                                           (so o proprio licitante)
//   GET  /licitantes/:id/reservas                        -> historico de reservas
//   POST /licitantes/:id/reservas                        -> bloqueia um valor (passo 2 da Saga)
//   POST /licitantes/:id/reservas/:reservaId/liberar     -> devolve o valor (compensacao / passo 4)
// As rotas de /reservas sao INTERNAS (so a Saga do lances-service chama): o
// Kong devolve 403 se alguem de fora tentar (rota "reservas-credito-internas"
// no kong.yml) e, sem o Kong (na nuvem), o middleware exigirChaveInterna barra.
//
// Quem chama: app.js
// Quem e chamado: controllers/licitanteController.js, controllers/creditoController.js,
//                 middlewares/exigirChaveInterna.js
// =============================================================================

const { Router } = require('express');
const licitanteController = require('../controllers/licitanteController');
const creditoController = require('../controllers/creditoController');
const exigirChaveInterna = require('../middlewares/exigirChaveInterna');

const router = Router();

router.get('/', licitanteController.listar);
router.get('/:id', licitanteController.buscarPorId);
// rota interna: primeiro confere a chave, depois o controller (ver leiloeiroRoutes.js)
router.post('/', exigirChaveInterna, licitanteController.cadastrar);
router.put('/:id', licitanteController.atualizar);
router.delete('/:id', licitanteController.remover);

router.get('/:id/credito', creditoController.consultar);
// reservas: rotas internas da Saga de lance
router.get('/:id/reservas', exigirChaveInterna, creditoController.listarReservas);
router.post('/:id/reservas', exigirChaveInterna, creditoController.reservar);
// Dois parametros de rota: req.params.id e req.params.reservaId.
router.post('/:id/reservas/:reservaId/liberar', exigirChaveInterna, creditoController.liberar);

module.exports = router;
