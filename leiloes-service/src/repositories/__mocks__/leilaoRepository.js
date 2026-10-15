// =============================================================================
// __mocks__/leilaoRepository.js  -  versao FALSA (mock) usada SO nos testes
// -----------------------------------------------------------------------------
// Quando um teste chama jest.mock('.../leilaoRepository.js'), o Jest troca o arquivo
// verdadeiro por este. Cada funcao vira um jest.fn(): uma funcao "espia" que
// nao faz nada sozinha, mas que o teste pode programar (ex.:
// mockResolvedValue(...) = "quando chamada, devolva isto") e depois conferir
// (ex.: toHaveBeenCalledWith(...) = "foi chamada com estes argumentos?").
// Assim testamos as regras de negocio SEM banco de dados e SEM rede.
// =============================================================================

module.exports = {
  listar: jest.fn(),
  buscarPorId: jest.fn(),
  listarAtivosPorLeiloeiro: jest.fn(),
  criar: jest.fn(),
  atualizar: jest.fn(),
  atualizarStatus: jest.fn(),
  remover: jest.fn(),
};
