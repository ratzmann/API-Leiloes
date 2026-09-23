// =============================================================================
// repositories/leiloeiroRepository.js  -  ACESSO AO BANCO da tabela leiloeiros
// -----------------------------------------------------------------------------
// Unica camada que escreve SQL para leiloeiros. Cada funcao = um comando SQL.
// Todas usam parametros ($1, $2...) em vez de juntar texto, o que protege
// contra SQL INJECTION.
//
// Padrao de retorno:
//   - busca de UM registro -> o objeto, ou null se nao achar;
//   - busca de VARIOS      -> uma lista (possivelmente vazia);
//   - remocao              -> true/false (removeu ou nao).
//
// Quem chama: services/leiloeiroService.js | Quem e chamado: config/db.js
// =============================================================================

const pool = require('../config/db');

/** SELECT de todos os leiloeiros, ordenados pelo id. */
async function listar() {
  // { rows } pega so a lista de linhas do resultado devolvido pelo pg.
  const { rows } = await pool.query('SELECT * FROM leiloeiros ORDER BY id');
  return rows;
}

/** Um leiloeiro pelo id (ou null). */
async function buscarPorId(id) {
  const { rows } = await pool.query('SELECT * FROM leiloeiros WHERE id = $1', [id]);
  return rows[0] || null;
}

/** Um leiloeiro pelo e-mail (usado para checar duplicidade). */
async function buscarPorEmail(email) {
  const { rows } = await pool.query('SELECT * FROM leiloeiros WHERE email = $1', [email]);
  return rows[0] || null;
}

/** Um leiloeiro pelo registro profissional (checagem de duplicidade). */
async function buscarPorRegistroProfissional(registro) {
  const { rows } = await pool.query(
    'SELECT * FROM leiloeiros WHERE registro_profissional = $1',
    [registro]
  );
  return rows[0] || null;
}

/**
 * INSERT de um novo leiloeiro. RETURNING * devolve a linha criada (com id).
 * `usuarioId || null`: campos opcionais nao informados viram NULL no banco.
 */
async function criar({ usuarioId, nome, email, registroProfissional, telefone }) {
  const { rows } = await pool.query(
    `INSERT INTO leiloeiros (usuario_id, nome, email, registro_profissional, telefone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [usuarioId || null, nome, email, registroProfissional, telefone || null]
  );
  return rows[0];
}

/**
 * UPDATE parcial: COALESCE($1, nome) significa "use o valor novo; se ele for
 * NULL (nao enviado), mantenha o valor atual". Assim o cliente pode mandar so
 * o campo que quer mudar.
 */
async function atualizar(id, { nome, telefone }) {
  const { rows } = await pool.query(
    `UPDATE leiloeiros SET nome = COALESCE($1, nome), telefone = COALESCE($2, telefone)
     WHERE id = $3
     RETURNING *`,
    [nome, telefone, id]
  );
  return rows[0] || null;
}

/** DELETE pelo id. rowCount = quantas linhas foram apagadas. */
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
