const STATUS_VALIDOS = ['AGENDADO', 'ABERTO', 'ENCERRADO', 'CANCELADO'];

// Transicoes permitidas no ciclo de vida de um leilao.
const TRANSICOES_PERMITIDAS = {
  AGENDADO: ['ABERTO', 'CANCELADO'],
  ABERTO: ['ENCERRADO', 'CANCELADO'],
  ENCERRADO: [],
  CANCELADO: [],
};

function dataValida(valor) {
  if (valor instanceof Date) return !Number.isNaN(valor.getTime());
  if (typeof valor !== 'string' || valor.trim() === '') return false;
  return !Number.isNaN(new Date(valor).getTime());
}

function paraData(valor) {
  return valor instanceof Date ? valor : new Date(valor);
}

function numeroPositivo(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0;
}

function inteiroPositivo(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0;
}

function statusValido(status) {
  return STATUS_VALIDOS.includes(status);
}

function transicaoPermitida(statusAtual, novoStatus) {
  const permitidas = TRANSICOES_PERMITIDAS[statusAtual];
  return Array.isArray(permitidas) && permitidas.includes(novoStatus);
}

/**
 * Dois periodos se sobrepoem quando um comeca antes do outro terminar.
 * Usado para impedir que o mesmo leiloeiro conduza dois eventos ao mesmo tempo.
 */
function periodosSobrepoem(inicioA, fimA, inicioB, fimB) {
  return paraData(inicioA) < paraData(fimB) && paraData(inicioB) < paraData(fimA);
}

module.exports = {
  STATUS_VALIDOS,
  TRANSICOES_PERMITIDAS,
  dataValida,
  paraData,
  numeroPositivo,
  inteiroPositivo,
  statusValido,
  transicaoPermitida,
  periodosSobrepoem,
};
