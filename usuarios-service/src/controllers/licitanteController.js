// =============================================================================
// controllers/licitanteController.js  -  CONTROLLER de licitantes
// -----------------------------------------------------------------------------
// Mesmo roteiro do leiloeiroController: ler a requisicao, chamar o service,
// responder com o status certo, e tratar erros no final.
// (As rotas de credito deste mesmo recurso ficam no creditoController.)
//
// Quem chama: routes/licitanteRoutes.js | Quem e chamado: services/licitanteService.js
// =============================================================================

const licitanteService = require('../services/licitanteService');

/**
 * GET /licitantes  ->  lista todos (CPF e demais dados pessoais so do proprio).
 * Com try/catch como as demais: o Express 4 nao captura erros de funcoes async.
 */
async function listar(req, res, next) {
  try {
    const licitantes = await licitanteService.listar(req.usuarioAutenticado);
    res.json(licitantes);
  } catch (err) {
    next(err);
  }
}

/** GET /licitantes/:id  (CPF e demais dados pessoais so para o proprio licitante) */
async function buscarPorId(req, res, next) {
  try {
    const licitante = await licitanteService.consultar(Number(req.params.id), req.usuarioAutenticado);
    res.json(licitante);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /licitantes  ->  cadastra um licitante.
 * Corpo esperado: { usuarioId, nome, email, cpf, telefone, limiteCredito }
 * Rota INTERNA: so o auth-service chama, durante o registro (pela rede do
 * Docker, sem token). De fora, o Kong responde 403.
 */
async function cadastrar(req, res, next) {
  try {
    const { usuarioId, nome, email, cpf, telefone, limiteCredito } = req.body;
    const licitante = await licitanteService.cadastrar({
      usuarioId,
      nome,
      email,
      cpf,
      telefone,
      limiteCredito,
    });
    res.status(201).json(licitante);
  } catch (err) {
    next(err);
  }
}

/** PUT /licitantes/:id  ->  o proprio licitante atualiza nome e/ou telefone. */
async function atualizar(req, res, next) {
  try {
    const licitante = await licitanteService.atualizar(Number(req.params.id), req.body, req.usuarioAutenticado);
    res.json(licitante);
  } catch (err) {
    next(err);
  }
}

/** DELETE /licitantes/:id  ->  o proprio licitante remove o cadastro (204). */
async function remover(req, res, next) {
  try {
    await licitanteService.remover(Number(req.params.id), req.usuarioAutenticado);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, buscarPorId, cadastrar, atualizar, remover };
