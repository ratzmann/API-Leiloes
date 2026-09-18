const { requisicao, urlBase, ServicoIndisponivel } = require('./http');

// passo 1 da saga: o leilao existe e esta aceitando lance? (null = nao existe)
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
