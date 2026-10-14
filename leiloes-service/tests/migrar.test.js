const migrar = require('../src/db/migrar');

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('executa o init.sql (idempotente)', async () => {
  const banco = { query: jest.fn().mockResolvedValue({}) };

  await migrar({ banco });

  expect(banco.query).toHaveBeenCalledTimes(1);
  expect(banco.query.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS leiloes');
});

test('tenta de novo enquanto o banco ainda esta subindo', async () => {
  const banco = {
    query: jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({}),
  };

  await migrar({ banco, esperaMs: 0 });

  expect(banco.query).toHaveBeenCalledTimes(3);
});

test('desiste depois das tentativas e devolve o ultimo erro', async () => {
  const banco = { query: jest.fn().mockRejectedValue(new Error('senha invalida')) };

  await expect(migrar({ banco, tentativas: 3, esperaMs: 0 })).rejects.toThrow('senha invalida');
  expect(banco.query).toHaveBeenCalledTimes(3);
});
