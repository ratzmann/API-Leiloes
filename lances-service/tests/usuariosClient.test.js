// =============================================================================
// tests/usuariosClient.test.js  -  testes do cliente HTTP do usuarios-service
// -----------------------------------------------------------------------------
// Aqui o `fetch` global e trocado por um jest.fn(): simulamos as respostas do
// usuarios-service (200, 201, 4xx, 500, falha de rede) sem rede de verdade.
// Assim testamos o client E o helper clients/http.js que ele usa.
// Sao as chamadas da Saga que mexem no credito: reserva (passo 2) e
// liberacao (compensacao e passo 4).
// =============================================================================

const usuariosClient = require('../src/clients/usuariosClient');
const { ServicoIndisponivel } = require('../src/clients/http');
const { ErroDeValidacao } = require('../src/utils/erros');

/** Resposta falsa no formato que o fetch devolve (status + text()). */
const resposta = (status, corpo) => ({ status, text: async () => JSON.stringify(corpo) });

beforeEach(() => {
  process.env.USUARIOS_SERVICE_URL = 'http://usuarios-service:3002';
  global.fetch = jest.fn();
});

describe('usuariosClient.reservarCredito (passo 2 da Saga, Regra 6)', () => {
  test('POST /licitantes/:id/reservas com valor, referencia e leilaoId; 201 devolve a reserva', async () => {
    global.fetch.mockResolvedValue(resposta(201, { id: 9, status: 'RESERVADA' }));

    await expect(usuariosClient.reservarCredito(3, 1500, 'saga-7', 4)).resolves.toEqual({ id: 9, status: 'RESERVADA' });

    const [url, opcoes] = global.fetch.mock.calls[0];
    expect(url).toBe('http://usuarios-service:3002/licitantes/3/reservas');
    expect(opcoes.method).toBe('POST');
    expect(JSON.parse(opcoes.body)).toEqual({ valor: 1500, referencia: 'saga-7', leilaoId: 4 });
  });

  test('manda a chave interna (X-Chave-Interna) quando CHAVE_INTERNA esta configurada', async () => {
    global.fetch.mockResolvedValue(resposta(201, { id: 9 }));
    process.env.CHAVE_INTERNA = 'chave-de-teste';
    await usuariosClient.reservarCredito(3, 1500, 'saga-7', 4);
    delete process.env.CHAVE_INTERNA;
    await usuariosClient.reservarCredito(3, 1500, 'saga-7', 4);

    expect(global.fetch.mock.calls[0][1].headers['X-Chave-Interna']).toBe('chave-de-teste');
    expect(global.fetch.mock.calls[1][1].headers).not.toHaveProperty('X-Chave-Interna');
  });

  test('200 (referencia repetida: a reserva ja existia) tambem devolve a reserva', async () => {
    global.fetch.mockResolvedValue(resposta(200, { id: 9 }));
    await expect(usuariosClient.reservarCredito(3, 1500, 'saga-7', 4)).resolves.toEqual({ id: 9 });
  });

  test('400, 404 e 409 viram ErroDeValidacao com o mesmo codigo e a mensagem do servico', async () => {
    for (const codigo of [400, 404, 409]) {
      global.fetch.mockResolvedValueOnce(resposta(codigo, { erro: `recusa ${codigo}` }));
      const erro = await usuariosClient.reservarCredito(3, 1500, 'saga-7', 4).catch((e) => e);
      expect(erro).toBeInstanceOf(ErroDeValidacao);
      expect(erro).toMatchObject({ codigo, message: `recusa ${codigo}` });
    }
  });

  test('recusa sem mensagem usa um texto padrao', async () => {
    global.fetch.mockResolvedValue({ status: 409, text: async () => '' });
    await expect(usuariosClient.reservarCredito(3, 1500, 'saga-7', 4)).rejects.toMatchObject({
      codigo: 409,
      message: 'Reserva de credito recusada.',
    });
  });

  test('5xx, outro 4xx, falha de rede e URL ausente viram ServicoIndisponivel', async () => {
    global.fetch.mockResolvedValueOnce(resposta(500, {}));
    await expect(usuariosClient.reservarCredito(3, 1500, 'saga-7', 4)).rejects.toBeInstanceOf(ServicoIndisponivel);

    global.fetch.mockResolvedValueOnce(resposta(403, { erro: 'rota interna' }));
    await expect(usuariosClient.reservarCredito(3, 1500, 'saga-7', 4)).rejects.toBeInstanceOf(ServicoIndisponivel);

    global.fetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(usuariosClient.reservarCredito(3, 1500, 'saga-7', 4)).rejects.toBeInstanceOf(ServicoIndisponivel);

    delete process.env.USUARIOS_SERVICE_URL;
    await expect(usuariosClient.reservarCredito(3, 1500, 'saga-7', 4)).rejects.toBeInstanceOf(ServicoIndisponivel);
  });
});

describe('usuariosClient.liberarReserva (compensacao e passo 4)', () => {
  test('POST /licitantes/:id/reservas/:reservaId/liberar; 200 devolve a reserva liberada', async () => {
    global.fetch.mockResolvedValue(resposta(200, { id: 9, status: 'LIBERADA' }));

    await expect(usuariosClient.liberarReserva(3, 9)).resolves.toMatchObject({ status: 'LIBERADA' });
    const [url, opcoes] = global.fetch.mock.calls[0];
    expect(url).toBe('http://usuarios-service:3002/licitantes/3/reservas/9/liberar');
    expect(opcoes.method).toBe('POST');
    expect(opcoes.body).toBeUndefined();
  });

  test('qualquer resposta diferente de 200 vira ServicoIndisponivel, com a mensagem do servico', async () => {
    global.fetch.mockResolvedValue(resposta(404, { erro: 'Reserva nao encontrada para este licitante.' }));
    await expect(usuariosClient.liberarReserva(3, 9)).rejects.toThrow(
      'usuarios-service respondeu 404 ao liberar a reserva 9: Reserva nao encontrada para este licitante.'
    );
  });
});
