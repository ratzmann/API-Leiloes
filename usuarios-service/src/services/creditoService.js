const licitanteRepository = require('../repositories/licitanteRepository');
const reservaRepository = require('../repositories/reservaRepository');
const { ErroDeValidacao } = require('../utils/erros');

// Dinheiro comparado em centavos para nao sofrer com ponto flutuante.
const centavos = (valor) => Math.round(Number(valor) * 100);
const reais = (valorCentavos) => valorCentavos / 100;

function validarId(id, nome) {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new ErroDeValidacao(`${nome} deve ser um numero inteiro positivo.`);
  }
  return numero;
}

async function consultarCredito(licitanteId) {
  const id = validarId(licitanteId, 'licitanteId');
  const licitante = await licitanteRepository.buscarPorId(id);
  if (!licitante) {
    throw new ErroDeValidacao('Licitante nao encontrado.', 404);
  }

  const limite = centavos(licitante.limite_credito);
  const reservado = centavos(await reservaRepository.somarReservado(id));
  return {
    licitanteId: id,
    limite: reais(limite),
    reservado: reais(reservado),
    disponivel: reais(limite - reservado),
  };
}

async function listarReservas(licitanteId) {
  const id = validarId(licitanteId, 'licitanteId');
  return reservaRepository.listarPorLicitante(id);
}

/**
 * Passo compensavel da Saga de lance: reserva parte do limite de credito.
 *
 * Regra de negocio: a soma das reservas ativas nunca ultrapassa o limite de
 * credito do licitante. A `referencia` (id da saga) torna a operacao
 * idempotente: se o orquestrador repetir a chamada, recebe a mesma reserva.
 */
async function reservar(licitanteId, { valor, referencia }) {
  const id = validarId(licitanteId, 'licitanteId');
  if (!(Number.isFinite(Number(valor)) && Number(valor) > 0)) {
    throw new ErroDeValidacao('Valor da reserva deve ser maior que zero.');
  }

  return reservaRepository.emTransacao(async (tx) => {
    const licitante = await tx.travarLicitante(id);
    if (!licitante) {
      throw new ErroDeValidacao('Licitante nao encontrado.', 404);
    }

    if (referencia) {
      const existente = await tx.buscarPorReferencia(referencia);
      if (existente) {
        return { reserva: existente, criada: false };
      }
    }

    const limite = centavos(licitante.limite_credito);
    const reservado = centavos(await tx.somarReservado(id));
    const disponivel = limite - reservado;

    if (centavos(valor) > disponivel) {
      throw new ErroDeValidacao(
        `Credito insuficiente: disponivel R$ ${reais(disponivel).toFixed(2)}, ` +
          `lance de R$ ${Number(valor).toFixed(2)}.`,
        409
      );
    }

    const reserva = await tx.criar({ licitanteId: id, valor: Number(valor), referencia });
    return { reserva, criada: true };
  });
}

/**
 * Compensacao do passo de reserva (e tambem o passo final da Saga, quando o
 * licitante e superado). Idempotente: liberar duas vezes nao gera erro.
 */
async function liberar(licitanteId, reservaId) {
  const idLicitante = validarId(licitanteId, 'licitanteId');
  const idReserva = validarId(reservaId, 'reservaId');

  return reservaRepository.emTransacao(async (tx) => {
    const reserva = await tx.buscarPorId(idReserva);
    if (!reserva || Number(reserva.licitante_id) !== idLicitante) {
      throw new ErroDeValidacao('Reserva nao encontrada para este licitante.', 404);
    }
    if (reserva.status === 'LIBERADA') {
      return reserva;
    }
    return tx.liberar(idReserva);
  });
}

module.exports = { consultarCredito, listarReservas, reservar, liberar };
