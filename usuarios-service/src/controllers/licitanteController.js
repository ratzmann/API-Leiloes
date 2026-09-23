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
const { ErroDeValidacao } = require('../utils/erros');

/**
 * GET /licitantes  ->  lista todos.
 * Obs.: sem try/catch, diferente das demais funcoes (ponto de melhoria).
 */
async function listar(req, res) {
  const licitantes = await licitanteService.listar();
  res.json(licitantes);
}

/** GET /licitantes/:id */
async function buscarPorId(req, res) {
  try {
    const licitante = await licitanteService.buscarPorId(Number(req.params.id));
    res.json(licitante);
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * POST /licitantes  ->  cadastra um licitante.
 * Corpo esperado: { usuarioId, nome, email, cpf, telefone, limiteCredito }
 * Normalmente chamado pelo auth-service durante o registro.
 */
async function cadastrar(req, res) {
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
    tratarErro(res, err);
  }
}

/** PUT /licitantes/:id  ->  atualiza nome, telefone e/ou limite de credito. */
async function atualizar(req, res) {
  try {
    const licitante = await licitanteService.atualizar(Number(req.params.id), req.body);
    res.json(licitante);
  } catch (err) {
    tratarErro(res, err);
  }
}

/** DELETE /licitantes/:id  ->  204 No Content quando remove. */
async function remover(req, res) {
  try {
    await licitanteService.remover(Number(req.params.id));
    res.status(204).send();
  } catch (err) {
    tratarErro(res, err);
  }
}

/** Erro de negocio -> codigo do erro; erro inesperado -> 500. */
function tratarErro(res, err) {
  if (err instanceof ErroDeValidacao) {
    return res.status(err.codigo).json({ erro: err.message });
  }
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno no servico de usuarios.' });
}

module.exports = { listar, buscarPorId, cadastrar, atualizar, remover };
