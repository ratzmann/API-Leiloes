const { requisicao, urlBase, ServicoIndisponivel } = require('./http');
const { ErroDeValidacao } = require('../utils/erros');

/**
 * Passo 2 da Saga (compensavel): reserva o valor do lance no credito do licitante.
 * A `referencia` e o id da saga, o que torna a chamada idempotente no usuarios-service.
 */
async function reservarCredito(licitanteId, valor, referencia) {
  const base = urlBase('USUARIOS_SERVICE_URL');
  const { status, corpo } = await requisicao(
    'usuarios-service',
    `${base}/licitantes/${licitanteId}/reservas`,
    { method: 'POST', body: { valor, referencia } }
  );

  if (status === 200 || status === 201) return corpo;
  if (status === 400 || status === 404 || status === 409) {
    throw new ErroDeValidacao((corpo && corpo.erro) || 'Reserva de credito recusada.', status);
  }
  throw new ServicoIndisponivel(`usuarios-service respondeu ${status} ao reservar credito.`);
}

/**
 * Compensacao do passo 2, e tambem o passo 4 (liberar o credito de quem foi superado).
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
