// =============================================================================
// __mocks__/usuariosClient.js  -  versao FALSA (mock) usada SO nos testes
// -----------------------------------------------------------------------------
// Quando um teste chama jest.mock('.../usuariosClient.js'), o Jest troca o arquivo
// verdadeiro por este. Cada funcao vira um jest.fn(): uma funcao "espia" que
// nao faz nada sozinha, mas que o teste pode programar (ex.:
// mockResolvedValue(...) = "quando chamada, devolva isto") e depois conferir
// (ex.: toHaveBeenCalledWith(...) = "foi chamada com estes argumentos?").
// Assim testamos as regras de negocio SEM banco de dados e SEM rede.
// =============================================================================

class ServicoIndisponivel extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ServicoIndisponivel';
  }
}

module.exports = {
  buscarLeiloeiro: jest.fn(),
  liberarReservasDoLeilao: jest.fn(),
  ServicoIndisponivel,
};
