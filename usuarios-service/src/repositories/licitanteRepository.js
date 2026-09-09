const pool = require('../config/db');

async function listar() {
  const { rows } = await pool.query('SELECT * FROM licitantes ORDER BY id');
  return rows;
}

async function buscarPorId(id) {
  const { rows } = await pool.query('SELECT * FROM licitantes WHERE id = $1', [id]);
  return rows[0] || null;
}

async function buscarPorEmail(email) {
  const { rows } = await pool.query('SELECT * FROM licitantes WHERE email = $1', [email]);
  return rows[0] || null;
}

async function buscarPorCpf(cpf) {
  const { rows } = await pool.query('SELECT * FROM licitantes WHERE cpf = $1', [cpf]);
  return rows[0] || null;
}

async function criar({ usuarioId, nome, email, cpf, telefone, limiteCredito }) {
  const { rows } = await pool.query(
    `INSERT INTO licitantes (usuario_id, nome, email, cpf, telefone, limite_credito)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [usuarioId || null, nome, email, cpf, telefone || null, limiteCredito ?? 0]
  );
  return rows[0];
}

async function atualizar(id, { nome, telefone, limiteCredito }) {
  const { rows } = await pool.query(
    `UPDATE licitantes
     SET nome = COALESCE($1, nome),
         telefone = COALESCE($2, telefone),
         limite_credito = COALESCE($3, limite_credito)
     WHERE id = $4
     RETURNING *`,
    [nome, telefone, limiteCredito, id]
  );
  return rows[0] || null;
}

async function remover(id) {
  const { rowCount } = await pool.query('DELETE FROM licitantes WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorEmail,
  buscarPorCpf,
  criar,
  atualizar,
  remover,
};
