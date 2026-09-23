// =============================================================================
// clients/usuariosClient.js  -  CLIENTE HTTP do usuarios-service
// -----------------------------------------------------------------------------
// A pasta clients/ guarda o codigo que conversa com OUTROS microsservicos.
// Assim o service nao precisa saber detalhes de HTTP (URL, timeout, status):
// ele so chama buscarLeiloeiro(id) como se fosse uma funcao qualquer.
// Nos testes, este arquivo e trocado pelo mock clients/__mocks__/usuariosClient.js.
// =============================================================================

// Chama o usuarios-service direto pela rede do Docker, sem passar pelo Kong.
// A URL vem da variavel USUARIOS_SERVICE_URL (definida no docker-compose).

// TIMEOUT: tempo maximo de espera pela resposta (3000 ms = 3 s). Sem isso, se o
// outro servico travar, o cadastro de leilao ficaria esperando para sempre.
const TIMEOUT_MS = Number(process.env.USUARIOS_SERVICE_TIMEOUT_MS || 3000);

/**
 * Faz GET {USUARIOS_SERVICE_URL}/leiloeiros/{id}.
 * Tres resultados possiveis:
 *   - objeto do leiloeiro -> existe;
 *   - null                -> nao existe (404) ou a URL nao esta configurada;
 *   - lanca ServicoIndisponivel -> erro de rede, timeout ou erro no outro servico.
 */
async function buscarLeiloeiro(leiloeiroId) {
  const baseUrl = process.env.USUARIOS_SERVICE_URL;
  if (!baseUrl) return null;

  // AbortController permite CANCELAR uma requisicao em andamento.
  // O setTimeout agenda o cancelamento para daqui a TIMEOUT_MS milissegundos.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(`${baseUrl}/leiloeiros/${leiloeiroId}`, {
      // Accept: informa que queremos a resposta em JSON.
      headers: { Accept: 'application/json' },
      // Liga o fetch ao controller: se abort() for chamado, o fetch falha.
      signal: controller.signal,
    });

    if (resposta.status === 404) return null;
    if (!resposta.ok) {
      const corpo = await resposta.text();
      throw new ServicoIndisponivel(`usuarios-service retornou ${resposta.status}: ${corpo}`);
    }
    return resposta.json();
  } catch (err) {
    // Se ja e ServicoIndisponivel, repassa; qualquer outro erro (rede caiu,
    // timeout) e "embrulhado" como ServicoIndisponivel.
    if (err instanceof ServicoIndisponivel) throw err;
    throw new ServicoIndisponivel(`Falha ao consultar usuarios-service: ${err.message}`);
  } finally {
    // Cancela o agendamento do timeout (a resposta ja chegou ou ja falhou).
    clearTimeout(timeout);
  }
}

/**
 * Faz POST {USUARIOS_SERVICE_URL}/reservas/leilao/{id}/liberar - rota INTERNA
 * do usuarios-service que libera todo o credito reservado num leilao.
 * Usado quando o leilao e CANCELADO (Regra 8).
 *   - devolve o resumo { leilaoId, liberadas, reservas };
 *   - devolve null se a URL nao estiver configurada (servico rodando sozinho);
 *   - lanca ServicoIndisponivel em erro de rede, timeout ou resposta nao-2xx.
 */
async function liberarReservasDoLeilao(leilaoId) {
  const baseUrl = process.env.USUARIOS_SERVICE_URL;
  if (!baseUrl) return null;

  // Mesmo esquema de timeout do buscarLeiloeiro (AbortController + setTimeout).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(`${baseUrl}/reservas/leilao/${leilaoId}/liberar`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!resposta.ok) {
      const corpo = await resposta.text();
      throw new ServicoIndisponivel(`usuarios-service retornou ${resposta.status}: ${corpo}`);
    }
    return resposta.json();
  } catch (err) {
    if (err instanceof ServicoIndisponivel) throw err;
    throw new ServicoIndisponivel(`Falha ao liberar reservas no usuarios-service: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Erro especifico para "o outro servico nao respondeu direito".
 * O leilaoService o converte em HTTP 503 (Service Unavailable).
 * (Pode ser declarada depois de buscarLeiloeiro porque so e usada quando a
 * funcao roda, e nessa hora o arquivo inteiro ja foi carregado.)
 */
class ServicoIndisponivel extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ServicoIndisponivel';
  }
}

module.exports = { buscarLeiloeiro, liberarReservasDoLeilao, ServicoIndisponivel };
