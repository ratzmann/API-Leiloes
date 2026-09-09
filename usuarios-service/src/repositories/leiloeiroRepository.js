const pool = require('../config/db');

async function listar() {
  const { rows } = await pool.query('SELECT * FROM leiloeiros ORDER BY id');
  return rows;
}

async function buscarPorId(id) {
  const { rows } = await pool.query('SELECT * FROM leiloeiros WHERE id = $1', [id]);
  return rows[0] || null;
}

async function buscarPorEmail(email) {
  const { rows } = await pool.query('SELECT * FROM leiloeiros WHERE email = $1', [email]);
  return rows[0] || null;
}

async function buscarPorRegistroProfissional(registro) {
  const { rows } = await pool.query(
    'SELECT * FROM leiloeiros WHERE registro_profissional = $1',
    [registro]
  );
  return rows[0] || null;
}

async function criar({ usuarioId, nome, email, registroProfissional, telefone }) {
  const { rows } = await pool.query(
    `INSERT INTO leiloeiros (usuario_id, nome, email, registro_profissional, telefone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [usuarioId || null, nome, email, registroProfissional, telefone || null]
  );
  return rows[0];
}

async function atualizar(id, { nome, telefone }) {
  const { rows } = await pool.query(
    `UPDATE leiloeiros SET nome = COALESCE($1, nome), telefone = COALESCE($2, telefone)
     WHERE id = $3
     RETURNING *`,
    [nome, telefone, id]
  );
  return rows[0] || null;
}

async function remover(id) {
  const { rowCount } = await pool.query('DELETE FROM leiloeiros WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorEmail,
  buscarPorRegistroProfissional,
  criar,
  atualizar,
  remover,
};
