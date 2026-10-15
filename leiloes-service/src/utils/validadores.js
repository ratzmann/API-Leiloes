// =============================================================================
// utils/validadores.js  -  FUNCOES DE VALIDACAO do leiloes-service
// -----------------------------------------------------------------------------
// Funcoes pequenas e "puras" (sem banco, sem rede) usadas pelo leilaoService.
// Tambem define a MAQUINA DE ESTADOS do leilao (quais mudancas de status valem).
// =============================================================================

// Todos os status que um leilao pode ter.
const STATUS_VALIDOS = ['AGENDADO', 'ABERTO', 'ENCERRADO', 'CANCELADO'];

// transicoes de status permitidas
// MAQUINA DE ESTADOS: para cada status atual (chave), a lista de status para
// os quais ele pode ir. Desenhando:
//
//     AGENDADO ---> ABERTO ---> ENCERRADO
//         \           |
//          \          v
//           '---> CANCELADO
//
// ENCERRADO e CANCELADO tem lista vazia: sao estados FINAIS (nao saem mais).
const TRANSICOES_PERMITIDAS = {
  AGENDADO: ['ABERTO', 'CANCELADO'],
  ABERTO: ['ENCERRADO', 'CANCELADO'],
  ENCERRADO: [],
  CANCELADO: [],
};

/**
 * @returns true se `valor` for uma data valida (objeto Date ou texto como
 * "2026-10-01T14:00:00Z", o formato ISO 8601).
 * new Date('abc').getTime() da NaN ("Not a Number"), por isso conferimos isNaN.
 */
function dataValida(valor) {
  if (valor instanceof Date) return !Number.isNaN(valor.getTime());
  if (typeof valor !== 'string' || valor.trim() === '') return false;
  return !Number.isNaN(new Date(valor).getTime());
}

/** Converte texto em Date (se ja for Date, devolve como esta). */
function paraData(valor) {
  return valor instanceof Date ? valor : new Date(valor);
}

/** true se for um numero finito maior que zero (aceita decimais: 0.5, 100.25). */
function numeroPositivo(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0;
}

/** true se for um numero INTEIRO maior que zero (1, 2, 3...). */
function inteiroPositivo(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0;
}

/** true se o status estiver na lista STATUS_VALIDOS. */
function statusValido(status) {
  return STATUS_VALIDOS.includes(status);
}

/**
 * Consulta a maquina de estados: pode ir de `statusAtual` para `novoStatus`?
 * TRANSICOES_PERMITIDAS[statusAtual] acessa a propriedade pelo nome guardado
 * na variavel (ex.: TRANSICOES_PERMITIDAS['ABERTO']).
 */
function transicaoPermitida(statusAtual, novoStatus) {
  const permitidas = TRANSICOES_PERMITIDAS[statusAtual];
  return Array.isArray(permitidas) && permitidas.includes(novoStatus);
}

/**
 * true se os dois periodos se sobrepoem: cada um comeca antes do outro terminar.
 * Exemplo: A = 14h-18h e B = 17h-20h -> A comeca antes de B terminar (14<20)
 * e B comeca antes de A terminar (17<18) -> sobrepoem. Se B fosse 18h-20h,
 * 18<18 e falso -> nao sobrepoem (um termina exatamente quando o outro comeca).
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
