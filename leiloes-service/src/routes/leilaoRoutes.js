// =============================================================================
// routes/leilaoRoutes.js  -  ROTAS do leiloes-service (prefixo /leiloes)
// -----------------------------------------------------------------------------
//   GET    /leiloes                      -> lista (filtros ?status= e ?leiloeiroId=)
//   GET    /leiloes/:id                  -> detalha um leilao
//   GET    /leiloes/:id/disponibilidade  -> "aceita lances agora?" (usado pelo lances-service)
//   POST   /leiloes                      -> cadastra
//   PUT    /leiloes/:id                  -> edita (so enquanto AGENDADO)
//   PATCH  /leiloes/:id/status           -> muda o status (corpo: { "status": "ABERTO" })
//   PATCH  /leiloes/:id/abrir            -> atalho: AGENDADO -> ABERTO
//   PATCH  /leiloes/:id/encerrar         -> atalho: ABERTO -> ENCERRADO
//   PATCH  /leiloes/:id/cancelar         -> atalho: -> CANCELADO
//   DELETE /leiloes/:id                  -> remove (so enquanto AGENDADO)
//
// PUT x PATCH: por convencao REST, PUT envia o recurso (ou boa parte dele) e
// PATCH faz uma alteracao pontual - aqui, so a mudanca de status.
//
// Quem pode usar cada rota (Regra 7, conferida no leilaoService):
//   - GET: livres (o lances-service consulta a disponibilidade sem token);
//   - POST: so um LEILOEIRO, e o leilao fica em nome dele (perfilId do token);
//   - PUT, PATCH e DELETE: so o leiloeiro DONO do leilao (403 para os demais).
// =============================================================================

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
