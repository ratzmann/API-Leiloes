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
async function registrar(req, res, next) {
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
    next(err);
  }
}

/**
 * POST /login  -  confere e-mail e senha e devolve um token JWT.
 */
async function login(req, res, next) {
  try {
    const { email, senha } = req.body;
    const resultado = await authService.login({ email, senha });
    // 200 = "OK": deu tudo certo.
    res.status(200).json(resultado);
  } catch (err) {
    next(err);
  }
}

// Exporta as funcoes que as rotas usam. Os erros sao respondidos pelo
// middleware de erro (middlewares/tratarErros.js), via next(err).
module.exports = { registrar, login };
