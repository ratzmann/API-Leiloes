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
// Erro de regra de negocio com codigo HTTP (mesmo padrao dos outros servicos).
const { ErroDeValidacao } = require('../utils/erros');

// Lista dos papeis aceitos. Constantes em MAIUSCULAS indicam "valor fixo".
const PAPEIS_VALIDOS = ['LEILOEIRO', 'LICITANTE'];

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
 * O registro e uma operacao DISTRIBUIDA: o usuario fica no auth-db e o perfil
 * no usuarios-db, e nao existe uma transacao unica entre os dois bancos. Por
 * isso ha uma COMPENSACAO (a mesma ideia da Saga de lance): se o passo 4
 * falhar, o usuario criado no passo 3 e APAGADO e o erro real volta ao
 * cliente. Sem isso sobraria um usuario sem perfil - que nao consegue agir
 * (sem perfilId no token) e nem se registrar de novo (e-mail ja usado).
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

  // `let` sem valor inicial: sera preenchida dentro do try.
  let perfil;
  try {
    // `dadosPerfil || {}`: se nao vier nada, usa um objeto vazio.
    perfil = await criarPerfilNoUsuariosService(usuario, papel, dadosPerfil || {});
  } catch (err) {
    // COMPENSACAO: o perfil nao foi criado, entao desfazemos o passo 3.
    console.error('Falha ao criar perfil no usuarios-service:', err.message);
    await desfazerCadastro(usuario.id);
    // Repassa o erro (ja traduzido para 400, 409 ou 503) ao controller.
    throw err;
  }

  // Guarda no auth-db o id do perfil criado no outro servico (liga os dois).
  if (perfil && perfil.id) {
    await usuarioRepository.atualizarPerfilId(usuario.id, perfil.id);
    // Atualiza tambem o objeto em memoria: o token gerado logo abaixo
    // precisa levar o perfilId (usado nas regras de autorizacao).
    usuario.perfil_id = perfil.id;
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
 * Erros (sempre ErroDeValidacao, para o controller responder direito):
 *   - 400 ou 409 do usuarios-service (ex.: CPF invalido, CPF ja cadastrado)
 *     -> o MESMO codigo e a mesma mensagem, para o cliente saber o que corrigir;
 *   - qualquer outra resposta, ou falha de rede -> 503 (tente de novo depois).
 *
 * @returns o perfil criado (objeto JSON) ou null se a URL nao estiver configurada.
 */
async function criarPerfilNoUsuariosService(usuario, papel, dadosPerfil) {
  const usuariosServiceUrl = process.env.USUARIOS_SERVICE_URL;
  // Sem a variavel (servico rodando sozinho), simplesmente nao cria o perfil.
  if (!usuariosServiceUrl) return null;

  // Operador ternario: condicao ? valorSeVerdadeiro : valorSeFalso.
  const rota = papel === 'LEILOEIRO' ? 'leiloeiros' : 'licitantes';
  let resposta;
  try {
    // fetch() e a funcao nativa do Node 18+ para fazer requisicoes HTTP.
    resposta = await fetch(`${usuariosServiceUrl}/${rota}`, {
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
  } catch (err) {
    // Falha de rede: o usuarios-service nem respondeu.
    throw new ErroDeValidacao(
      'Nao foi possivel criar o perfil agora (servico de usuarios indisponivel). Tente novamente.',
      503
    );
  }

  // resposta.ok e verdadeiro para status 200-299 (sucesso).
  if (resposta.ok) {
    // Le o corpo da resposta e converte de JSON para objeto.
    return resposta.json();
  }

  // Recusa de negocio (dado invalido ou duplicado): repassa codigo e mensagem.
  if (resposta.status === 400 || resposta.status === 409) {
    // .catch(() => ({})): se o corpo nao for JSON, usa um objeto vazio.
    const corpo = await resposta.json().catch(() => ({}));
    throw new ErroDeValidacao(corpo.erro || 'Dados do perfil recusados.', resposta.status);
  }
  throw new ErroDeValidacao(
    `Nao foi possivel criar o perfil agora (servico de usuarios respondeu ${resposta.status}). Tente novamente.`,
    503
  );
}

/**
 * COMPENSACAO do registro: apaga o usuario recem-criado quando o perfil nao
 * pode ser criado. Se ate a remocao falhar (ex.: banco fora do ar), apenas
 * registra no log - o erro original do registro continua sendo devolvido.
 */
async function desfazerCadastro(usuarioId) {
  try {
    await usuarioRepository.remover(usuarioId);
  } catch (err) {
    console.error(`Falha ao desfazer o cadastro do usuario ${usuarioId}:`, err.message);
  }
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

// validarRegistro e exportado tambem para ser testado isoladamente.
module.exports = { registrar, login, validarRegistro };
