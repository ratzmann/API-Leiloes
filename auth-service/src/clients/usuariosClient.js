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
 * Pede ao usuarios-service para criar o perfil de dominio do usuario:
 * POST {USUARIOS_SERVICE_URL}/leiloeiros  (papel LEILOEIRO) ou
 * POST {USUARIOS_SERVICE_URL}/licitantes  (papel LICITANTE).
 * A chamada vai direto pela rede do Docker (a rota e interna: o Kong bloqueia).
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
      usuarioId: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      // "Spread" (...): copia todos os campos de dadosPerfil para este objeto
      // (ex.: cpf e limiteCredito do licitante, registroProfissional do leiloeiro).
      ...dadosPerfil,
    },
  });

  if (status === 200 || status === 201) return corpo;
  if (status === 400 || status === 409) {
    // (corpo && corpo.erro): so le corpo.erro se corpo existir (evita erro com null).
    throw new ErroDeValidacao((corpo && corpo.erro) || 'Dados do perfil recusados.', status);
  }
  throw new ServicoIndisponivel(`usuarios-service respondeu ${status} ao criar o perfil.`);
}

module.exports = { criarPerfil, ServicoIndisponivel };
