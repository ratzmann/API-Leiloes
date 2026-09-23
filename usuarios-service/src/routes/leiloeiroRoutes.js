// =============================================================================
// routes/leiloeiroRoutes.js  -  ROTAS de leiloeiros (usuarios-service)
// -----------------------------------------------------------------------------
// Montado em app.js com o prefixo /leiloeiros, entao '/' aqui = /leiloeiros
// e '/:id' = /leiloeiros/5 (por exemplo).
//
// Este e o padrao "CRUD" (Create, Read, Update, Delete) em REST:
//   GET    /leiloeiros      -> listar todos          (Read)
//   GET    /leiloeiros/:id  -> buscar um             (Read)
//   POST   /leiloeiros      -> cadastrar             (Create)  INTERNA
//   PUT    /leiloeiros/:id  -> atualizar             (Update)  so o proprio
//   DELETE /leiloeiros/:id  -> remover               (Delete)  so o proprio
// O ":id" e um PARAMETRO DE ROTA: o valor real chega em req.params.id.
//
// Quem pode usar cada rota:
//   - POST e INTERNO: so o auth-service cria perfis, no registro, pela rede do
//     Docker. Vindo de fora, o Kong responde 403 (rota "criar-perfil-interno"
//     no kong.yml); o caminho certo e POST /auth/registrar.
//   - PUT e DELETE: so o PROPRIO leiloeiro (regra no leiloeiroService, via
//     utils/autorizacao.js); outra pessoa recebe 403.
//   - GET: qualquer usuario logado.
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
