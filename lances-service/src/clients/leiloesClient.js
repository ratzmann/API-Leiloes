// =============================================================================
// clients/leiloesClient.js  -  CLIENTE HTTP do leiloes-service
// -----------------------------------------------------------------------------
// Usado no PASSO 1 da Saga: antes de mexer em credito, pergunta ao
// leiloes-service se o leilao existe e esta aceitando lances.
// Chamada: GET {LEILOES_SERVICE_URL}/leiloes/:id/disponibilidade
// =============================================================================

const { requisicao, urlBase, ServicoIndisponivel } = require('./http');

// passo 1 da saga: o leilao existe e esta aceitando lance? (null = nao existe)
/**
 * @returns objeto { id, status, aceitandoLances, lanceInicial, incrementoMinimo, ... }
 *          ou null se o leilao nao existir (404).
 * Qualquer outro status inesperado vira ServicoIndisponivel.
 */
async function consultarDisponibilidade(leilaoId) {
  const base = urlBase('LEILOES_SERVICE_URL');
  const { status, corpo } = await requisicao(
    'leiloes-service',
    `${base}/leiloes/${leilaoId}/disponibilidade`
  );

  if (status === 404) return null;
  if (status !== 200) {
    throw new ServicoIndisponivel(`leiloes-service respondeu ${status} ao consultar disponibilidade.`);
  }
  return corpo;
}

module.exports = { consultarDisponibilidade };
