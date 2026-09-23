// =============================================================================
// repositories/reservaRepository.js  -  ACESSO AO BANCO das reservas de credito
// -----------------------------------------------------------------------------
// Diferente dos outros repositories, este oferece operacoes DENTRO DE UMA
// TRANSACAO. Transacao = um grupo de comandos SQL tratado como uma coisa so:
//   BEGIN    -> comeca o grupo
//   COMMIT   -> confirma tudo (as mudancas passam a valer)
//   ROLLBACK -> desfaz tudo (como se nada tivesse acontecido)
// Se qualquer passo falhar no meio, fazemos ROLLBACK e o banco nao fica
// "pela metade".
//
// Quem chama: services/creditoService.js | Quem e chamado: config/db.js
// =============================================================================

const pool = require('../config/db');

// Roda fn numa transacao. O travarLicitante faz FOR UPDATE, entao duas
// reservas ao mesmo tempo pro mesmo licitante nao passam do limite.
/**
 * Abre uma transacao, entrega a `fn` um objeto `tx` com as operacoes de
 * banco, e ao final faz COMMIT (deu certo) ou ROLLBACK (deu erro).
 *
 * Por que `pool.connect()` e nao `pool.query()`? Uma transacao precisa que
 * TODOS os comandos usem a MESMA conexao. pool.query pode usar uma conexao
 * diferente a cada chamada; pool.connect "reserva" uma conexao so para nos.
 *
 * @param fn  funcao async que recebe `tx` e devolve o resultado desejado
 * @returns   o que `fn` devolver
 */
async function emTransacao(fn) {
  const client = await pool.connect();
  // Objeto com as operacoes disponiveis dentro da transacao. Todas usam
  // `client` (a conexao reservada), e nao o pool.
  const tx = {
    // FOR UPDATE "tranca" a linha do licitante ate o COMMIT/ROLLBACK: outra
    // transacao que tentar travar o mesmo licitante fica esperando na fila.
    async travarLicitante(licitanteId) {
      const { rows } = await client.query(
        'SELECT id, limite_credito FROM licitantes WHERE id = $1 FOR UPDATE',
        [licitanteId]
      );
      return rows[0] || null;
    },
    // SUM soma os valores; COALESCE(..., 0) troca NULL por 0 quando nao ha reservas.
    async somarReservado(licitanteId) {
      const { rows } = await client.query(
        `SELECT COALESCE(SUM(valor), 0) AS reservado
           FROM reservas_credito
          WHERE licitante_id = $1 AND status = 'RESERVADA'`,
        [licitanteId]
      );
      // O Postgres devolve NUMERIC como texto; Number(...) converte para numero.
      return Number(rows[0].reservado);
    },
    // Procura reserva pela referencia (id da saga) - base da idempotencia.
    async buscarPorReferencia(referencia) {
      const { rows } = await client.query(
        'SELECT * FROM reservas_credito WHERE referencia = $1',
        [referencia]
      );
      return rows[0] || null;
    },
    // Busca e trava a reserva (evita duas liberacoes simultaneas).
    async buscarPorId(reservaId) {
      const { rows } = await client.query(
        'SELECT * FROM reservas_credito WHERE id = $1 FOR UPDATE',
        [reservaId]
      );
      return rows[0] || null;
    },
    // Cria a reserva; o status comeca como RESERVADA (DEFAULT da tabela).
    // leilaoId (opcional) liga a reserva ao leilao, para o cancelamento.
    async criar({ licitanteId, valor, referencia, leilaoId }) {
      const { rows } = await client.query(
        `INSERT INTO reservas_credito (licitante_id, valor, referencia, leilao_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [licitanteId, valor, referencia || null, leilaoId || null]
      );
      return rows[0];
    },
    // Marca a reserva como LIBERADA e registra quando isso aconteceu.
    async liberar(reservaId) {
      const { rows } = await client.query(
        `UPDATE reservas_credito
            SET status = 'LIBERADA', liberado_em = NOW()
          WHERE id = $1
          RETURNING *`,
        [reservaId]
      );
      return rows[0];
    },
  };

  try {
    await client.query('BEGIN');
    // Executa a logica do service, que usa as operacoes de `tx`.
    const resultado = await fn(tx);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    // Algo deu errado (inclusive um ErroDeValidacao do service): desfaz tudo
    // e repassa o erro adiante com `throw`.
    await client.query('ROLLBACK');
    throw err;
  } finally {
    // `finally` roda SEMPRE (com ou sem erro): devolve a conexao ao pool.
    // Esquecer isso "vazaria" conexoes ate o pool se esgotar.
    client.release();
  }
}

/** Soma das reservas ativas, fora de transacao (usada na consulta de credito). */
async function somarReservado(licitanteId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(valor), 0) AS reservado
       FROM reservas_credito
      WHERE licitante_id = $1 AND status = 'RESERVADA'`,
    [licitanteId]
  );
  return Number(rows[0].reservado);
}

/** Todas as reservas do licitante, das mais novas para as mais antigas (DESC). */
async function listarPorLicitante(licitanteId) {
  const { rows } = await pool.query(
    'SELECT * FROM reservas_credito WHERE licitante_id = $1 ORDER BY id DESC',
    [licitanteId]
  );
  return rows;
}

/**
 * Libera TODAS as reservas ainda ativas (RESERVADA) de um leilao, num UPDATE
 * so. Usado quando o leilao e CANCELADO: ninguem mais pode ganhar, entao o
 * credito de todos volta a ficar disponivel.
 * E idempotente: rodar de novo nao encontra mais reservas ativas e nao muda nada.
 * @returns a lista de reservas liberadas agora (vazia se nao havia nenhuma)
 */
async function liberarPorLeilao(leilaoId) {
  const { rows } = await pool.query(
    `UPDATE reservas_credito
        SET status = 'LIBERADA', liberado_em = NOW()
      WHERE leilao_id = $1 AND status = 'RESERVADA'
      RETURNING *`,
    [leilaoId]
  );
  return rows;
}

module.exports = { emTransacao, somarReservado, listarPorLicitante, liberarPorLeilao };
