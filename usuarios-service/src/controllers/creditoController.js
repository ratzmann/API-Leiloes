// =============================================================================
// controllers/creditoController.js  -  CONTROLLER do credito do licitante
// -----------------------------------------------------------------------------
// Trata as rotas de credito (/licitantes/:id/credito e /reservas).
// Estas rotas sao chamadas pela SAGA do lances-service (servico a servico),
// e nao pelo usuario final - o Kong bloqueia /reservas vindas de fora.
//
// Lembrete do papel do controller: ler req -> chamar service -> responder res.
// Quem chama: routes/licitanteRoutes.js | Quem e chamado: services/creditoService.js
// =============================================================================

const creditoService = require('../services/creditoService');
const { ErroDeValidacao } = require('../utils/erros');

/**
 * GET /licitantes/:id/credito  ->  { licitanteId, limite, reservado, disponivel }
 * req.params.id e o ":id" da URL (sempre chega como TEXTO, ex.: "3").
 */
async function consultar(req, res) {
  try {
    // res.json(...) sem res.status(...) responde com 200 (OK) por padrao.
    res.json(await creditoService.consultarCredito(req.params.id));
  } catch (err) {
    tratarErro(res, err);
  }
}

/** GET /licitantes/:id/reservas  ->  lista de reservas do licitante. */
async function listarReservas(req, res) {
  try {
    res.json(await creditoService.listarReservas(req.params.id));
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * POST /licitantes/:id/reservas   corpo: { valor, referencia }
 * Bloqueia `valor` do credito do licitante (passo 2 da Saga de lance).
 *
 * IDEMPOTENCIA: se a mesma `referencia` (id da saga) chegar de novo, o service
 * devolve a reserva que ja existia em vez de criar outra. Por isso o status:
 *   201 Created -> reserva nova;   200 OK -> reserva que ja existia.
 */
async function reservar(req, res) {
  try {
    const { valor, referencia } = req.body;
    // O service devolve dois dados: a reserva e se ela foi criada agora.
    const { reserva, criada } = await creditoService.reservar(req.params.id, { valor, referencia });
    res.status(criada ? 201 : 200).json(reserva);
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * POST /licitantes/:id/reservas/:reservaId/liberar
 * Devolve o credito reservado (compensacao da Saga, ou quando alguem supera
 * o lance deste licitante).
 */
async function liberar(req, res) {
  try {
    res.json(await creditoService.liberar(req.params.id, req.params.reservaId));
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * Converte erros em resposta HTTP.
 * ErroDeValidacao -> usa o codigo do erro (400, 404, 409);
 * qualquer outro  -> 500 com mensagem generica (detalhe so no log).
 */
function tratarErro(res, err) {
  if (err instanceof ErroDeValidacao) {
    return res.status(err.codigo).json({ erro: err.message });
  }
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno no servico de usuarios.' });
}

module.exports = { consultar, listarReservas, reservar, liberar };
