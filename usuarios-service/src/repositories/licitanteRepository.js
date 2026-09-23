// =============================================================================
// repositories/licitanteRepository.js  -  ACESSO AO BANCO da tabela licitantes
// -----------------------------------------------------------------------------
// Mesmo padrao do leiloeiroRepository: uma funcao por comando SQL, sempre com
// parametros ($1, $2...). Retorna objeto/null, lista, ou true/false.
//
// Quem chama: services/licitanteService.js e services/creditoService.js
// Quem e chamado: config/db.js
// =============================================================================

const pool = require('../config/db');

/** Todos os licitantes, ordenados pelo id. */
async function listar() {
  const { rows } = await pool.query('SELECT * FROM licitantes ORDER BY id');
  return rows;
}

/** Um licitante pelo id (ou null). */
async function buscarPorId(id) {
  const { rows } = await pool.query('SELECT * FROM licitantes WHERE id = $1', [id]);
  return rows[0] || null;
}

/** Um licitante pelo e-mail (checagem de duplicidade). */
async function buscarPorEmail(email) {
  const { rows } = await pool.query('SELECT * FROM licitantes WHERE email = $1', [email]);
  return rows[0] || null;
}

/** Um licitante pelo CPF (checagem de duplicidade). */
async function buscarPorCpf(cpf) {
  const { rows } = await pool.query('SELECT * FROM licitantes WHERE cpf = $1', [cpf]);
  return rows[0] || null;
}

/**
 * INSERT de um licitante.
 * `limiteCredito ?? 0`: o operador ?? ("nullish coalescing") usa 0 somente se
 * o valor for null ou undefined. Diferente do ||, ele MANTEM o 0 informado
 * de proposito (com || um limite 0 tambem viraria o padrao).
 */
async function criar({ usuarioId, nome, email, cpf, telefone, limiteCredito }) {
  const { rows } = await pool.query(
    `INSERT INTO licitantes (usuario_id, nome, email, cpf, telefone, limite_credito)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [usuarioId || null, nome, email, cpf, telefone || null, limiteCredito ?? 0]
  );
  return rows[0];
}

/** UPDATE parcial com COALESCE: campo nao enviado (NULL) mantem o valor atual. */
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

/** DELETE pelo id; true se apagou alguma linha. */
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
