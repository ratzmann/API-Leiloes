// =============================================================================
// utils/validadores.js  -  VALIDACOES simples do lances-service
// -----------------------------------------------------------------------------
// Funcoes puras (sem banco e sem rede) que respondem true/false.
// =============================================================================

/**
 * true se `id` for um inteiro maior que zero.
 * Funciona com texto tambem: Number('7') vira 7; Number('abc') vira NaN (falso).
 */
function idValido(id) {
  const num = Number(id);
  return Number.isInteger(num) && num > 0;
}

/**
 * true se `valor` for um numero finito maior que zero (aceita centavos: 10.50).
 * (Number.isFinite ja recusa NaN; o isNaN extra deixa a intencao explicita.)
 */
function valorValido(valor) {
  const num = Number(valor);
  return !Number.isNaN(num) && Number.isFinite(num) && num > 0;
}

module.exports = { idValido, valorValido };
