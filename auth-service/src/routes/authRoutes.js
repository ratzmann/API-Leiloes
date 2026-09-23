// =============================================================================
// routes/authRoutes.js  -  CAMADA DE ROTAS do auth-service
// -----------------------------------------------------------------------------
// Uma "rota" e a combinacao METODO HTTP + CAMINHO, por exemplo "POST /login".
// Este arquivo so faz a ligacao: "quando chegar tal rota, chame tal funcao do
// controller". Nenhuma regra de negocio fica aqui.
//
// Rotas deste servico (vistas de fora, pelo Kong, com o prefixo /auth):
//   POST /auth/registrar  -> cria usuario e devolve um token JWT
//   POST /auth/login      -> confere e-mail/senha e devolve um token JWT
//   GET  /auth/health     -> "estou vivo?" (healthcheck)
// Estas rotas sao PUBLICAS: o Kong nao exige token para elas (ver kong.yml),
// afinal quem ainda nao fez login nao tem token.
// =============================================================================

// Router e um "mini-app" do Express que agrupa rotas relacionadas.
const { Router } = require('express');
// O controller tem as funcoes que tratam cada rota.
const authController = require('../controllers/authController');

const router = Router();

// POST = metodo HTTP usado para ENVIAR dados (criar algo, fazer login).
// Repare que passamos a FUNCAO sem parenteses: nao estamos chamando-a agora;
// o Express vai chama-la depois, quando uma requisicao chegar, entregando (req, res).
router.post('/registrar', authController.registrar);
router.post('/login', authController.login);

// GET = metodo HTTP usado para LER dados. Aqui a funcao foi escrita "inline"
// (arrow function) porque e trivial: responde um JSON dizendo que esta tudo ok.
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-service' }));

module.exports = router;
