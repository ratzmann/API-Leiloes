// =============================================================================
// repositories/lanceRepository.js  -  ACESSO AO BANCO da tabela lances
// -----------------------------------------------------------------------------
// Consultas simples (listar/buscar) e a operacao especial do passo 3 da Saga:
// gravar o lance com o leilao TRAVADO (registrarComTrava).
//
// Quem chama: services/lanceService.js e sagas/registrarLanceSaga.js
// Quem e chamado: config/db.js
// =============================================================================

const pool = require('../config/db');

/** Todos os lances, do mais recente para o mais antigo. */
async function listar() {
  const { rows } = await pool.query('SELECT * FROM lances ORDER BY criado_em DESC');
  return rows;
}

/** Um lance pelo id (ou null). */
async function buscarPorId(id) {
  const { rows } = await pool.query('SELECT * FROM lances WHERE id = $1', [id]);
  return rows[0] || null;
}

/**
 * Lances do leilao, do maior valor para o menor. Em caso de empate de valor,
 * o mais recente primeiro (criado_em DESC).
 */
async function buscarPorLeilao(leilaoId) {
  const { rows } = await pool.query(
    'SELECT * FROM lances WHERE leilao_id = $1 ORDER BY valor DESC, criado_em DESC',
    [leilaoId]
  );
  return rows;
}

/** O maior lance do leilao: mesma ordenacao, mas LIMIT 1 (so a primeira linha). */
async function buscarMaiorPorLeilao(leilaoId) {
  const { rows } = await pool.query(
    'SELECT * FROM lances WHERE leilao_id = $1 ORDER BY valor DESC, criado_em DESC LIMIT 1',
    [leilaoId]
  );
  return rows[0] || null;
}

/**
 * PASSO 3 DA SAGA: grava o lance com o leilao TRAVADO (advisory lock).
 *
 * O PROBLEMA (condicao de corrida): dois licitantes dao lance de 5100 ao mesmo
 * tempo no mesmo leilao. Os dois leem "maior lance = 5000", os dois passam na
 * validacao e os dois gravam - ficando dois "vencedores".
 *
 * A SOLUCAO: uma TRAVA por leilao. pg_advisory_xact_lock(chave1, chave2) e uma
 * trava do Postgres identificada por dois numeros (aqui: um codigo fixo para
 * "lances" e o id do leilao). Quem pede a mesma trava espera na fila ate a
 * transacao atual terminar (COMMIT/ROLLBACK liberam automaticamente).
 * Lances em leiloes DIFERENTES nao se bloqueiam (chaves diferentes).
 *
 * @param leilaoId  leilao a travar
 * @param fn        funcao async que recebe `tx` (buscarMaior, criar) e faz o trabalho
 * @returns         o que `fn` devolver
 */
async function registrarComTrava(leilaoId, fn) {
  // Uma conexao exclusiva: a trava e a transacao valem para ESTA conexao.
  const client = await pool.connect();
  const tx = {
    // Maior lance atual, lido JA com a trava (valor confiavel).
    async buscarMaior() {
      const { rows } = await client.query(
        'SELECT * FROM lances WHERE leilao_id = $1 ORDER BY valor DESC, criado_em DESC LIMIT 1',
        [leilaoId]
      );
      return rows[0] || null;
    },
    // Grava o lance ligado a saga e a reserva de credito.
    async criar({ licitanteId, valor, sagaId, reservaId }) {
      const { rows } = await client.query(
        `INSERT INTO lances (leilao_id, licitante_id, valor, saga_id, reserva_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [leilaoId, licitanteId, valor, sagaId, reservaId]
      );
      return rows[0];
    },
  };

  try {
    await client.query('BEGIN');
    // hashtext('lances') transforma o texto num numero fixo (a "familia" da trava).
    await client.query("SELECT pg_advisory_xact_lock(hashtext('lances'), $1)", [leilaoId]);
    const resultado = await fn(tx);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    // Desfaz tudo (inclusive libera a trava) e repassa o erro.
    await client.query('ROLLBACK');
    throw err;
  } finally {
    // Devolve a conexao ao pool, sempre.
    client.release();
  }
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorLeilao,
  buscarMaiorPorLeilao,
  registrarComTrava,
};
