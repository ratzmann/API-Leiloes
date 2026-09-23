// =============================================================================
// tests/usuariosClient.test.js  -  testes do cliente HTTP do usuarios-service
// -----------------------------------------------------------------------------
// Aqui o `fetch` global e trocado por um jest.fn(): simulamos as respostas do
// usuarios-service (201, 400, 409, 500, falha de rede) sem rede de verdade.
// Assim testamos o client E o helper clients/http.js que ele usa.
// =============================================================================

const usuariosClient = require('../src/clients/usuariosClient');
const { ErroDeValidacao } = require('../src/utils/erros');

/** Resposta falsa no formato que o fetch devolve (status + text()). */
const resposta = (status, corpo) => ({ status, text: async () => JSON.stringify(corpo) });
const usuario = { id: 7, nome: 'Ana Souza', email: 'a@a.com' };

beforeEach(() => {
  process.env.USUARIOS_SERVICE_URL = 'http://usuarios-service:3002';
  global.fetch = jest.fn();
});

describe('usuariosClient.criarPerfil', () => {
  test('licitante: POST /licitantes com os dados do usuario e do perfil', async () => {
    global.fetch.mockResolvedValue(resposta(201, { id: 3 }));

    const perfil = await usuariosClient.criarPerfil(usuario, 'LICITANTE', { cpf: '52998224725' });

    expect(perfil).toEqual({ id: 3 });
    const [url, opcoes] = global.fetch.mock.calls[0];
    expect(url).toBe('http://usuarios-service:3002/licitantes');
    expect(opcoes.method).toBe('POST');
    expect(JSON.parse(opcoes.body)).toEqual({ usuarioId: 7, nome: 'Ana Souza', email: 'a@a.com', cpf: '52998224725' });
  });

  test('leiloeiro: POST /leiloeiros', async () => {
    global.fetch.mockResolvedValue(resposta(201, { id: 5 }));
    await usuariosClient.criarPerfil(usuario, 'LEILOEIRO', {});
    expect(global.fetch.mock.calls[0][0]).toBe('http://usuarios-service:3002/leiloeiros');
  });

  test('400 e 409 viram ErroDeValidacao com o mesmo codigo e mensagem', async () => {
    global.fetch.mockResolvedValueOnce(resposta(400, { erro: 'CPF invalido.' }));
    await expect(usuariosClient.criarPerfil(usuario, 'LICITANTE', {})).rejects.toEqual(
      expect.objectContaining({ codigo: 400, message: 'CPF invalido.' })
    );

    global.fetch.mockResolvedValueOnce(resposta(409, { erro: 'CPF ja cadastrado.' }));
    const erro = await usuariosClient.criarPerfil(usuario, 'LICITANTE', {}).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDeValidacao);
    expect(erro.codigo).toBe(409);
  });

  test('5xx, falha de rede e URL ausente viram ServicoIndisponivel', async () => {
    global.fetch.mockResolvedValueOnce(resposta(500, {}));
    await expect(usuariosClient.criarPerfil(usuario, 'LICITANTE', {})).rejects.toBeInstanceOf(
      usuariosClient.ServicoIndisponivel
    );

    global.fetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(usuariosClient.criarPerfil(usuario, 'LICITANTE', {})).rejects.toBeInstanceOf(
      usuariosClient.ServicoIndisponivel
    );

    delete process.env.USUARIOS_SERVICE_URL;
    await expect(usuariosClient.criarPerfil(usuario, 'LICITANTE', {})).rejects.toBeInstanceOf(
      usuariosClient.ServicoIndisponivel
    );
  });
});
