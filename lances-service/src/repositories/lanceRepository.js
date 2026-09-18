const pool = require('../config/db');

async function listar() {
  const { rows } = await pool.query('SELECT * FROM lances ORDER BY criado_em DESC');
  return rows;
}

async function buscarPorId(id) {
  const { rows } = await pool.query('SELECT * FROM lances WHERE id = $1', [id]);
  return rows[0] || null;
}

async function buscarPorLeilao(leilaoId) {
  const { rows } = await pool.query(
    'SELECT * FROM lances WHERE leilao_id = $1 ORDER BY valor DESC, criado_em DESC',
    [leilaoId]
  );
  return rows;
}

async function buscarMaiorPorLeilao(leilaoId) {
  const { rows } = await pool.query(
    'SELECT * FROM lances WHERE leilao_id = $1 ORDER BY valor DESC, criado_em DESC LIMIT 1',
    [leilaoId]
  );
  return rows[0] || null;
}

async function criar({ leilaoId, licitanteId, valor }) {
  const { rows } = await pool.query(
    `INSERT INTO lances (leilao_id, licitante_id, valor)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [leilaoId, licitanteId, valor]
  );
  return rows[0];
}

// passo 3 da saga: grava o lance com o leilao travado (advisory lock),
// assim ninguem grava outro lance entre a checagem do valor e o INSERT
async function registrarComTrava(leilaoId, fn) {
  const client = await pool.connect();
  const tx = {
    async buscarMaior() {
      const { rows } = await client.query(
        'SELECT * FROM lances WHERE leilao_id = $1 ORDER BY valor DESC, criado_em DESC LIMIT 1',
        [leilaoId]
      );
      return rows[0] || null;
    },
    async criar({ licitanteId, valor, sagaId, reservaId }) {
      const { rows } = await client.query(
        `INSERT INTO lances (leilao_id, licitante_id, valor, saga_id, reserva_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [leilaoId, licitanteId, valor, sagaId, reservaId]
      );
      return rows[0];
    },
  };

  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('lances'), $1)", [leilaoId]);
    const resultado = await fn(tx);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorLeilao,
  buscarMaiorPorLeilao,
  criar,
  registrarComTrava,
};
