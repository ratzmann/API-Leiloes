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

module.exports = {
  listar,
  buscarPorId,
  buscarPorLeilao,
  buscarMaiorPorLeilao,
  criar,
};
