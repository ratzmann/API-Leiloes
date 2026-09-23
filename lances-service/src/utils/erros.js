// =============================================================================
// utils/erros.js  -  TIPO DE ERRO usado nas regras de negocio
// -----------------------------------------------------------------------------
// throw new ErroDeValidacao('mensagem', codigoHttp)  ->  o controller responde
// com esse codigo e { erro: mensagem }.
// Neste servico o erro pode ganhar tambem a propriedade `sagaId` (atribuida
// pela Saga), que o controller inclui na resposta.
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
