const leilaoService = require('../services/leilaoService');
const { ErroDeValidacao } = require('../utils/erros');

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

async function buscarPorId(req, res) {
  try {
    const leilao = await leilaoService.buscarPorId(Number(req.params.id));
    res.json(leilao);
  } catch (err) {
    tratarErro(res, err);
  }
}

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
    });
    res.status(201).json(leilao);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function atualizar(req, res) {
  try {
    const leilao = await leilaoService.atualizar(Number(req.params.id), req.body);
    res.json(leilao);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function alterarStatus(req, res) {
  try {
    const leilao = await leilaoService.alterarStatus(Number(req.params.id), req.body.status);
    res.json(leilao);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function abrir(req, res) {
  try {
    res.json(await leilaoService.abrir(Number(req.params.id)));
  } catch (err) {
    tratarErro(res, err);
  }
}

async function encerrar(req, res) {
  try {
    res.json(await leilaoService.encerrar(Number(req.params.id)));
  } catch (err) {
    tratarErro(res, err);
  }
}

async function cancelar(req, res) {
  try {
    res.json(await leilaoService.cancelar(Number(req.params.id)));
  } catch (err) {
    tratarErro(res, err);
  }
}

// Consumido pelo microsservico de lances antes de registrar um lance.
async function consultarDisponibilidade(req, res) {
  try {
    res.json(await leilaoService.consultarDisponibilidade(Number(req.params.id)));
  } catch (err) {
    tratarErro(res, err);
  }
}

async function remover(req, res) {
  try {
    await leilaoService.remover(Number(req.params.id));
    res.status(204).send();
  } catch (err) {
    tratarErro(res, err);
  }
}

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
