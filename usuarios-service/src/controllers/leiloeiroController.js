// =============================================================================
// controllers/leiloeiroController.js  -  CONTROLLER de leiloeiros
// -----------------------------------------------------------------------------
// Uma funcao para cada rota do CRUD de leiloeiros. Todas seguem o mesmo roteiro:
//   1. pegar os dados da requisicao (req.params / req.body);
//   2. chamar o service (que aplica as regras de negocio);
//   3. responder com o status HTTP adequado;
//   4. em caso de erro, delegar ao tratarErro.
//
// Quem chama: routes/leiloeiroRoutes.js | Quem e chamado: services/leiloeiroService.js
// =============================================================================

const leiloeiroService = require('../services/leiloeiroService');
const { ErroDeValidacao } = require('../utils/erros');

/**
 * GET /leiloeiros  ->  lista todos os leiloeiros.
 * O try/catch e importante mesmo aqui: o Express 4 NAO captura sozinho erros
 * de funcoes async. Sem ele, se o banco falhar, a requisicao ficaria sem
 * resposta; com ele, o cliente recebe um 500 com mensagem clara.
 */
async function listar(req, res) {
  try {
    const leiloeiros = await leiloeiroService.listar();
    res.json(leiloeiros);
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * GET /leiloeiros/:id
 * Number(...) converte o texto "5" da URL no numero 5.
 */
async function buscarPorId(req, res) {
  try {
    const leiloeiro = await leiloeiroService.buscarPorId(Number(req.params.id));
    res.json(leiloeiro);
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * POST /leiloeiros  ->  cadastra um leiloeiro.
 * Normalmente quem chama e o auth-service, logo apos o registro do usuario.
 */
async function cadastrar(req, res) {
  try {
    // Pegamos do corpo APENAS os campos esperados. Qualquer outro campo que o
    // cliente mandar e ignorado (uma protecao simples contra dados indesejados).
    const { usuarioId, nome, email, registroProfissional, telefone } = req.body;
    const leiloeiro = await leiloeiroService.cadastrar({
      usuarioId,
      nome,
      email,
      registroProfissional,
      telefone,
    });
    // 201 Created: recurso criado.
    res.status(201).json(leiloeiro);
  } catch (err) {
    tratarErro(res, err);
  }
}

/** PUT /leiloeiros/:id  ->  o proprio leiloeiro atualiza nome e/ou telefone. */
async function atualizar(req, res) {
  try {
    const leiloeiro = await leiloeiroService.atualizar(Number(req.params.id), req.body, req.usuarioAutenticado);
    res.json(leiloeiro);
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * DELETE /leiloeiros/:id
 * 204 No Content: deu certo e nao ha nada para devolver no corpo.
 */
async function remover(req, res) {
  try {
    await leiloeiroService.remover(Number(req.params.id), req.usuarioAutenticado);
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
