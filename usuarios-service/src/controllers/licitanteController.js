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
 * GET /licitantes  ->  lista todos (CPF e demais dados pessoais so do proprio).
 * Com try/catch como as demais: o Express 4 nao captura erros de funcoes async.
 */
async function listar(req, res) {
  try {
    const licitantes = await licitanteService.listar(req.usuarioAutenticado);
    res.json(licitantes);
  } catch (err) {
    tratarErro(res, err);
  }
}

/** GET /licitantes/:id  (CPF e demais dados pessoais so para o proprio licitante) */
async function buscarPorId(req, res) {
  try {
    const licitante = await licitanteService.consultar(Number(req.params.id), req.usuarioAutenticado);
    res.json(licitante);
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * POST /licitantes  ->  cadastra um licitante.
 * Corpo esperado: { usuarioId, nome, email, cpf, telefone, limiteCredito }
 * Rota INTERNA: so o auth-service chama, durante o registro (pela rede do
 * Docker, sem token). De fora, o Kong responde 403.
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

/** PUT /licitantes/:id  ->  o proprio licitante atualiza nome e/ou telefone. */
async function atualizar(req, res) {
  try {
    const licitante = await licitanteService.atualizar(Number(req.params.id), req.body, req.usuarioAutenticado);
    res.json(licitante);
  } catch (err) {
    tratarErro(res, err);
  }
}

/** DELETE /licitantes/:id  ->  o proprio licitante remove o cadastro (204). */
async function remover(req, res) {
  try {
    await licitanteService.remover(Number(req.params.id), req.usuarioAutenticado);
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
