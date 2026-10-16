// =============================================================================
// tests/leiloesClient.test.js  -  testes do cliente HTTP do leiloes-service
// -----------------------------------------------------------------------------
// O `fetch` global e trocado por um jest.fn(), como no usuariosClient.test.js.
// Alem do passo 1 da Saga (consultarDisponibilidade), aqui ficam os casos do
// helper clients/http.js: corpo que nao e JSON, corpo vazio e tempo limite.
// =============================================================================

const leiloesClient = require('../src/clients/leiloesClient');
const { ServicoIndisponivel } = require('../src/clients/http');

/** Resposta falsa no formato que o fetch devolve (status + text()). */
const resposta = (status, corpo) => ({ status, text: async () => JSON.stringify(corpo) });

beforeEach(() => {
  process.env.LEILOES_SERVICE_URL = 'http://leiloes-service:3003';
  global.fetch = jest.fn();
});

describe('leiloesClient.consultarDisponibilidade (passo 1 da Saga, Regra 3)', () => {
  test('GET /leiloes/:id/disponibilidade; 200 devolve a disponibilidade', async () => {
    const disponibilidade = { id: 1, status: 'ABERTO', aceitandoLances: true, lanceInicial: 1000 };
    global.fetch.mockResolvedValue(resposta(200, disponibilidade));

    await expect(leiloesClient.consultarDisponibilidade(1)).resolves.toEqual(disponibilidade);
    const [url, opcoes] = global.fetch.mock.calls[0];
    expect(url).toBe('http://leiloes-service:3003/leiloes/1/disponibilidade');
    expect(opcoes.method).toBe('GET');
  });

  test('404 devolve null (o leilao nao existe)', async () => {
    global.fetch.mockResolvedValue(resposta(404, { erro: 'Leilao nao encontrado.' }));
    await expect(leiloesClient.consultarDisponibilidade(999)).resolves.toBeNull();
  });

  test('outro status, 5xx, falha de rede e URL ausente viram ServicoIndisponivel', async () => {
    global.fetch.mockResolvedValueOnce(resposta(400, { erro: 'ID invalido.' }));
    await expect(leiloesClient.consultarDisponibilidade(1)).rejects.toBeInstanceOf(ServicoIndisponivel);

    global.fetch.mockResolvedValueOnce(resposta(503, {}));
    await expect(leiloesClient.consultarDisponibilidade(1)).rejects.toThrow('leiloes-service retornou 503.');

    global.fetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(leiloesClient.consultarDisponibilidade(1)).rejects.toThrow('leiloes-service nao respondeu');

    delete process.env.LEILOES_SERVICE_URL;
    await expect(leiloesClient.consultarDisponibilidade(1)).rejects.toThrow(
      'Variavel de ambiente LEILOES_SERVICE_URL nao configurada.'
    );
  });
});

describe('clients/http.js (pelo leiloesClient)', () => {
  test('corpo que nao e JSON vira { erro: texto }; corpo vazio vira null', async () => {
    global.fetch.mockResolvedValueOnce({ status: 200, text: async () => 'texto puro' });
    await expect(leiloesClient.consultarDisponibilidade(1)).resolves.toEqual({ erro: 'texto puro' });

    global.fetch.mockResolvedValueOnce({ status: 200, text: async () => '' });
    await expect(leiloesClient.consultarDisponibilidade(1)).resolves.toBeNull();
  });

  test('sem resposta dentro do tempo limite: cancela o fetch e vira ServicoIndisponivel', async () => {
    jest.useFakeTimers();
    try {
      // fetch que so termina quando e cancelado (AbortController.abort)
      global.fetch.mockImplementation(
        (url, { signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('This operation was aborted')));
          })
      );
      const promessa = leiloesClient.consultarDisponibilidade(1);
      jest.advanceTimersByTime(3000);
      await expect(promessa).rejects.toThrow('leiloes-service nao respondeu: This operation was aborted');
    } finally {
      jest.useRealTimers();
    }
  });
});
