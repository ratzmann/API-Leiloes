// =============================================================================
// controllers/authController.js  -  CAMADA DE CONTROLLER do auth-service
// -----------------------------------------------------------------------------
// O controller e o "tradutor" entre o mundo HTTP e o mundo das regras:
//   1. le os dados que vieram na requisicao (req.body, req.params...);
//   2. chama o service, que e quem sabe as regras de negocio;
//   3. devolve a resposta HTTP com o status certo (201, 200, 400, 500...).
// Ele NAO decide se um e-mail e valido nem acessa o banco - isso e do service
// e do repository. Manter cada camada com uma so responsabilidade deixa o
// codigo mais facil de entender e de testar.
//
// Quem chama: routes/authRoutes.js   |   Quem e chamado: services/authService.js
// =============================================================================

const authService = require('../services/authService');

/**
 * POST /registrar  -  cadastra um novo usuario.
 *
 * `async` marca a funcao como assincrona: dentro dela podemos usar `await`
 * para "esperar" operacoes demoradas (banco, rede) sem travar o servidor.
 *
 * @param req  objeto da REQUISICAO (o que o cliente mandou)
 * @param res  objeto da RESPOSTA (o que vamos devolver)
 */
async function registrar(req, res) {
  // try/catch: tenta executar o bloco "try"; se qualquer linha lancar um erro
  // (throw), a execucao pula direto para o "catch", que trata o problema.
  try {
    // Desestruturacao: tira do objeto req.body so os campos que interessam.
    // Equivale a: const nome = req.body.nome; const email = req.body.email; ...
    const { nome, email, senha, papel, dadosPerfil } = req.body;
    // await: espera o service terminar (ele grava no banco e chama outro servico).
    const resultado = await authService.registrar({ nome, email, senha, papel, dadosPerfil });
    // 201 = "Created": o recurso foi criado com sucesso.
    res.status(201).json(resultado);
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * POST /login  -  confere e-mail e senha e devolve um token JWT.
 */
async function login(req, res) {
  try {
    const { email, senha } = req.body;
    const resultado = await authService.login({ email, senha });
    // 200 = "OK": deu tudo certo.
    res.status(200).json(resultado);
  } catch (err) {
    tratarErro(res, err);
  }
}

/**
 * Converte um erro em resposta HTTP.
 *  - ErroDeValidacao (erro "esperado", de regra de negocio): usamos o codigo
 *    que veio junto no erro (400 dado invalido, 401 credencial errada,
 *    409 conflito/duplicado) e mostramos a mensagem ao cliente.
 *  - Qualquer outro erro (bug, banco fora do ar...): registramos no log e
 *    devolvemos 500 com uma mensagem generica, sem expor detalhes internos.
 */
function tratarErro(res, err) {
  // instanceof pergunta: "este objeto foi criado a partir desta classe?"
  if (err instanceof authService.ErroDeValidacao) {
    // `return` encerra a funcao aqui, para nao executar as linhas de baixo.
    return res.status(err.codigo).json({ erro: err.message });
  }
  // console.error escreve no log do container (docker logs auth-service).
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno no servico de autenticacao.' });
}

// Exporta so o que as rotas precisam; tratarErro fica "privada" deste arquivo.
module.exports = { registrar, login };
