class ErroDeValidacao extends Error {
  constructor(mensagem, codigo = 400) {
    super(mensagem);
    this.name = 'ErroDeValidacao';
    this.codigo = codigo;
  }
}

module.exports = { ErroDeValidacao };
