/**
 * Base da comunicacao REST com os outros microsservicos.
 *
 * As URLs vem sempre de variavel de ambiente e a chamada vai direto ao
 * container pela rede interna do Docker, sem passar pelo Kong. Timeout
 * explicito: um servico lento nao pode segurar a Saga indefinidamente.
 */

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

/**
 * Faz a chamada e devolve { status, corpo } para respostas 2xx e 4xx — quem
 * chama decide o significado de cada 4xx. Falha de rede, timeout e 5xx viram
 * ServicoIndisponivel.
 */
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
