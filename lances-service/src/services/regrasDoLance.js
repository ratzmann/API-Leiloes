// =============================================================================
// services/regrasDoLance.js  -  REGRA DE VALOR do lance (funcao pura)
// -----------------------------------------------------------------------------
// Implementa as Regras 4 (valor minimo) e 5 (nao cobrir o proprio lance).
//
// Separada num arquivo proprio porque a Saga a usa DUAS vezes:
//   1. no passo 1, para recusar cedo um lance baixo (antes de reservar credito);
//   2. no passo 3, de novo, com o leilao travado - porque entre o passo 1 e o 3
//      outro licitante pode ter dado um lance maior.
// Nao acessa banco nem rede: recebe tudo por parametro. Facil de testar
// (ver tests/regrasDoLance.test.js).
// =============================================================================

const { ErroDeValidacao } = require('../utils/erros');

// Trabalha em centavos inteiros para evitar erros de ponto flutuante
// (ex.: 0.1 + 0.2 = 0.30000000000000004 em JavaScript).
const centavos = (valor) => Math.round(Number(valor) * 100);
// Formata em reais: 5000 -> "R$ 5000.00".
const brl = (valor) => `R$ ${Number(valor).toFixed(2)}`;

/**
 * Regras 4 e 5. Lanca ErroDeValidacao (400) se o valor nao for aceitavel; senao, nao faz nada.
 *
 * Exemplo: lance inicial 5000, incremento 100.
 *   - sem lances ainda: aceita >= 5000;
 *   - maior lance atual 5000 (de outra pessoa): aceita >= 5100;
 *   - maior lance atual e do PROPRIO licitante: recusa (nao cobre a si mesmo).
 *
 * @param maiorLance  o maior lance atual (objeto do banco) ou null se nao houver
 */
function validarValorDoLance({ valor, licitanteId, maiorLance, lanceInicial, incrementoMinimo }) {
  // Caso 1: e o PRIMEIRO lance do leilao.
  if (!maiorLance) {
    if (centavos(valor) < centavos(lanceInicial)) {
      throw new ErroDeValidacao(`O primeiro lance deve ser de pelo menos ${brl(lanceInicial)} (lance inicial).`);
    }
    // return sem valor: encerra a funcao (lance aceito).
    return;
  }

  // Caso 2: ja existe lance. O licitante que ja esta ganhando nao pode cobrir a si mesmo.
  if (Number(maiorLance.licitante_id) === Number(licitanteId)) {
    throw new ErroDeValidacao('Voce ja detem o maior lance atual para este leilao.');
  }

  // Caso 3: precisa superar o maior lance em pelo menos o incremento minimo.
  const minimo = centavos(maiorLance.valor) + centavos(incrementoMinimo);
  if (centavos(valor) < minimo) {
    throw new ErroDeValidacao(
      `O lance deve ser de pelo menos ${brl(minimo / 100)} ` +
        `(maior lance ${brl(maiorLance.valor)} + incremento minimo ${brl(incrementoMinimo)}).`
    );
  }
}

module.exports = { validarValorDoLance };
