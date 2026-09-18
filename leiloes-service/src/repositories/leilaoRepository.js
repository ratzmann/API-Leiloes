const pool = require('../config/db');

const COLUNAS = `id, leiloeiro_id, titulo, descricao, local_evento, raca,
                 quantidade_bois, lance_inicial, incremento_minimo,
                 data_inicio, data_fim, status, criado_em, atualizado_em`;

async function listar({ status, leiloeiroId } = {}) {
  const filtros = [];
  const valores = [];

  if (status) {
    valores.push(status);
    filtros.push(`status = $${valores.length}`);
  }
  if (leiloeiroId) {
    valores.push(leiloeiroId);
    filtros.push(`leiloeiro_id = $${valores.length}`);
  }

  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT ${COLUNAS} FROM leiloes ${where} ORDER BY data_inicio`,
    valores
  );
  return rows;
}

async function buscarPorId(id) {
  const { rows } = await pool.query(`SELECT ${COLUNAS} FROM leiloes WHERE id = $1`, [id]);
  return rows[0] || null;
}

// leiloes que ainda ocupam a agenda do leiloeiro (agendados ou abertos)
async function listarAtivosPorLeiloeiro(leiloeiroId, ignorarId = null) {
  const { rows } = await pool.query(
    `SELECT ${COLUNAS} FROM leiloes
     WHERE leiloeiro_id = $1
       AND status IN ('AGENDADO', 'ABERTO')
       AND ($2::int IS NULL OR id <> $2)`,
    [leiloeiroId, ignorarId]
  );
  return rows;
}

async function criar({
  leiloeiroId,
  titulo,
  descricao,
  localEvento,
  raca,
  quantidadeBois,
  lanceInicial,
  incrementoMinimo,
  dataInicio,
  dataFim,
}) {
  const { rows } = await pool.query(
    `INSERT INTO leiloes (leiloeiro_id, titulo, descricao, local_evento, raca,
                          quantidade_bois, lance_inicial, incremento_minimo,
                          data_inicio, data_fim)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${COLUNAS}`,
    [
      leiloeiroId,
      titulo,
      descricao || null,
      localEvento || null,
      raca || null,
      quantidadeBois,
      lanceInicial,
      incrementoMinimo,
      dataInicio,
      dataFim,
    ]
  );
  return rows[0];
}

async function atualizar(id, {
  titulo,
  descricao,
  localEvento,
  raca,
  quantidadeBois,
  lanceInicial,
  incrementoMinimo,
  dataInicio,
  dataFim,
}) {
  const { rows } = await pool.query(
    `UPDATE leiloes SET
       titulo            = COALESCE($1, titulo),
       descricao         = COALESCE($2, descricao),
       local_evento      = COALESCE($3, local_evento),
       raca              = COALESCE($4, raca),
       quantidade_bois   = COALESCE($5, quantidade_bois),
       lance_inicial     = COALESCE($6, lance_inicial),
       incremento_minimo = COALESCE($7, incremento_minimo),
       data_inicio       = COALESCE($8, data_inicio),
       data_fim          = COALESCE($9, data_fim),
       atualizado_em     = NOW()
     WHERE id = $10
     RETURNING ${COLUNAS}`,
    [
      titulo ?? null,
      descricao ?? null,
      localEvento ?? null,
      raca ?? null,
      quantidadeBois ?? null,
      lanceInicial ?? null,
      incrementoMinimo ?? null,
      dataInicio ?? null,
      dataFim ?? null,
      id,
    ]
  );
  return rows[0] || null;
}

async function atualizarStatus(id, status) {
  const { rows } = await pool.query(
    `UPDATE leiloes SET status = $1, atualizado_em = NOW()
     WHERE id = $2
     RETURNING ${COLUNAS}`,
    [status, id]
  );
  return rows[0] || null;
}

async function remover(id) {
  const { rowCount } = await pool.query('DELETE FROM leiloes WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = {
  listar,
  buscarPorId,
  listarAtivosPorLeiloeiro,
  criar,
  atualizar,
  atualizarStatus,
  remover,
};
