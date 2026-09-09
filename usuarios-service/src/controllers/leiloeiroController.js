const leiloeiroService = require('../services/leiloeiroService');
const { ErroDeValidacao } = require('../utils/erros');

async function listar(req, res) {
  const leiloeiros = await leiloeiroService.listar();
  res.json(leiloeiros);
}

async function buscarPorId(req, res) {
  try {
    const leiloeiro = await leiloeiroService.buscarPorId(Number(req.params.id));
    res.json(leiloeiro);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function cadastrar(req, res) {
  try {
    const { usuarioId, nome, email, registroProfissional, telefone } = req.body;
    const leiloeiro = await leiloeiroService.cadastrar({
      usuarioId,
      nome,
      email,
      registroProfissional,
      telefone,
    });
    res.status(201).json(leiloeiro);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function atualizar(req, res) {
  try {
    const leiloeiro = await leiloeiroService.atualizar(Number(req.params.id), req.body);
    res.json(leiloeiro);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function remover(req, res) {
  try {
    await leiloeiroService.remover(Number(req.params.id));
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
