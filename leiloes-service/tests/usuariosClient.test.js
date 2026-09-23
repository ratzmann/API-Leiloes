// =============================================================================
// tests/usuariosClient.test.js  -  testes do cliente HTTP do usuarios-service
// -----------------------------------------------------------------------------
// Aqui o `fetch` global e trocado por um jest.fn(): simulamos as respostas do
// usuarios-service (200, 404, 500, falha de rede) sem rede de verdade.
// Assim testamos o client E o helper clients/http.js que ele usa.
// =============================================================================

const usuariosClient = require('../src/clients/usuariosClient');

// resposta falsa no formato que o fetch devolve (status + text())
const resposta = (status, corpo) => ({ status, text: async () => JSON.stringify(corpo) });

beforeEach(() => {
  process.env.USUARIOS_SERVICE_URL = 'http://usuarios-service:3002';
  global.fetch = jest.fn();
});

describe('usuariosClient.buscarLeiloeiro (Regra 3)', () => {
  test('200 devolve o leiloeiro; 404 devolve null', async () => {
    global.fetch.mockResolvedValueOnce(resposta(200, { id: 1, nome: 'Carlos' }));
    await expect(usuariosClient.buscarLeiloeiro(1)).resolves.toEqual({ id: 1, nome: 'Carlos' });
    expect(global.fetch.mock.calls[0][0]).toBe('http://usuarios-service:3002/leiloeiros/1');

    global.fetch.mockResolvedValueOnce(resposta(404, { erro: 'Leiloeiro nao encontrado.' }));
    await expect(usuariosClient.buscarLeiloeiro(999)).resolves.toBeNull();
  });

  test('5xx, falha de rede e URL ausente viram ServicoIndisponivel', async () => {
    global.fetch.mockResolvedValueOnce(resposta(500, {}));
    await expect(usuariosClient.buscarLeiloeiro(1)).rejects.toBeInstanceOf(usuariosClient.ServicoIndisponivel);

    global.fetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(usuariosClient.buscarLeiloeiro(1)).rejects.toBeInstanceOf(usuariosClient.ServicoIndisponivel);

    delete process.env.USUARIOS_SERVICE_URL;
    await expect(usuariosClient.buscarLeiloeiro(1)).rejects.toBeInstanceOf(usuariosClient.ServicoIndisponivel);
  });
});

describe('usuariosClient.liberarReservasDoLeilao (Regra 8)', () => {
  test('POST na rota interna; 200 devolve o resumo', async () => {
    global.fetch.mockResolvedValue(resposta(200, { leilaoId: 4, liberadas: 2 }));

    await expect(usuariosClient.liberarReservasDoLeilao(4)).resolves.toMatchObject({ liberadas: 2 });
    const [url, opcoes] = global.fetch.mock.calls[0];
    expect(url).toBe('http://usuarios-service:3002/reservas/leilao/4/liberar');
    expect(opcoes.method).toBe('POST');
  });

  test('resposta diferente de 200 vira ServicoIndisponivel', async () => {
    global.fetch.mockResolvedValue(resposta(400, { erro: 'leilaoId invalido.' }));
    await expect(usuariosClient.liberarReservasDoLeilao(4)).rejects.toBeInstanceOf(usuariosClient.ServicoIndisponivel);
  });
});
