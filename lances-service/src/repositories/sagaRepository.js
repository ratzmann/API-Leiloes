const pool = require('../config/db');

async function criar({ leilaoId, licitanteId, valor }) {
  const { rows } = await pool.query(
    `INSERT INTO sagas_lance (leilao_id, licitante_id, valor)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [leilaoId, licitanteId, valor]
  );
  return rows[0];
}

// grava o estado atual da saga
async function salvar(saga) {
  const { rows } = await pool.query(
    `UPDATE sagas_lance SET
        status                = $1,
        passos                = $2,
        lance_id              = $3,
        reserva_id            = $4,
        licitante_superado_id = $5,
        reserva_superada_id   = $6,
        erro                  = $7,
        atualizado_em         = NOW()
     WHERE id = $8
     RETURNING *`,
    [
      saga.status,
      JSON.stringify(saga.passos),
      saga.lance_id ?? null,
      saga.reserva_id ?? null,
      saga.licitante_superado_id ?? null,
      saga.reserva_superada_id ?? null,
      saga.erro ?? null,
      saga.id,
    ]
  );
  return rows[0];
}

async function buscarPorId(id) {
  const { rows } = await pool.query('SELECT * FROM sagas_lance WHERE id = $1', [id]);
  return rows[0] || null;
}

async function listar(limite = 50) {
  const { rows } = await pool.query('SELECT * FROM sagas_lance ORDER BY id DESC LIMIT $1', [limite]);
  return rows;
}

module.exports = { criar, salvar, buscarPorId, listar };
