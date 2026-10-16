// =============================================================================
// clients/usuariosClient.js  -  CLIENTE HTTP do usuarios-service (auth-service)
// -----------------------------------------------------------------------------
// A pasta clients/ guarda o codigo que conversa com OUTROS microsservicos.
// Assim o authService nao precisa saber detalhes de HTTP (URL, timeout,
// status): ele so chama criarPerfil(...) como se fosse uma funcao qualquer.
// Nos testes, este arquivo e trocado pelo mock clients/__mocks__/usuariosClient.js.
// =============================================================================

const { requisicao, urlBase, ServicoIndisponivel } = require('./http');
const { ErroDeValidacao } = require('../utils/erros');

/**
 * true se a URL do usuarios-service estiver configurada (USUARIOS_SERVICE_URL).
 * No deploy do T2 o auth-service pode rodar SOZINHO: ai o registro so cria a
 * credencial (sem perfil), em vez de responder 503 em todo registro.
 */
function estaConfigurado() {
  return Boolean(process.env.USUARIOS_SERVICE_URL);
}

/**
 * Pede ao usuarios-service para criar o perfil de dominio do usuario:
 * POST {USUARIOS_SERVICE_URL}/leiloeiros  (papel LEILOEIRO) ou
 * POST {USUARIOS_SERVICE_URL}/licitantes  (papel LICITANTE).
 * A chamada vai direto pela rede do Docker. A rota e interna: o Kong bloqueia
 * quem vem de fora, e o usuarios-service exige a chave interna (o header
 * X-Chave-Interna, que o clients/http.js manda sozinho).
 * O `dadosPerfil` traz so os dados do perfil (cpf, limiteCredito,
 * registroProfissional, telefone); usuarioId, nome e e-mail vem SEMPRE do
 * usuario recem-criado, mesmo que o cliente tente manda-los no dadosPerfil.
 *
 * @returns o perfil criado (objeto com id)
 * @throws  ErroDeValidacao com o MESMO codigo em recusas de negocio
 *          (400 dado invalido, 409 duplicado), para o cliente saber o que corrigir;
 *          ServicoIndisponivel em qualquer outra falha (rede, timeout, 5xx).
 */
async function criarPerfil(usuario, papel, dadosPerfil) {
  const base = urlBase('USUARIOS_SERVICE_URL');
  // Operador ternario: condicao ? valorSeVerdadeiro : valorSeFalso.
  const rota = papel === 'LEILOEIRO' ? 'leiloeiros' : 'licitantes';
  const { status, corpo } = await requisicao('usuarios-service', `${base}/${rota}`, {
    method: 'POST',
    body: {
      // "Spread" (...): copia todos os campos de dadosPerfil para este objeto
      // (ex.: cpf e limiteCredito do licitante, registroProfissional do leiloeiro).
      // Vem PRIMEIRO de proposito: os campos escritos depois dele substituem os
      // de mesmo nome, entao ninguem troca o dono nem o e-mail do perfil.
      ...dadosPerfil,
      usuarioId: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
    },
  });

  if (status === 200 || status === 201) return corpo;
  if (status === 400 || status === 409) {
    // (corpo && corpo.erro): so le corpo.erro se corpo existir (evita erro com null).
    throw new ErroDeValidacao((corpo && corpo.erro) || 'Dados do perfil recusados.', status);
  }
  throw new ServicoIndisponivel(`usuarios-service respondeu ${status} ao criar o perfil.`);
}

module.exports = { estaConfigurado, criarPerfil, ServicoIndisponivel };
