// =============================================================================
// config/ambiente.js  -  O QUE MUDA de um ambiente para outro (T2)
// -----------------------------------------------------------------------------
// O mesmo codigo roda em tres lugares: na maquina de quem desenvolve (local),
// no Render DEV (branch develop) e no Render HOMOL (branch main). Este arquivo
// le as variaveis de ambiente UMA vez e devolve um objeto pronto:
//   { nome: 'dev', versao: '1.1.0-dev.12', swaggerHabilitado: true }
// O resto do codigo (app.js, server.js) so recebe esse objeto, sem ler
// process.env - assim os testes criam um ambiente "DEV" e outro "HOMOL" a vontade.
//
// Quem chama: server.js (carregarAmbiente) e os testes (tests/ambiente.test.js).
// (Arquivo identico nos 4 servicos: cada microsservico tem a sua copia.)
// =============================================================================

// Desestruturacao: pega so o campo "version" do package.json (Semantic Versioning).
const { version } = require('../../package.json');

// Swagger so aparece onde se desenvolve. Qualquer outro nome (homol, producao,
// desconhecido) fica sem Swagger: na duvida, desligado.
const AMBIENTES_COM_SWAGGER = ['local', 'dev'];

/**
 * Converte o texto de uma variavel de ambiente em booleano:
 * 'true'/'false' (sem diferenca de maiusculas) viram true/false; vazio ou
 * ausente vira undefined, que significa "use o padrao".
 */
function lerBooleano(valor) {
  if (valor === undefined || valor === '') return undefined;
  return String(valor).toLowerCase() === 'true';
}

/**
 * Descobre o nome do ambiente. Usa APP_ENV quando existe. Sem APP_ENV: fora de
 * container e 'local'; dentro da imagem Docker (NODE_ENV=production) e
 * 'desconhecido', pra nunca ligar o Swagger por esquecimento.
 */
function nomeDoAmbiente(env) {
  if (env.APP_ENV) return env.APP_ENV.toLowerCase();
  return env.NODE_ENV === 'production' ? 'desconhecido' : 'local';
}

/**
 * Le o ambiente e devolve { nome, versao, swaggerHabilitado }.
 * Recebe `env` (padrao: process.env; os testes passam um objeto proprio).
 * - versao: VERSAO_IMAGEM, gravada no build da imagem pelo pipeline
 *   (ex.: 1.1.0-dev.12); sem ela, a do package.json;
 * - swaggerHabilitado: SWAGGER_ENABLED, se informado; senao, so em local/dev.
 * O operador ?? usa o valor da direita so quando o da esquerda e undefined/null.
 */
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
