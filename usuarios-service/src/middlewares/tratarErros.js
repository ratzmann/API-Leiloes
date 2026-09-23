// =============================================================================
// middlewares/tratarErros.js  -  transforma QUALQUER erro em resposta HTTP
// -----------------------------------------------------------------------------
// MIDDLEWARE DE ERRO: o Express o reconhece por ter QUATRO parametros
// (err, req, res, next). Quando um controller chama next(err), o Express pula
// as rotas e entrega o erro direto aqui. Assim a regra "erro -> resposta" fica
// num lugar so, em vez de repetida em cada controller.
//
// Formato de TODA resposta de erro da API: { "erro": "mensagem" }
// (o Kong usa o mesmo formato nas respostas dele - ver kong/erro.json).
//
//   ErroDeValidacao (regra de negocio) -> o codigo do erro (400, 401, 403, 404,
//                                         409, 503) e a mensagem; + sagaId, se houver
//   corpo que nao e JSON valido        -> 400
//   qualquer outro erro (bug, banco)   -> 500 com mensagem generica; o detalhe
//                                         vai so para o log (nao expor por dentro)
//
// Registrado no app.js DEPOIS das rotas: app.use(criarTratadorDeErros('...')).
// (Arquivo identico nos 4 servicos: cada microsservico tem a sua copia.)
// =============================================================================

const { ErroDeValidacao } = require('../utils/erros');

/**
 * Cria o middleware de erro do servico.
 * @param nomeServico  usado na mensagem generica do 500 (ex.: 'usuarios')
 */
function criarTratadorDeErros(nomeServico) {
  // `next` nao e usado, mas PRECISA estar na lista: sao os 4 parametros que
  // fazem o Express saber que este e um middleware de erro.
  return function tratarErros(err, req, res, next) {
    if (err instanceof ErroDeValidacao) {
      const corpo = { erro: err.message };
      // Erros da Saga de lance carregam o id da saga, para o cliente consultar.
      if (err.sagaId) corpo.sagaId = err.sagaId;
      return res.status(err.codigo).json(corpo);
    }
    // express.json() nao conseguiu ler o corpo (JSON mal formado).
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ erro: 'O corpo da requisicao nao e um JSON valido.' });
    }
    // Erro inesperado: registra no log (docker logs <servico>) e responde generico.
    console.error(err);
    return res.status(500).json({ erro: `Erro interno no servico de ${nomeServico}.` });
  };
}

module.exports = criarTratadorDeErros;
