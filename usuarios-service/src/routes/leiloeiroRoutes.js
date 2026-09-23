// =============================================================================
// routes/leiloeiroRoutes.js  -  ROTAS de leiloeiros (usuarios-service)
// -----------------------------------------------------------------------------
// Montado em app.js com o prefixo /leiloeiros, entao '/' aqui = /leiloeiros
// e '/:id' = /leiloeiros/5 (por exemplo).
//
// Este e o padrao "CRUD" (Create, Read, Update, Delete) em REST:
//   GET    /leiloeiros      -> listar todos          (Read)
//   GET    /leiloeiros/:id  -> buscar um             (Read)
//   POST   /leiloeiros      -> cadastrar             (Create)
//   PUT    /leiloeiros/:id  -> atualizar             (Update)
//   DELETE /leiloeiros/:id  -> remover               (Delete)
// O ":id" e um PARAMETRO DE ROTA: o valor real chega em req.params.id.
// =============================================================================

const { Router } = require('express');
const leiloeiroController = require('../controllers/leiloeiroController');

const router = Router();

router.get('/', leiloeiroController.listar);
router.get('/:id', leiloeiroController.buscarPorId);
router.post('/', leiloeiroController.cadastrar);
router.put('/:id', leiloeiroController.atualizar);
router.delete('/:id', leiloeiroController.remover);

module.exports = router;
