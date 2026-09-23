// =============================================================================
// utils/erros.js  -  TIPO DE ERRO usado nas regras de negocio
// -----------------------------------------------------------------------------
// Quando uma regra e violada, o service LANCA um ErroDeValidacao com o codigo
// HTTP que a resposta deve ter:
//     throw new ErroDeValidacao('CPF invalido.');               // 400 por padrao
//     throw new ErroDeValidacao('Leilao nao encontrado.', 404);  // outro codigo
// O controller repassa o erro com next(err), e o middleware de erro
// (middlewares/tratarErros.js) responde:  status = erro.codigo,
// corpo = { erro: erro.message } (+ sagaId, nos erros da Saga de lance).
//
// Codigos usados no projeto:
//   400 dado invalido            | 401 sem login ou credencial errada
//   403 sem permissao            | 404 registro nao existe
//   409 conflito com o estado atual (duplicado, sem credito, transicao invalida)
//   503 outro microsservico nao respondeu
// (Arquivo identico nos 4 servicos: cada microsservico tem a sua copia.)
// =============================================================================

// `class ... extends Error` cria um TIPO NOVO de erro, herdando tudo do Error
// padrao do JavaScript (mensagem, pilha de chamadas) e acrescentando `codigo`.
// Assim o middleware de erro diferencia "erro esperado" (regra de negocio) de
// "erro inesperado" (bug) usando `instanceof ErroDeValidacao`.
class ErroDeValidacao extends Error {
  // `codigo = 400` e um valor PADRAO: se ninguem informar, vale 400 (Bad Request).
  constructor(mensagem, codigo = 400) {
    // super(...) chama o constructor da classe "mae" (Error), que guarda a mensagem.
    super(mensagem);
    this.name = 'ErroDeValidacao';
    // `this` e o proprio objeto que esta sendo criado.
    this.codigo = codigo;
  }
}

// Exporta dentro de um objeto para permitir: const { ErroDeValidacao } = require(...)
module.exports = { ErroDeValidacao };
