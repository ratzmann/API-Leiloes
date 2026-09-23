// =============================================================================
// controllers/leilaoController.js  -  CONTROLLER do leilao
// -----------------------------------------------------------------------------
// Uma funcao por rota. Todas seguem o roteiro:
//   ler req (params/query/body) -> chamar leilaoService -> responder res
//   (e, se der erro, tratarErro converte em resposta HTTP).
//
// Tres lugares de onde os dados chegam na requisicao:
//   req.params -> partes da URL declaradas com ":"  (ex.: /leiloes/:id)
//   req.query  -> depois do "?" na URL              (ex.: ?status=ABERTO)
//   req.body   -> corpo JSON (POST, PUT, PATCH)
// E um quarto, preenchido pelo middleware extrairUsuario:
//   req.usuarioAutenticado -> quem esta logado (payload do token JWT)
// As rotas que ALTERAM leiloes repassam esse usuario ao service, que decide
// se ele tem permissao (Regra 7). As rotas GET continuam livres.
//
// Quem chama: routes/leilaoRoutes.js | Quem e chamado: services/leilaoService.js
// =============================================================================

const leilaoService = require('../services/leilaoService');
const { ErroDeValidacao } = require('../utils/erros');

/** GET /leiloes?status=ABERTO&leiloeiroId=1  (os dois filtros sao opcionais) */
async function listar(req, res) {
  try {
    const leiloes = await leilaoService.listar({
      status: req.query.status,
      leiloeiroId: req.query.leiloeiroId,
    });
    res.json(leiloes);
  } catch (err) {
    tratarErro(res, err);
  }
}

/** GET /leiloes/:id  (Number converte o texto da URL em numero) */
async function buscarPorId(req, res) {
  try {
    const leilao = await leilaoService.buscarPorId(Number(req.params.id));
    res.json(leilao);
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * POST /leiloes  ->  201 Created com o leilao cadastrado.
 * Desestrutura so os campos conhecidos do corpo e repassa ao service.
 */
async function cadastrar(req, res) {
  try {
    const {
      leiloeiroId,
      titulo,
      descricao,
      localEvento,
      raca,
      quantidadeBois,
      lanceInicial,
      incrementoMinimo,
      dataInicio,
      dataFim,
    } = req.body;

    const leilao = await leilaoService.cadastrar({
      leiloeiroId,
      titulo,
      descricao,
      localEvento,
      raca,
      quantidadeBois,
      lanceInicial,
      incrementoMinimo,
      dataInicio,
      dataFim,
    }, req.usuarioAutenticado);
    res.status(201).json(leilao);
  } catch (err) {
    tratarErro(res, err);
  }
}

/** PUT /leiloes/:id  ->  edita campos de um leilao ainda AGENDADO. */
async function atualizar(req, res) {
  try {
    const leilao = await leilaoService.atualizar(Number(req.params.id), req.body, req.usuarioAutenticado);
    res.json(leilao);
  } catch (err) {
    tratarErro(res, err);
  }
}

/** PATCH /leiloes/:id/status   corpo: { "status": "ABERTO" } */
async function alterarStatus(req, res) {
  try {
    const leilao = await leilaoService.alterarStatus(Number(req.params.id), req.body.status, req.usuarioAutenticado);
    res.json(leilao);
  } catch (err) {
    tratarErro(res, err);
  }
}

/** PATCH /leiloes/:id/abrir  ->  AGENDADO -> ABERTO */
async function abrir(req, res) {
  try {
    res.json(await leilaoService.abrir(Number(req.params.id), req.usuarioAutenticado));
  } catch (err) {
    tratarErro(res, err);
  }
}

/** PATCH /leiloes/:id/encerrar  ->  ABERTO -> ENCERRADO */
async function encerrar(req, res) {
  try {
    res.json(await leilaoService.encerrar(Number(req.params.id), req.usuarioAutenticado));
  } catch (err) {
    tratarErro(res, err);
  }
}

/** PATCH /leiloes/:id/cancelar  ->  AGENDADO ou ABERTO -> CANCELADO */
async function cancelar(req, res) {
  try {
    res.json(await leilaoService.cancelar(Number(req.params.id), req.usuarioAutenticado));
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * GET /leiloes/:id/disponibilidade
 * Esta rota e um exemplo de COMUNICACAO ENTRE MICROSSERVICOS: o lances-service
 * a chama no passo 1 da Saga para saber se o leilao aceita lances.
 */
async function consultarDisponibilidade(req, res) {
  try {
    res.json(await leilaoService.consultarDisponibilidade(Number(req.params.id)));
  } catch (err) {
    tratarErro(res, err);
  }
}

/** DELETE /leiloes/:id  ->  204 No Content (so enquanto AGENDADO). */
async function remover(req, res) {
  try {
    await leilaoService.remover(Number(req.params.id), req.usuarioAutenticado);
    res.status(204).send();
  } catch (err) {
    tratarErro(res, err);
  }
}

/** Erro de negocio -> codigo do erro (400/404/409/503); inesperado -> 500. */
function tratarErro(res, err) {
  if (err instanceof ErroDeValidacao) {
    return res.status(err.codigo).json({ erro: err.message });
  }
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno no servico de leiloes.' });
}

module.exports = {
  listar,
  buscarPorId,
  cadastrar,
  atualizar,
  alterarStatus,
  abrir,
  encerrar,
  cancelar,
  consultarDisponibilidade,
  remover,
};
