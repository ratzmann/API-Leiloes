// =============================================================================
// __mocks__/reservaRepository.js  -  versao FALSA (mock) usada SO nos testes
// -----------------------------------------------------------------------------
// Quando um teste chama jest.mock('.../reservaRepository.js'), o Jest troca o arquivo
// verdadeiro por este. Cada funcao vira um jest.fn(): uma funcao "espia" que
// nao faz nada sozinha, mas que o teste pode programar (ex.:
// mockResolvedValue(...) = "quando chamada, devolva isto") e depois conferir
// (ex.: toHaveBeenCalledWith(...) = "foi chamada com estes argumentos?").
// Assim testamos as regras de negocio SEM banco de dados e SEM rede.
// =============================================================================

module.exports = {
  emTransacao: jest.fn(),
  somarReservado: jest.fn(),
  listarPorLicitante: jest.fn(),
};
