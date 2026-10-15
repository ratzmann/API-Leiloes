// =============================================================================
// controllers/leiloeiroController.js  -  CONTROLLER de leiloeiros
// -----------------------------------------------------------------------------
// Uma funcao para cada rota do CRUD de leiloeiros. Todas seguem o mesmo roteiro:
//   1. pegar os dados da requisicao (req.params / req.body);
//   2. chamar o service (que aplica as regras de negocio);
//   3. responder com o status HTTP adequado;
//   4. em caso de erro, chamar next(err): o middleware tratarErros responde.
//
// Quem chama: routes/leiloeiroRoutes.js | Quem e chamado: services/leiloeiroService.js
// =============================================================================

const leiloeiroService = require('../services/leiloeiroService');

/**
 * GET /leiloeiros  ->  lista todos os leiloeiros (dados pessoais so do proprio).
 * O try/catch e importante mesmo aqui: o Express 4 NAO captura sozinho erros
 * de funcoes async. Sem ele, se o banco falhar, a requisicao ficaria sem
 * resposta; com ele, o cliente recebe um 500 com mensagem clara.
 */
async function listar(req, res, next) {
  try {
    const leiloeiros = await leiloeiroService.listar(req.usuarioAutenticado);
    res.json(leiloeiros);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /leiloeiros/:id  (dados pessoais so para o proprio leiloeiro)
 * Number(...) converte o texto "5" da URL no numero 5.
 */
async function buscarPorId(req, res, next) {
  try {
    const leiloeiro = await leiloeiroService.consultar(Number(req.params.id), req.usuarioAutenticado);
    res.json(leiloeiro);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /leiloeiros  ->  cadastra um leiloeiro.
 * Rota INTERNA: so o auth-service chama, logo apos o registro do usuario
 * (pela rede do Docker, sem token). De fora, o Kong responde 403.
 */
async function cadastrar(req, res, next) {
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
    next(err);
  }
}

/** PUT /leiloeiros/:id  ->  o proprio leiloeiro atualiza nome e/ou telefone. */
async function atualizar(req, res, next) {
  try {
    const leiloeiro = await leiloeiroService.atualizar(Number(req.params.id), req.body, req.usuarioAutenticado);
    res.json(leiloeiro);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /leiloeiros/:id
 * 204 No Content: deu certo e nao ha nada para devolver no corpo.
 */
async function remover(req, res, next) {
  try {
    await leiloeiroService.remover(Number(req.params.id), req.usuarioAutenticado);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, buscarPorId, cadastrar, atualizar, remover };
