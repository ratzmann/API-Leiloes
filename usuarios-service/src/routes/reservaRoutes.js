// =============================================================================
// routes/reservaRoutes.js  -  ROTAS INTERNAS de reservas (usuarios-service)
// -----------------------------------------------------------------------------
// Montado em app.js com o prefixo /reservas.
//
//   POST /reservas/leilao/:leilaoId/liberar  -> libera todo o credito reservado
//                                               num leilao (leilao CANCELADO)
//
// Quem chama: o leiloes-service, pela rede interna do Docker, ao cancelar um
// leilao. Esta rota e INTERNA por construcao: o Kong NAO tem nenhuma rota
// /reservas (ver kong.yml), entao ela simplesmente nao existe para quem esta
// fora - nao e preciso bloquear com 403.
// =============================================================================

const { Router } = require('express');
const creditoController = require('../controllers/creditoController');

const router = Router();

router.post('/leilao/:leilaoId/liberar', creditoController.liberarPorLeilao);

module.exports = router;
