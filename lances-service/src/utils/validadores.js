function idValido(id) {
  const num = Number(id);
  return Number.isInteger(num) && num > 0;
}

function valorValido(valor) {
  const num = Number(valor);
  return !Number.isNaN(num) && Number.isFinite(num) && num > 0;
}

module.exports = { idValido, valorValido };
