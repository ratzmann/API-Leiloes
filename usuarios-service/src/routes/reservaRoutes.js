// =============================================================================
// routes/reservaRoutes.js  -  ROTAS INTERNAS de reservas (usuarios-service)
// -----------------------------------------------------------------------------
// Montado em app.js com o prefixo /reservas.
//
//   POST /reservas/leilao/:leilaoId/liberar  -> libera todo o credito reservado
//                                               num leilao (leilao CANCELADO)
//
// Quem chama: o leiloes-service, pela rede interna do Docker, ao cancelar um
// leilao (montado em app.js). Esta rota e INTERNA por construcao: o Kong NAO
// tem nenhuma rota /reservas (ver kong.yml), entao ela nao existe para quem
// esta fora. Na nuvem nao ha Kong: por isso ela tambem exige a chave interna
// (middlewares/exigirChaveInterna.js; sem a chave, 403).
// Quem e chamado: controllers/creditoController.js, middlewares/exigirChaveInterna.js
// =============================================================================

const { Router } = require('express');
const creditoController = require('../controllers/creditoController');
const exigirChaveInterna = require('../middlewares/exigirChaveInterna');

const router = Router();

router.post('/leilao/:leilaoId/liberar', exigirChaveInterna, creditoController.liberarPorLeilao);

module.exports = router;
