// =============================================================================
// utils/erros.js  -  TIPO DE ERRO usado nas regras de negocio
// -----------------------------------------------------------------------------
// Quando uma regra e violada (ex.: CPF invalido), o service faz:
//     throw new ErroDeValidacao('CPF invalido.');          // 400 por padrao
//     throw new ErroDeValidacao('Nao encontrado.', 404);   // com outro codigo
// e o controller, no tratarErro, transforma isso em resposta HTTP:
//     status = erro.codigo,  corpo = { erro: erro.message }
//
// Codigos HTTP mais usados no projeto:
//   400 Bad Request  -> dado invalido
//   404 Not Found    -> registro nao existe
//   409 Conflict     -> conflito com o estado atual (duplicado, sem credito...)
//   503 Service Unavailable -> outro microsservico nao respondeu
// (Arquivo identico em usuarios, leiloes e lances: cada servico e independente.)
// =============================================================================

// `extends Error`: herda tudo do erro padrao do JavaScript e acrescenta `codigo`.
class ErroDeValidacao extends Error {
  // codigo = 400 e o valor padrao, usado quando nenhum codigo e informado.
  constructor(mensagem, codigo = 400) {
    // super() chama o constructor de Error, que guarda a mensagem em this.message.
    super(mensagem);
    this.name = 'ErroDeValidacao';
    this.codigo = codigo;
  }
}

// Exporta dentro de um objeto para permitir: const { ErroDeValidacao } = require(...)
module.exports = { ErroDeValidacao };
