// =============================================================================
// utils/erros.js  -  TIPO DE ERRO usado nas regras de negocio
// -----------------------------------------------------------------------------
// Uso no service:   throw new ErroDeValidacao('Leilao nao encontrado.', 404);
// Uso no controller: if (err instanceof ErroDeValidacao) -> res.status(err.codigo)
//
// Codigos usados neste servico:
//   400 dado invalido | 404 nao encontrado | 409 conflito de estado/agenda
//   503 usuarios-service indisponivel
// (Arquivo identico em usuarios, leiloes e lances.)
// =============================================================================

// Herda de Error e acrescenta o codigo HTTP (400 se nao for informado).
class ErroDeValidacao extends Error {
  constructor(mensagem, codigo = 400) {
    super(mensagem);
    this.name = 'ErroDeValidacao';
    this.codigo = codigo;
  }
}

module.exports = { ErroDeValidacao };
