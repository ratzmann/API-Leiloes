// O que MUDA de um ambiente para outro (local, dev, homol).
// As variaveis de ambiente sao lidas so aqui; o resto do codigo recebe o objeto pronto.
const { version } = require('../../package.json');

// Swagger so aparece onde se desenvolve. Qualquer outro nome (homol, producao,
// desconhecido) fica sem Swagger: na duvida, desligado.
const AMBIENTES_COM_SWAGGER = ['local', 'dev'];

// 'true'/'false' viram booleano; vazio ou ausente vira undefined (usa o padrao)
function lerBooleano(valor) {
  if (valor === undefined || valor === '') return undefined;
  return String(valor).toLowerCase() === 'true';
}

// Sem APP_ENV: fora de container e 'local'; dentro da imagem Docker
// (NODE_ENV=production) e 'desconhecido', pra nunca ligar o Swagger por esquecimento.
function nomeDoAmbiente(env) {
  if (env.APP_ENV) return env.APP_ENV.toLowerCase();
  return env.NODE_ENV === 'production' ? 'desconhecido' : 'local';
}

function carregarAmbiente(env = process.env) {
  const nome = nomeDoAmbiente(env);
  const swaggerExplicito = lerBooleano(env.SWAGGER_ENABLED);
  return {
    nome,
    // VERSAO_IMAGEM e gravada no build da imagem pelo pipeline (ex.: 1.1.0-dev.12)
    versao: env.VERSAO_IMAGEM || version,
    swaggerHabilitado: swaggerExplicito ?? AMBIENTES_COM_SWAGGER.includes(nome),
  };
}

module.exports = { carregarAmbiente };
