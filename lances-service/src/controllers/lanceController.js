const lanceService = require('../services/lanceService');
const { ErroDeValidacao } = require('../utils/erros');

async function listar(req, res) {
  try {
    const lances = await lanceService.listar();
    res.json(lances);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function buscarPorId(req, res) {
  try {
    const lance = await lanceService.buscarPorId(req.params.id);
    res.json(lance);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function buscarPorLeilao(req, res) {
  try {
    const lances = await lanceService.buscarPorLeilao(req.params.leilaoId);
    res.json(lances);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function buscarMaiorPorLeilao(req, res) {
  try {
    const lance = await lanceService.buscarMaiorPorLeilao(req.params.leilaoId);
    res.json(lance);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function registrar(req, res) {
  try {
    const { leilaoId, valor } = req.body;
    let licitanteId = req.body.licitanteId;

    // Se licitanteId nao for passado no body, tenta extrair do token do usuario autenticado
    if (!licitanteId && req.usuarioAutenticado) {
      licitanteId = req.usuarioAutenticado.perfilId || req.usuarioAutenticado.sub;
    }

    // forca uma falha num passo da saga, pra mostrar a compensacao.
    // so funciona com SAGA_PERMITIR_FALHA_SIMULADA=true
    const simularFalha =
      process.env.SAGA_PERMITIR_FALHA_SIMULADA === 'true' ? req.get('X-Simular-Falha') || null : null;

    const lance = await lanceService.registrarLance({
      leilaoId,
      licitanteId,
      valor,
      simularFalha,
    });
    res.status(201).json(lance);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function listarSagas(req, res) {
  try {
    res.json(await lanceService.listarSagas());
  } catch (err) {
    tratarErro(res, err);
  }
}

async function buscarSaga(req, res) {
  try {
    res.json(await lanceService.buscarSaga(req.params.id));
  } catch (err) {
    tratarErro(res, err);
  }
}

async function reprocessarSaga(req, res) {
  try {
    res.json(await lanceService.reprocessarSaga(req.params.id));
  } catch (err) {
    tratarErro(res, err);
  }
}

function tratarErro(res, err) {
  if (err instanceof ErroDeValidacao) {
    const corpo = { erro: err.message };
    if (err.sagaId) corpo.sagaId = err.sagaId;
    return res.status(err.codigo).json(corpo);
  }
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno no servico de lances.' });
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorLeilao,
  buscarMaiorPorLeilao,
  registrar,
  listarSagas,
  buscarSaga,
  reprocessarSaga,
};
