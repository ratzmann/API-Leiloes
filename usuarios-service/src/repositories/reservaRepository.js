const pool = require('../config/db');

// Roda fn numa transacao. O travarLicitante faz FOR UPDATE, entao duas
// reservas ao mesmo tempo pro mesmo licitante nao passam do limite.
async function emTransacao(fn) {
  const client = await pool.connect();
  const tx = {
    async travarLicitante(licitanteId) {
      const { rows } = await client.query(
        'SELECT id, limite_credito FROM licitantes WHERE id = $1 FOR UPDATE',
        [licitanteId]
      );
      return rows[0] || null;
    },
    async somarReservado(licitanteId) {
      const { rows } = await client.query(
        `SELECT COALESCE(SUM(valor), 0) AS reservado
           FROM reservas_credito
          WHERE licitante_id = $1 AND status = 'RESERVADA'`,
        [licitanteId]
      );
      return Number(rows[0].reservado);
    },
    async buscarPorReferencia(referencia) {
      const { rows } = await client.query(
        'SELECT * FROM reservas_credito WHERE referencia = $1',
        [referencia]
      );
      return rows[0] || null;
    },
    async buscarPorId(reservaId) {
      const { rows } = await client.query(
        'SELECT * FROM reservas_credito WHERE id = $1 FOR UPDATE',
        [reservaId]
      );
      return rows[0] || null;
    },
    async criar({ licitanteId, valor, referencia }) {
      const { rows } = await client.query(
        `INSERT INTO reservas_credito (licitante_id, valor, referencia)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [licitanteId, valor, referencia || null]
      );
      return rows[0];
    },
    async liberar(reservaId) {
      const { rows } = await client.query(
        `UPDATE reservas_credito
            SET status = 'LIBERADA', liberado_em = NOW()
          WHERE id = $1
          RETURNING *`,
        [reservaId]
      );
      return rows[0];
    },
  };

  try {
    await client.query('BEGIN');
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

async function somarReservado(licitanteId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(valor), 0) AS reservado
       FROM reservas_credito
      WHERE licitante_id = $1 AND status = 'RESERVADA'`,
    [licitanteId]
  );
  return Number(rows[0].reservado);
}

async function listarPorLicitante(licitanteId) {
  const { rows } = await pool.query(
    'SELECT * FROM reservas_credito WHERE licitante_id = $1 ORDER BY id DESC',
    [licitanteId]
  );
  return rows;
}

module.exports = { emTransacao, somarReservado, listarPorLicitante };
