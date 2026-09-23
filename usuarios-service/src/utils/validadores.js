// =============================================================================
// utils/validadores.js  -  FUNCOES DE VALIDACAO reutilizaveis (usuarios-service)
// -----------------------------------------------------------------------------
// Funcoes "puras": recebem um valor e devolvem true/false, sem acessar banco
// nem rede. Por isso sao faceis de testar e de reaproveitar nos services.
// =============================================================================

// Regex de e-mail: "algo" + @ + "algo" + . + "algo", sem espacos.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @returns true se `email` for um texto com formato de e-mail.
 * typeof confere o TIPO do valor ('string', 'number', 'object'...).
 */
function emailValido(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email);
}

/**
 * Valida um CPF pelos DIGITOS VERIFICADORES (os dois ultimos numeros).
 *
 * Como funciona o calculo do CPF (ex.: 529.982.247-25):
 *   1. pega os 9 primeiros digitos e multiplica cada um por pesos 10, 9, 8 ... 2;
 *   2. soma tudo, multiplica por 10 e tira o resto da divisao por 11;
 *      (resto 10 vira 0) -> esse e o 1o digito verificador;
 *   3. repete com os 10 primeiros digitos e pesos 11 ... 2 -> 2o digito;
 *   4. o CPF e valido se os digitos calculados baterem com os informados.
 *
 * @returns true se o CPF for valido.
 */
function cpfValido(cpf) {
  if (typeof cpf !== 'string') return false;
  // replace(/\D/g, '') remove tudo que NAO e digito (\D), em todo o texto (g).
  // "529.982.247-25" vira "52998224725".
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11) return false;
  // Regex que detecta 11 digitos iguais (ex.: 11111111111), que passariam
  // no calculo mas nao sao CPFs validos.
  if (/^(\d)\1{10}$/.test(limpo)) return false; // todos os digitos iguais

  // Funcao dentro de funcao (arrow function guardada numa constante).
  // Recebe a "base" (9 ou 10 digitos) e devolve o digito verificador.
  const calcularDigito = (base) => {
    let soma = 0;
    // Com 9 digitos o primeiro peso e 10; com 10 digitos, e 11.
    let peso = base.length + 1;
    // for...of percorre cada caractere do texto.
    for (const char of base) {
      soma += Number(char) * peso;
      peso -= 1;
    }
    // % e o operador "resto da divisao".
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  // slice(0, 9) pega os caracteres da posicao 0 ate a 8 (os 9 primeiros).
  const digito1 = calcularDigito(limpo.slice(0, 9));
  const digito2 = calcularDigito(limpo.slice(0, 9) + digito1);

  // Remonta o CPF com os digitos calculados e compara com o informado.
  return limpo === limpo.slice(0, 9) + String(digito1) + String(digito2);
}

module.exports = { emailValido, cpfValido };
