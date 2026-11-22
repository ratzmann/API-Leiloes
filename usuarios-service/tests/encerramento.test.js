// Testes do encerramento gracioso (utils/encerramento.js): o que acontece quando o
// Kubernetes/Docker manda SIGTERM. Servidor, pool e process sao objetos falsos.
// (Arquivo identico no auth-service e no usuarios-service.)
const { EventEmitter } = require('events');
const { encerrar, prepararEncerramento } = require('../src/utils/encerramento');

const logMudo = { log: jest.fn(), error: jest.fn() };

/** Servidor falso: close chama o callback (com erro, se pedido). */
function servidorFalso(erro = null) {
  return { close: jest.fn((cb) => cb(erro)) };
}

describe('encerrar', () => {
  afterEach(() => jest.useRealTimers());

  test('fecha o servidor, depois o banco, e sai com 0', async () => {
    const ordem = [];
    const servidor = { close: jest.fn((cb) => { ordem.push('servidor'); cb(); }) };
    const pool = { end: jest.fn(async () => { ordem.push('banco'); }) };
    const sair = jest.fn();

    await encerrar({ servidor, pool, sinal: 'SIGTERM', sair, log: logMudo });

    expect(ordem).toEqual(['servidor', 'banco']);
    expect(sair).toHaveBeenCalledTimes(1);
    expect(sair).toHaveBeenCalledWith(0);
  });

  test('erro ao fechar o servidor: nao espera o banco e sai com 1', async () => {
    const pool = { end: jest.fn() };
    const sair = jest.fn();

    await encerrar({ servidor: servidorFalso(new Error('falhou')), pool, sinal: 'SIGTERM', sair, log: logMudo });

    expect(pool.end).not.toHaveBeenCalled();
    expect(sair).toHaveBeenCalledWith(1);
  });

  test('erro ao fechar o banco: sai com 1', async () => {
    const pool = { end: jest.fn().mockRejectedValue(new Error('banco travado')) };
    const sair = jest.fn();

    await encerrar({ servidor: servidorFalso(), pool, sinal: 'SIGINT', sair, log: logMudo });

    expect(sair).toHaveBeenCalledWith(1);
  });

  test('se travar alem do prazo, sai a forca com 1', async () => {
    jest.useFakeTimers();
    // servidor que nunca termina de fechar (requisicao presa)
    const servidor = { close: jest.fn() };
    const sair = jest.fn();

    encerrar({ servidor, pool: { end: jest.fn() }, sinal: 'SIGTERM', sair, prazoMs: 500, log: logMudo });
    expect(sair).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    expect(sair).toHaveBeenCalledWith(1);
  });
});

describe('prepararEncerramento', () => {
  test('SIGTERM dispara o encerramento uma unica vez e sai com 0', async () => {
    const processo = new EventEmitter();
    processo.exit = jest.fn();
    const servidor = servidorFalso();
    const pool = { end: jest.fn().mockResolvedValue() };
    jest.spyOn(console, 'log').mockImplementation(() => {});

    prepararEncerramento(servidor, pool, processo);
    processo.emit('SIGTERM');
    processo.emit('SIGTERM');
    await new Promise((resolve) => setImmediate(resolve));

    expect(servidor.close).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(processo.exit).toHaveBeenCalledWith(0);
    console.log.mockRestore();
  });

  test('registra tambem o SIGINT (Ctrl+C)', () => {
    const processo = new EventEmitter();
    prepararEncerramento(servidorFalso(), { end: jest.fn() }, processo);

    expect(processo.listenerCount('SIGTERM')).toBe(1);
    expect(processo.listenerCount('SIGINT')).toBe(1);
  });
});
