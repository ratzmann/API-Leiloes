const creditoService = require('../services/creditoService');
const { ErroDeValidacao } = require('../utils/erros');

async function consultar(req, res) {
  try {
    res.json(await creditoService.consultarCredito(req.params.id));
  } catch (err) {
    tratarErro(res, err);
  }
}

async function listarReservas(req, res) {
  try {
    res.json(await creditoService.listarReservas(req.params.id));
  } catch (err) {
    tratarErro(res, err);
  }
}

async function reservar(req, res) {
  try {
    const { valor, referencia } = req.body;
    const { reserva, criada } = await creditoService.reservar(req.params.id, { valor, referencia });
    res.status(criada ? 201 : 200).json(reserva);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function liberar(req, res) {
  try {
    res.json(await creditoService.liberar(req.params.id, req.params.reservaId));
  } catch (err) {
    tratarErro(res, err);
  }
}

function tratarErro(res, err) {
  if (err instanceof ErroDeValidacao) {
    return res.status(err.codigo).json({ erro: err.message });
  }
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno no servico de usuarios.' });
}

module.exports = { consultar, listarReservas, reservar, liberar };
