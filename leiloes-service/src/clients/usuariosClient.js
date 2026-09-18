// Chama o usuarios-service direto pela rede do Docker, sem passar pelo Kong.
// A URL vem da variavel USUARIOS_SERVICE_URL (definida no docker-compose).

const TIMEOUT_MS = Number(process.env.USUARIOS_SERVICE_TIMEOUT_MS || 3000);

// retorna o leiloeiro, null se nao existir,
// ou ServicoIndisponivel se o usuarios-service nao responder
async function buscarLeiloeiro(leiloeiroId) {
  const baseUrl = process.env.USUARIOS_SERVICE_URL;
  if (!baseUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(`${baseUrl}/leiloeiros/${leiloeiroId}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (resposta.status === 404) return null;
    if (!resposta.ok) {
      const corpo = await resposta.text();
      throw new ServicoIndisponivel(`usuarios-service retornou ${resposta.status}: ${corpo}`);
    }
    return resposta.json();
  } catch (err) {
    if (err instanceof ServicoIndisponivel) throw err;
    throw new ServicoIndisponivel(`Falha ao consultar usuarios-service: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

class ServicoIndisponivel extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ServicoIndisponivel';
  }
}

module.exports = { buscarLeiloeiro, ServicoIndisponivel };
