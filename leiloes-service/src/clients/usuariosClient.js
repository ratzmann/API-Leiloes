// =============================================================================
// clients/usuariosClient.js  -  CLIENTE HTTP do usuarios-service (leiloes-service)
// -----------------------------------------------------------------------------
// A pasta clients/ guarda o codigo que conversa com OUTROS microsservicos.
// Assim o service nao precisa saber detalhes de HTTP (URL, timeout, status):
// ele so chama buscarLeiloeiro(id) como se fosse uma funcao qualquer.
// URL, timeout e erros de rede ficam no helper clients/http.js.
// Nos testes, este arquivo e trocado pelo mock clients/__mocks__/usuariosClient.js.
// =============================================================================

const { requisicao, urlBase, ServicoIndisponivel } = require('./http');

/**
 * Regra 3: GET {USUARIOS_SERVICE_URL}/leiloeiros/{id} - o leiloeiro existe?
 * Tres resultados possiveis:
 *   - objeto do leiloeiro         -> existe;
 *   - null                        -> nao existe (404);
 *   - lanca ServicoIndisponivel   -> rede, timeout, 5xx ou URL nao configurada.
 */
async function buscarLeiloeiro(leiloeiroId) {
  const base = urlBase('USUARIOS_SERVICE_URL');
  const { status, corpo } = await requisicao('usuarios-service', `${base}/leiloeiros/${leiloeiroId}`);

  if (status === 200) return corpo;
  if (status === 404) return null;
  throw new ServicoIndisponivel(`usuarios-service respondeu ${status} ao buscar o leiloeiro.`);
}

/**
 * Regra 8: POST {USUARIOS_SERVICE_URL}/reservas/leilao/{id}/liberar - rota
 * INTERNA do usuarios-service que libera todo o credito reservado num leilao
 * CANCELADO.
 * @returns o resumo { leilaoId, liberadas, reservas }
 * @throws  ServicoIndisponivel em qualquer resposta diferente de 200 ou falha de rede
 */
async function liberarReservasDoLeilao(leilaoId) {
  const base = urlBase('USUARIOS_SERVICE_URL');
  const { status, corpo } = await requisicao(
    'usuarios-service',
    `${base}/reservas/leilao/${leilaoId}/liberar`,
    { method: 'POST' }
  );

  if (status === 200) return corpo;
  throw new ServicoIndisponivel(`usuarios-service respondeu ${status} ao liberar as reservas do leilao.`);
}

module.exports = { buscarLeiloeiro, liberarReservasDoLeilao, ServicoIndisponivel };
