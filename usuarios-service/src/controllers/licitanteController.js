const licitanteService = require('../services/licitanteService');
const { ErroDeValidacao } = require('../utils/erros');

async function listar(req, res) {
  const licitantes = await licitanteService.listar();
  res.json(licitantes);
}

async function buscarPorId(req, res) {
  try {
    const licitante = await licitanteService.buscarPorId(Number(req.params.id));
    res.json(licitante);
  } catch (err) {
    tratarErro(res, err);
  }
}

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

async function atualizar(req, res) {
  try {
    const licitante = await licitanteService.atualizar(Number(req.params.id), req.body);
    res.json(licitante);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function remover(req, res) {
  try {
    await licitanteService.remover(Number(req.params.id));
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
  return res.status(500).json({ erro: 'Erro interno no servico de usuarios.' });
}

module.exports = { listar, buscarPorId, cadastrar, atualizar, remover };
