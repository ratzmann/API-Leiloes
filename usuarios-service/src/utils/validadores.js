const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailValido(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email);
}

function cpfValido(cpf) {
  if (typeof cpf !== 'string') return false;
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(limpo)) return false; // todos os digitos iguais

  const calcularDigito = (base) => {
    let soma = 0;
    let peso = base.length + 1;
    for (const char of base) {
      soma += Number(char) * peso;
      peso -= 1;
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const digito1 = calcularDigito(limpo.slice(0, 9));
  const digito2 = calcularDigito(limpo.slice(0, 9) + digito1);

  return limpo === limpo.slice(0, 9) + String(digito1) + String(digito2);
}

module.exports = { emailValido, cpfValido };
