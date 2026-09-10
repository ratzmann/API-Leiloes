class ServicoIndisponivel extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ServicoIndisponivel';
  }
}

module.exports = {
  buscarLeiloeiro: jest.fn(),
  ServicoIndisponivel,
};
