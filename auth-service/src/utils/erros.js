// =============================================================================
// utils/erros.js  -  TIPO DE ERRO usado nas regras de negocio
// -----------------------------------------------------------------------------
// Quando uma regra e violada (ex.: e-mail invalido), o service faz:
//     throw new ErroDeValidacao('E-mail invalido.');          // 400 por padrao
//     throw new ErroDeValidacao('Credenciais invalidas.', 401);
// e o controller, no tratarErro, transforma isso em resposta HTTP:
//     status = erro.codigo,  corpo = { erro: erro.message }
//
// Codigos usados neste servico:
//   400 dado invalido | 401 credencial errada | 409 e-mail ja cadastrado
// (Arquivo identico nos 4 servicos: cada microsservico e independente.)
// =============================================================================

// `class ... extends Error` cria um TIPO NOVO de erro, herdando tudo do Error
// padrao do JavaScript (mensagem, pilha de chamadas) e acrescentando `codigo`.
// Assim o controller diferencia "erro esperado" (regra de negocio) de
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
