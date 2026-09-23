// =============================================================================
// repositories/leilaoRepository.js  -  ACESSO AO BANCO da tabela leiloes
// -----------------------------------------------------------------------------
// Unica camada que escreve SQL no leiloes-service. Sempre com parametros
// ($1, $2...) para evitar SQL injection.
//
// Quem chama: services/leilaoService.js | Quem e chamado: config/db.js
// =============================================================================

const pool = require('../config/db');

// Lista de colunas reaproveitada em varias consultas (evita repetir o texto
// e garante que todas devolvam os mesmos campos).
const COLUNAS = `id, leiloeiro_id, titulo, descricao, local_evento, raca,
                 quantidade_bois, lance_inicial, incremento_minimo,
                 data_inicio, data_fim, status, criado_em, atualizado_em`;

/**
 * Lista leiloes com filtros OPCIONAIS, montando o WHERE dinamicamente.
 * Exemplo: listar({ status: 'ABERTO' }) gera
 *   SELECT ... FROM leiloes WHERE status = $1 ORDER BY data_inicio   com ['ABERTO']
 * O numero do parametro ($1, $2) acompanha o tamanho da lista `valores`,
 * entao os valores continuam separados do SQL (seguro contra injection).
 * `= {}` no parametro: se chamarem listar() sem nada, usa um objeto vazio.
 */
async function listar({ status, leiloeiroId } = {}) {
  const filtros = [];
  const valores = [];

  if (status) {
    // push() adiciona um item ao fim da lista.
    valores.push(status);
    // `$${...}`: o primeiro $ e literal, o ${...} insere o numero -> "$1".
    filtros.push(`status = $${valores.length}`);
  }
  if (leiloeiroId) {
    valores.push(leiloeiroId);
    filtros.push(`leiloeiro_id = $${valores.length}`);
  }

  // Se houver filtros, junta com AND: "WHERE status = $1 AND leiloeiro_id = $2".
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT ${COLUNAS} FROM leiloes ${where} ORDER BY data_inicio`,
    valores
  );
  return rows;
}

/** Um leilao pelo id (ou null). */
async function buscarPorId(id) {
  const { rows } = await pool.query(`SELECT ${COLUNAS} FROM leiloes WHERE id = $1`, [id]);
  return rows[0] || null;
}

// leiloes que ainda ocupam a agenda do leiloeiro (agendados ou abertos)
/**
 * Usado pela Regra 4 (agenda livre).
 * O trecho "($2::int IS NULL OR id <> $2)" significa: se ignorarId for null,
 * a condicao e sempre verdadeira; senao, exclui o proprio leilao (<> = diferente).
 * O "::int" diz ao Postgres que o parametro e um inteiro.
 */
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

/**
 * INSERT de um leilao (status fica AGENDADO pelo DEFAULT da tabela).
 * Campos opcionais vazios (descricao, local, raca) viram NULL no banco.
 */
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

/**
 * UPDATE parcial: cada coluna usa COALESCE(novoValor, valorAtual), entao
 * campos nao enviados (null) permanecem como estao. Tambem atualiza
 * atualizado_em com o momento atual (NOW()).
 */
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

/** Muda so o status (as regras de transicao ja foram conferidas no service). */
async function atualizarStatus(id, status) {
  const { rows } = await pool.query(
    `UPDATE leiloes SET status = $1, atualizado_em = NOW()
     WHERE id = $2
     RETURNING ${COLUNAS}`,
    [status, id]
  );
  return rows[0] || null;
}

/** DELETE pelo id; true se apagou. */
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
