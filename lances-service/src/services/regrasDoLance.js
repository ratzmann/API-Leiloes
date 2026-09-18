const { ErroDeValidacao } = require('../utils/erros');

const centavos = (valor) => Math.round(Number(valor) * 100);
const brl = (valor) => `R$ ${Number(valor).toFixed(2)}`;

// primeiro lance: pelo menos o lance inicial.
// depois: maior lance + incremento minimo, e ninguem cobre o proprio lance.
function validarValorDoLance({ valor, licitanteId, maiorLance, lanceInicial, incrementoMinimo }) {
  if (!maiorLance) {
    if (centavos(valor) < centavos(lanceInicial)) {
      throw new ErroDeValidacao(`O primeiro lance deve ser de pelo menos ${brl(lanceInicial)} (lance inicial).`);
    }
    return;
  }

  if (Number(maiorLance.licitante_id) === Number(licitanteId)) {
    throw new ErroDeValidacao('Voce ja detem o maior lance atual para este leilao.');
  }

  const minimo = centavos(maiorLance.valor) + centavos(incrementoMinimo);
  if (centavos(valor) < minimo) {
    throw new ErroDeValidacao(
      `O lance deve ser de pelo menos ${brl(minimo / 100)} ` +
        `(maior lance ${brl(maiorLance.valor)} + incremento minimo ${brl(incrementoMinimo)}).`
    );
  }
}

module.exports = { validarValorDoLance };
