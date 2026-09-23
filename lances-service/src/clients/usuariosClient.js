// =============================================================================
// clients/usuariosClient.js  -  CLIENTE HTTP do usuarios-service (credito)
// -----------------------------------------------------------------------------
// Usado nos passos da Saga que mexem no credito do licitante:
//   - reservarCredito -> PASSO 2 (bloqueia o valor do lance)
//   - liberarReserva  -> COMPENSACAO do passo 2 e PASSO 4 (devolve o valor)
// As rotas chamadas (/licitantes/:id/reservas) sao internas: o Kong bloqueia
// quem vem de fora, mas este servico chama direto pela rede do Docker.
// =============================================================================

const { requisicao, urlBase, ServicoIndisponivel } = require('./http');
const { ErroDeValidacao } = require('../utils/erros');

// passo 2 da saga: reserva o valor no credito do licitante.
// a referencia e o id da saga, entao repetir a chamada nao reserva duas vezes
/**
 * POST /licitantes/:id/reservas   corpo: { valor, referencia, leilaoId }
 * O leilaoId fica gravado na reserva: se o leilao for CANCELADO, o
 * usuarios-service libera todas as reservas dele de uma vez.
 * @returns a reserva criada (ou a ja existente, se a referencia se repetir)
 * Recusas de negocio (400 dado invalido, 404 licitante nao existe,
 * 409 credito insuficiente) viram ErroDeValidacao com o MESMO codigo,
 * para o cliente final receber a mensagem certa.
 */
async function reservarCredito(licitanteId, valor, referencia, leilaoId) {
  const base = urlBase('USUARIOS_SERVICE_URL');
  const { status, corpo } = await requisicao(
    'usuarios-service',
    `${base}/licitantes/${licitanteId}/reservas`,
    { method: 'POST', body: { valor, referencia, leilaoId } }
  );

  if (status === 200 || status === 201) return corpo;
  if (status === 400 || status === 404 || status === 409) {
    // (corpo && corpo.erro): so le corpo.erro se corpo existir (evita erro com null).
    throw new ErroDeValidacao((corpo && corpo.erro) || 'Reserva de credito recusada.', status);
  }
  throw new ServicoIndisponivel(`usuarios-service respondeu ${status} ao reservar credito.`);
}

// usado na compensacao do passo 2 e no passo 4 (liberar quem foi superado)
/**
 * POST /licitantes/:id/reservas/:reservaId/liberar
 * Qualquer resposta diferente de 200 e tratada como falha (ServicoIndisponivel):
 * a Saga vai registrar a falha e, no passo 4, tentar de novo.
 */
async function liberarReserva(licitanteId, reservaId) {
  const base = urlBase('USUARIOS_SERVICE_URL');
  const { status, corpo } = await requisicao(
    'usuarios-service',
    `${base}/licitantes/${licitanteId}/reservas/${reservaId}/liberar`,
    { method: 'POST' }
  );

  if (status === 200) return corpo;
  throw new ServicoIndisponivel(
    `usuarios-service respondeu ${status} ao liberar a reserva ${reservaId}: ${(corpo && corpo.erro) || ''}`.trim()
  );
}

module.exports = { reservarCredito, liberarReserva };
