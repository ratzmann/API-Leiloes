const authService = require('../services/authService');

async function registrar(req, res) {
  try {
    const { nome, email, senha, papel, dadosPerfil } = req.body;
    const resultado = await authService.registrar({ nome, email, senha, papel, dadosPerfil });
    res.status(201).json(resultado);
  } catch (err) {
    tratarErro(res, err);
  }
}

async function login(req, res) {
  try {
    const { email, senha } = req.body;
    const resultado = await authService.login({ email, senha });
    res.status(200).json(resultado);
  } catch (err) {
    tratarErro(res, err);
  }
}

function tratarErro(res, err) {
  if (err instanceof authService.ErroDeValidacao) {
    return res.status(err.codigo).json({ erro: err.message });
  }
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno no servico de autenticacao.' });
}

module.exports = { registrar, login };
