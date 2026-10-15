// =============================================================================
// clients/http.js  -  FUNCOES BASE para chamar outros microsservicos
// -----------------------------------------------------------------------------
// Todos os clients deste servico (arquivos *Client.js) usam estas funcoes para
// chamar outros microsservicos por REST, direto pela rede do Docker. Assim a
// logica de URL, timeout e erro de rede fica num lugar so.
// (Arquivo identico em auth, leiloes e lances: cada servico tem a sua copia.)
// =============================================================================

// Tempo maximo de espera por resposta: 3000 ms (3 s), configuravel. Sem isso,
// um servico lento travaria quem chama (ex.: a Saga ou o registro).
const TIMEOUT_MS = Number(process.env.SERVICOS_TIMEOUT_MS || 3000);

/**
 * Erro que significa "o outro servico nao respondeu direito"
 * (fora do ar, lento demais, com erro interno 5xx ou sem URL configurada).
 * Quem chama o converte em HTTP 503 (Service Unavailable).
 */
class ServicoIndisponivel extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ServicoIndisponivel';
  }
}

/**
 * Le a URL base de um servico a partir do NOME da variavel de ambiente.
 * process.env[variavel] acessa a propriedade cujo nome esta na variavel
 * (ex.: urlBase('LEILOES_SERVICE_URL') -> 'http://leiloes-service:3003').
 */
function urlBase(variavel) {
  const url = process.env[variavel];
  if (!url) {
    throw new ServicoIndisponivel(`Variavel de ambiente ${variavel} nao configurada.`);
  }
  return url;
}

/**
 * Faz uma requisicao HTTP com timeout.
 * @param servico  nome do servico (so para as mensagens de erro)
 * @param url      endereco completo
 * @param opcoes   { method, body } - por padrao GET sem corpo
 * @returns { status, corpo } nas respostas 2xx e 4xx (quem chama decide o que
 *          fazer); erro de rede, timeout e 5xx viram ServicoIndisponivel.
 *
 * Por que 4xx NAO vira erro aqui? Porque 4xx e uma resposta "de negocio"
 * (ex.: 409 credito insuficiente) e cada client sabe como interpreta-la.
 * Ja 5xx, timeout e falha de rede significam "o servico esta com problema".
 */
async function requisicao(servico, url, { method = 'GET', body } = {}) {
  // AbortController + setTimeout = cancela o fetch se passar do tempo limite.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(url, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      // So envia corpo se houver um (GET nao tem corpo).
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    // Le a resposta como texto e tenta converter para JSON. Se o texto nao for
    // JSON valido, guarda-o dentro de { erro: texto } para nao perder a mensagem.
    const texto = await resposta.text();
    let corpo = null;
    try {
      corpo = texto ? JSON.parse(texto) : null;
    } catch (err) {
      corpo = { erro: texto };
    }

    // 500 a 599 = erro no servidor do outro servico.
    if (resposta.status >= 500) {
      throw new ServicoIndisponivel(`${servico} retornou ${resposta.status}.`);
    }
    return { status: resposta.status, corpo };
  } catch (err) {
    // Qualquer outra falha (rede, timeout) vira ServicoIndisponivel.
    if (err instanceof ServicoIndisponivel) throw err;
    throw new ServicoIndisponivel(`${servico} nao respondeu: ${err.message}`);
  } finally {
    // Sempre cancela o timer, com sucesso ou erro.
    clearTimeout(timeout);
  }
}

module.exports = { requisicao, urlBase, ServicoIndisponivel };
