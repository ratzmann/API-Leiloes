// Chamadas REST para os outros servicos, direto pela rede do Docker.
// Tem timeout pra um servico lento nao travar a saga.

const TIMEOUT_MS = Number(process.env.SERVICOS_TIMEOUT_MS || 3000);

class ServicoIndisponivel extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ServicoIndisponivel';
  }
}

function urlBase(variavel) {
  const url = process.env[variavel];
  if (!url) {
    throw new ServicoIndisponivel(`Variavel de ambiente ${variavel} nao configurada.`);
  }
  return url;
}

// devolve { status, corpo } nos 2xx e 4xx (quem chama decide o que fazer);
// erro de rede, timeout e 5xx viram ServicoIndisponivel
async function requisicao(servico, url, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(url, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const texto = await resposta.text();
    let corpo = null;
    try {
      corpo = texto ? JSON.parse(texto) : null;
    } catch (err) {
      corpo = { erro: texto };
    }

    if (resposta.status >= 500) {
      throw new ServicoIndisponivel(`${servico} retornou ${resposta.status}.`);
    }
    return { status: resposta.status, corpo };
  } catch (err) {
    if (err instanceof ServicoIndisponivel) throw err;
    throw new ServicoIndisponivel(`${servico} nao respondeu: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { requisicao, urlBase, ServicoIndisponivel };
