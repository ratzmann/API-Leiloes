// =============================================================================
// services/authService.js  -  CAMADA DE SERVICE (regras de negocio) do auth-service
// -----------------------------------------------------------------------------
// Aqui mora a LOGICA de autenticacao:
//   - validar os dados de cadastro (nome, e-mail, senha, papel);
//   - impedir e-mail duplicado;
//   - guardar a senha de forma segura (hash com bcrypt);
//   - criar o "perfil" do usuario no usuarios-service (comunicacao entre servicos);
//   - conferir a senha no login e gerar o token JWT.
//
// Quem chama: controllers/authController.js
// Quem e chamado: repositories/usuarioRepository.js (banco),
//                 utils/password.js (bcrypt), utils/jwt.js (token),
//                 usuarios-service via HTTP (fetch).
// =============================================================================

const usuarioRepository = require('../repositories/usuarioRepository');
const { hashSenha, compararSenha } = require('../utils/password');
const { gerarToken } = require('../utils/jwt');

// Lista dos papeis aceitos. Constantes em MAIUSCULAS indicam "valor fixo".
const PAPEIS_VALIDOS = ['LEILOEIRO', 'LICITANTE'];

/**
 * Erro "de negocio" que carrega junto o codigo HTTP que deve ser devolvido.
 *
 * `class ... extends Error` cria um TIPO NOVO de erro, herdando tudo do Error
 * padrao do JavaScript (mensagem, pilha de chamadas) e acrescentando `codigo`.
 * Assim o controller consegue diferenciar "erro esperado" (dado invalido) de
 * "erro inesperado" (bug) usando `instanceof ErroDeValidacao`.
 * Obs.: nos outros servicos esta classe fica em utils/erros.js; aqui ela foi
 * declarada dentro do proprio service.
 */
class ErroDeValidacao extends Error {
  // constructor roda quando alguem faz `new ErroDeValidacao(...)`.
  // `codigo = 400` e um valor PADRAO: se ninguem informar, vale 400 (Bad Request).
  constructor(mensagem, codigo = 400) {
    // super(...) chama o constructor da classe "mae" (Error), que guarda a mensagem.
    super(mensagem);
    this.name = 'ErroDeValidacao';
    // `this` e o proprio objeto que esta sendo criado.
    this.codigo = codigo;
  }
}

/**
 * Valida os dados de cadastro. Nao devolve nada: se algo estiver errado,
 * LANCA (throw) um ErroDeValidacao e interrompe o fluxo; se estiver tudo
 * certo, simplesmente termina.
 */
function validarRegistro({ nome, email, senha, papel }) {
  // `!nome` e verdadeiro quando nome e vazio, null ou undefined.
  // trim() remove espacos do comeco e do fim antes de contar os caracteres.
  if (!nome || nome.trim().length < 3) {
    throw new ErroDeValidacao('Nome deve ter ao menos 3 caracteres.');
  }
  // Expressao regular (regex): um "molde" de texto. Esta le-se assim:
  // "um ou mais caracteres sem espaco/@" + "@" + "um ou mais" + "." + "um ou mais".
  // Ou seja, algo parecido com nome@dominio.com.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new ErroDeValidacao('E-mail invalido.');
  }
  if (!senha || senha.length < 6) {
    throw new ErroDeValidacao('Senha deve ter ao menos 6 caracteres.');
  }
  // includes() responde se o valor esta dentro da lista.
  if (!PAPEIS_VALIDOS.includes(papel)) {
    throw new ErroDeValidacao(
      // join(', ') junta os itens da lista num texto: "LEILOEIRO, LICITANTE".
      `Papel invalido. Use um dos seguintes: ${PAPEIS_VALIDOS.join(', ')}.`
    );
  }
}

/**
 * Cria o usuario de autenticacao e, em seguida, delega ao usuarios-service
 * a criacao do perfil de dominio (leiloeiro ou licitante), comunicando-se
 * via HTTP usando a URL definida por variavel de ambiente.
 *
 * Passo a passo:
 *   1. valida os dados;
 *   2. confere se o e-mail ja existe (409 = Conflict);
 *   3. gera o hash da senha e grava o usuario no banco auth-db;
 *   4. pede ao usuarios-service para criar o perfil (leiloeiro/licitante);
 *   5. gera o token JWT e devolve tudo (sem a senha!).
 *
 * @returns {{ usuario, perfil, token }}
 */
