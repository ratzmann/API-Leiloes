const pool = require('../config/db');

async function buscarPorEmail(email) {
  const { rows } = await pool.query(
    'SELECT * FROM usuarios WHERE email = $1',
    [email]
  );
  return rows[0] || null;
}

async function buscarPorId(id) {
  const { rows } = await pool.query(
    'SELECT * FROM usuarios WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function criar({ nome, email, senhaHash, papel }) {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, papel)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nome, email, papel, perfil_id, criado_em`,
    [nome, email, senhaHash, papel]
  );
  return rows[0];
}

async function atualizarPerfilId(usuarioId, perfilId) {
  await pool.query(
    'UPDATE usuarios SET perfil_id = $1 WHERE id = $2',
    [perfilId, usuarioId]
  );
}

module.exports = { buscarPorEmail, buscarPorId, criar, atualizarPerfilId };
