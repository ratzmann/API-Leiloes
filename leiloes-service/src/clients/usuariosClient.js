/**
 * Comunicacao entre microsservicos via REST.
 *
 * O endereco do usuarios-service vem sempre da variavel de ambiente
 * USUARIOS_SERVICE_URL (mesmo padrao que o auth-service usa), e a chamada e
 * feita direto ao container na rede interna do Docker, sem passar pelo Kong.
 * Manter a URL fora do codigo e o que permite trocar o destino (service
 * discovery, outra rede, outro host) nos trabalhos 2 e 3 sem alterar o servico.
 */

const TIMEOUT_MS = Number(process.env.USUARIOS_SERVICE_TIMEOUT_MS || 3000);

/**
 * Busca o leiloeiro responsavel pelo leilao.
 * Retorna o leiloeiro, `null` quando ele nao existe, ou lanca `ServicoIndisponivel`
 * quando o usuarios-service nao responde (para o chamador decidir o que fazer).
 */
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