async function registrar({ nome, email, senha, papel, dadosPerfil }) {
  validarRegistro({ nome, email, senha, papel });

  const existente = await usuarioRepository.buscarPorEmail(email);
  if (existente) {
    throw new ErroDeValidacao('Ja existe um usuario cadastrado com este e-mail.', 409);
  }

  // Nunca guardamos a senha como o usuario digitou: guardamos o HASH,
  // uma "impressao digital" que nao pode ser revertida para a senha original.
  const senhaHash = await hashSenha(senha);
  const usuario = await usuarioRepository.criar({ nome, email, senhaHash, papel });

  // `let` (em vez de `const`) porque o valor de perfil pode mudar logo abaixo.
  let perfil = null;
  try {
    // `dadosPerfil || {}`: se nao vier nada, usa um objeto vazio.
    perfil = await criarPerfilNoUsuariosService(usuario, papel, dadosPerfil || {});
    // Guarda no auth-db o id do perfil criado no outro servico (liga os dois).
    if (perfil && perfil.id) {
      await usuarioRepository.atualizarPerfilId(usuario.id, perfil.id);
    }
  } catch (err) {
    // Nao derruba o cadastro de autenticacao caso o servico de dominio esteja
    // indisponivel; o perfil pode ser completado depois. Erro fica visivel no log.
    console.error('Falha ao criar perfil no usuarios-service:', err.message);
  }

  const token = gerarToken(usuario);
  // sanitizar remove o senha_hash antes de responder ao cliente.
  return { usuario: sanitizar(usuario), perfil, token };
}

/**
 * COMUNICACAO ENTRE MICROSSERVICOS: faz um POST HTTP para o usuarios-service
 * criar o leiloeiro ou o licitante.
 *
 * A chamada vai direto pela rede interna do Docker (sem passar pelo Kong).
 * O endereco vem da variavel USUARIOS_SERVICE_URL (ex.: http://usuarios-service:3002),
 * definida no docker-compose.yml - o codigo nunca tem o endereco escrito.
 *
 * @returns o perfil criado (objeto JSON) ou null se a URL nao estiver configurada.
 */
async function criarPerfilNoUsuariosService(usuario, papel, dadosPerfil) {
  const usuariosServiceUrl = process.env.USUARIOS_SERVICE_URL;
  // Sem a variavel (servico rodando sozinho), simplesmente nao cria o perfil.
  if (!usuariosServiceUrl) return null;

  // Operador ternario: condicao ? valorSeVerdadeiro : valorSeFalso.
  const rota = papel === 'LEILOEIRO' ? 'leiloeiros' : 'licitantes';
  // fetch() e a funcao nativa do Node 18+ para fazer requisicoes HTTP.
  const resposta = await fetch(`${usuariosServiceUrl}/${rota}`, {
    method: 'POST',
    // Avisa ao outro servico que o corpo enviado esta em formato JSON.
    headers: { 'Content-Type': 'application/json' },
    // JSON.stringify transforma o objeto JavaScript em texto JSON.
    body: JSON.stringify({
      usuarioId: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      // "Spread" (...): copia todos os campos de dadosPerfil para este objeto
      // (ex.: cpf e limiteCredito do licitante, registroProfissional do leiloeiro).
      ...dadosPerfil,
    }),
  });

  // resposta.ok e verdadeiro para status 200-299 (sucesso).
  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`usuarios-service retornou ${resposta.status}: ${corpo}`);
  }
  // Le o corpo da resposta e converte de JSON para objeto.
  return resposta.json();
}

/**
 * Login: confere e-mail + senha e, se estiverem corretos, gera um token JWT.
 * A mensagem de erro e a MESMA para "e-mail nao existe" e "senha errada" de
 * proposito: assim um atacante nao descobre quais e-mails estao cadastrados.
 * 401 = "Unauthorized" (nao autenticado).
 */
async function login({ email, senha }) {
  if (!email || !senha) {
    throw new ErroDeValidacao('Informe e-mail e senha.');
  }

  const usuario = await usuarioRepository.buscarPorEmail(email);
  if (!usuario) {
    throw new ErroDeValidacao('Credenciais invalidas.', 401);
  }

  // bcrypt calcula o hash da senha digitada e compara com o hash guardado.
  const senhaConfere = await compararSenha(senha, usuario.senha_hash);
  if (!senhaConfere) {
    throw new ErroDeValidacao('Credenciais invalidas.', 401);
  }

  const token = gerarToken(usuario);
  return { usuario: sanitizar(usuario), token };
}

/**
 * Devolve uma copia do usuario SEM o campo senha_hash.
 * `...resto` ("rest") junta todos os outros campos num novo objeto.
 * Resultado: senha_hash fica numa variavel descartada e `resto` tem o restante.
 */
function sanitizar(usuario) {
  const { senha_hash, ...resto } = usuario;
  return resto;
}

// validarRegistro e ErroDeValidacao sao exportados tambem para os testes e
// para o controller (que usa instanceof ErroDeValidacao).
module.exports = { registrar, login, validarRegistro, ErroDeValidacao };
