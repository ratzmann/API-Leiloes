// =============================================================================
// repositories/sagaRepository.js  -  ACESSO AO BANCO da tabela sagas_lance
// -----------------------------------------------------------------------------
// Guarda o "diario de bordo" de cada Saga: status, passos executados, ids do
// lance e das reservas envolvidas e a ultima mensagem de erro.
// A Saga chama salvar() depois de cada passo importante; assim, se o servico
// cair no meio, fica registrado ate onde ela chegou (rastreabilidade).
//
// Quem chama: sagas/registrarLanceSaga.js e services/lanceService.js
// Quem e chamado: config/db.js
// =============================================================================

const pool = require('../config/db');

/** Cria o registro da saga (status inicial INICIADA, pelo DEFAULT da tabela). */
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
/**
 * Atualiza todos os campos variaveis da saga de uma vez.
 * JSON.stringify(saga.passos) converte a lista de passos em texto JSON para a
 * coluna JSONB. O `?? null` garante NULL no banco quando o campo nao existe.
 */
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

/** Uma saga pelo id (ou null). */
async function buscarPorId(id) {
  const { rows } = await pool.query('SELECT * FROM sagas_lance WHERE id = $1', [id]);
  return rows[0] || null;
}

/** As `limite` sagas mais recentes (padrao: 50). */
async function listar(limite = 50) {
  const { rows } = await pool.query('SELECT * FROM sagas_lance ORDER BY id DESC LIMIT $1', [limite]);
  return rows;
}

module.exports = { criar, salvar, buscarPorId, listar };
