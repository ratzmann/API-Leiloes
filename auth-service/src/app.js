// =============================================================================
// app.js  -  MONTAGEM da aplicacao Express do auth-service
// -----------------------------------------------------------------------------
// Express e a biblioteca que transforma o Node.js num servidor web.
// Aqui dizemos a ele:
//   - como ler o corpo das requisicoes (JSON);
//   - quais rotas existem (arquivo routes/authRoutes.js);
//   - o que responder quando ninguem conhece a rota pedida (404).
//
// Caminho de uma requisicao dentro deste servico:
//   Kong -> app.js -> routes/authRoutes.js -> controllers/authController.js
//        -> services/authService.js -> repositories/usuarioRepository.js -> Postgres
// =============================================================================

// Importa a biblioteca Express (instalada via npm, listada no package.json).
const express = require('express');
const criarTratadorDeErros = require('./middlewares/tratarErros');
// Importa o "roteador" com as rotas deste servico (/registrar, /login, /health).
const authRoutes = require('./routes/authRoutes');

// Cria a aplicacao. A partir daqui "app" representa o nosso servidor.
const app = express();

// app.use(...) registra um MIDDLEWARE: uma funcao que roda em TODA requisicao,
// antes de ela chegar na rota. express.json() le o corpo da requisicao (texto
// JSON) e o transforma em objeto JavaScript, disponivel em req.body.
app.use(express.json());

// Pendura as rotas na raiz '/'. O Kong recebe "/auth/login" e, por causa do
// strip_path: true (ver kong/kong.yml), repassa so "/login" para ca.
app.use('/', authRoutes);

// Ultimo middleware: se nenhuma rota acima respondeu, a requisicao cai aqui.
// Status 404 = "Not Found" (recurso nao encontrado).
// res.status(...).json(...) define o codigo HTTP e envia um objeto como JSON.
app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

// Middleware de ERRO (4 parametros): recebe o que os controllers passam em
// next(err) e responde sempre no formato { erro } (ver middlewares/tratarErros.js).
// Precisa vir DEPOIS das rotas.
app.use(criarTratadorDeErros('autenticacao'));

// module.exports define o que este arquivo "entrega" para quem fizer require.
// O server.js importa este app para colocar no ar.
module.exports = app;
