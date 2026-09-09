const usuarioRepository = require('../repositories/usuarioRepository');
const { hashSenha, compararSenha } = require('../utils/password');
const { gerarToken } = require('../utils/jwt');

const PAPEIS_VALIDOS = ['LEILOEIRO', 'LICITANTE'];

class ErroDeValidacao extends Error {
  constructor(mensagem, codigo = 400) {
    super(mensagem);
    this.name = 'ErroDeValidacao';
    this.codigo = codigo;
  }
}

function validarRegistro({ nome, email, senha, papel }) {
  if (!nome || nome.trim().length < 3) {
    throw new ErroDeValidacao('Nome deve ter ao menos 3 caracteres.');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new ErroDeValidacao('E-mail invalido.');
  }
  if (!senha || senha.length < 6) {
    throw new ErroDeValidacao('Senha deve ter ao menos 6 caracteres.');
  }
  if (!PAPEIS_VALIDOS.includes(papel)) {
    throw new ErroDeValidacao(
      `Papel invalido. Use um dos seguintes: ${PAPEIS_VALIDOS.join(', ')}.`
    );
  }
}

/**
 * Cria o usuario de autenticacao e, em seguida, delega ao usuarios-service
 * a criacao do perfil de dominio (leiloeiro ou licitante), comunicando-se
 * via HTTP usando a URL definida por variavel de ambiente.
 */
async function registrar({ nome, email, senha, papel, dadosPerfil }) {
  validarRegistro({ nome, email, senha, papel });

  const existente = await usuarioRepository.buscarPorEmail(email);
  if (existente) {
    throw new ErroDeValidacao('Ja existe um usuario cadastrado com este e-mail.', 409);
  }

  const senhaHash = await hashSenha(senha);
  const usuario = await usuarioRepository.criar({ nome, email, senhaHash, papel });

  let perfil = null;
  try {
    perfil = await criarPerfilNoUsuariosService(usuario, papel, dadosPerfil || {});
    if (perfil && perfil.id) {
      await usuarioRepository.atualizarPerfilId(usuario.id, perfil.id);
    }
  } catch (err) {
    // Nao derruba o cadastro de autenticacao caso o servico de dominio esteja
    // indisponivel; o perfil pode ser completado depois. Erro fica visivel no log.
    console.error('Falha ao criar perfil no usuarios-service:', err.message);
  }

  const token = gerarToken(usuario);
  return { usuario: sanitizar(usuario), perfil, token };
}

async function criarPerfilNoUsuariosService(usuario, papel, dadosPerfil) {
  const usuariosServiceUrl = process.env.USUARIOS_SERVICE_URL;
  if (!usuariosServiceUrl) return null;

  const rota = papel === 'LEILOEIRO' ? 'leiloeiros' : 'licitantes';
  const resposta = await fetch(`${usuariosServiceUrl}/${rota}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usuarioId: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      ...dadosPerfil,
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`usuarios-service retornou ${resposta.status}: ${corpo}`);
  }
  return resposta.json();
}

async function login({ email, senha }) {
  if (!email || !senha) {
    throw new ErroDeValidacao('Informe e-mail e senha.');
  }

  const usuario = await usuarioRepository.buscarPorEmail(email);
  if (!usuario) {
    throw new ErroDeValidacao('Credenciais invalidas.', 401);
  }

  const senhaConfere = await compararSenha(senha, usuario.senha_hash);
  if (!senhaConfere) {
    throw new ErroDeValidacao('Credenciais invalidas.', 401);
  }

  const token = gerarToken(usuario);
  return { usuario: sanitizar(usuario), token };
}

function sanitizar(usuario) {
  const { senha_hash, ...resto } = usuario;
  return resto;
}

module.exports = { registrar, login, validarRegistro, ErroDeValidacao };
