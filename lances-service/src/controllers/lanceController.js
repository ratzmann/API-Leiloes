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

    const lance = await lanceService.registrarLance({
      leilaoId,
      licitanteId,
      valor,
    });
    res.status(201).json(lance);
  } catch (err) {
    tratarErro(res, err);
  }
}

function tratarErro(res, err) {
  if (err instanceof ErroDeValidacao) {
    return res.status(err.codigo).json({ erro: err.message });
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
};
