const { requisicao, urlBase, ServicoIndisponivel } = require('./http');

/**
 * Passo 1 da Saga: pergunta ao leiloes-service se o leilao aceita lances.
 * Devolve a disponibilidade, ou `null` quando o leilao nao existe.
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
