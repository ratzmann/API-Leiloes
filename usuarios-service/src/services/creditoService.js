// =============================================================================
// services/creditoService.js  -  REGRAS do credito do licitante
// -----------------------------------------------------------------------------
// Cada licitante tem um LIMITE DE CREDITO. Quando ele da um lance, a Saga do
// lances-service RESERVA (bloqueia) o valor do lance. Quando alguem cobre o
// lance dele (ou se a Saga falhar), a reserva e LIBERADA (o valor volta).
//
//   disponivel = limite - soma das reservas com status RESERVADA
//
// Regras:
//   1. a soma das reservas ativas nunca ultrapassa o limite;
//   2. reservar e liberar sao IDEMPOTENTES: repetir a mesma operacao nao
//      muda o resultado (importante porque, em rede, uma chamada pode ser
//      repetida sem querer, por exemplo apos um timeout);
//   3. leilao CANCELADO devolve o credito de todas as reservas dele.
//
// Quem chama: controllers/creditoController.js
// Quem e chamado: repositories/licitanteRepository.js e reservaRepository.js
// =============================================================================

const licitanteRepository = require('../repositories/licitanteRepository');
const reservaRepository = require('../repositories/reservaRepository');
const { ErroDeValidacao } = require('../utils/erros');

// compara em centavos pra evitar erro de ponto flutuante
// Exemplo do problema: em JavaScript, 0.1 + 0.2 da 0.30000000000000004.
// Convertendo para centavos inteiros (10 + 20 = 30), a conta fica exata.
// Math.round arredonda para o inteiro mais proximo.
const centavos = (valor) => Math.round(Number(valor) * 100);
// Faz o caminho de volta: 2550 centavos -> 25.5 reais.
const reais = (valorCentavos) => valorCentavos / 100;

/**
 * Garante que o id seja um inteiro positivo e o devolve ja como numero.
 * @param id    valor recebido (normalmente texto vindo da URL)
 * @param nome  nome do campo, usado na mensagem de erro
 */
function validarId(id, nome) {
  const numero = Number(id);
  // Number.isInteger(3) -> true; Number.isInteger(3.5) ou NaN -> false.
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new ErroDeValidacao(`${nome} deve ser um numero inteiro positivo.`);
  }
  return numero;
}

/**
 * Calcula o resumo de credito do licitante.
 * @returns { licitanteId, limite, reservado, disponivel }  (valores em reais)
 */
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

/** Lista todas as reservas (ativas e liberadas) do licitante. */
async function listarReservas(licitanteId) {
  const id = validarId(licitanteId, 'licitanteId');
  return reservaRepository.listarPorLicitante(id);
}

/**
 * Regras de credito 1 e 2: a soma das reservas nunca passa do limite, e a
 * mesma referencia (id da saga) devolve a reserva que ja existe.
 *
 * PASSO 2 DA SAGA: bloqueia `valor` no credito do licitante.
 *
 * Tudo acontece dentro de uma TRANSACAO (reservaRepository.emTransacao):
 * ou todos os comandos SQL valem, ou nenhum vale. Alem disso, o licitante e
 * TRAVADO (SELECT ... FOR UPDATE) enquanto calculamos o saldo. Assim, se dois
 * lances do mesmo licitante chegarem ao mesmo tempo, o segundo espera o
 * primeiro terminar - e nao ha risco de os dois "verem" o mesmo saldo e
 * juntos passarem do limite (problema classico de concorrencia).
 *
 * O `leilaoId` (opcional) fica gravado na reserva: se o leilao for cancelado,
 * todas as reservas dele sao liberadas de uma vez (liberarPorLeilao).
 *
 * @returns { reserva, criada }  (criada = false quando a referencia ja existia)
 */
async function reservar(licitanteId, { valor, referencia, leilaoId }) {
  const id = validarId(licitanteId, 'licitanteId');
  // Number.isFinite recusa NaN e Infinity. O ! na frente inverte o resultado:
  // "se NAO (for numero finito E maior que zero)".
  if (!(Number.isFinite(Number(valor)) && Number(valor) > 0)) {
    throw new ErroDeValidacao('Valor da reserva deve ser maior que zero.');
  }
  // leilaoId e opcional; se vier, precisa ser um id valido.
  const idLeilao = leilaoId == null ? null : validarId(leilaoId, 'leilaoId');

  // Passamos uma funcao para emTransacao. Ela recebe `tx`, um objeto com
  // operacoes de banco que rodam todas dentro da mesma transacao.
  return reservaRepository.emTransacao(async (tx) => {
    // Le o licitante E o trava ate o fim da transacao.
    const licitante = await tx.travarLicitante(id);
    if (!licitante) {
      throw new ErroDeValidacao('Licitante nao encontrado.', 404);
    }

    // Idempotencia: ja existe reserva com esta referencia? Devolve a mesma.
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
        // toFixed(2) formata o numero com 2 casas decimais: 25.5 -> "25.50".
        // O + no fim da linha junta (concatena) os dois textos.
        `Credito insuficiente: disponivel R$ ${reais(disponivel).toFixed(2)}, ` +
          `lance de R$ ${Number(valor).toFixed(2)}.`,
        409
      );
    }

    const reserva = await tx.criar({ licitanteId: id, valor: Number(valor), referencia, leilaoId: idLeilao });
    return { reserva, criada: true };
  });
}

/**
 * Muda a reserva de RESERVADA para LIBERADA (o valor volta ao disponivel).
 * Usado em dois momentos da Saga:
 *   - COMPENSACAO: o passo 3 (gravar lance) falhou, entao desfazemos o passo 2;
 *   - PASSO 4: um novo lance maior chegou, entao o licitante anterior recebe
 *     o credito de volta.
 * Se a reserva ja estiver LIBERADA, apenas a devolve (idempotente - Regra de credito 2).
 */
async function liberar(licitanteId, reservaId) {
  const idLicitante = validarId(licitanteId, 'licitanteId');
  const idReserva = validarId(reservaId, 'reservaId');

  return reservaRepository.emTransacao(async (tx) => {
    const reserva = await tx.buscarPorId(idReserva);
    // Seguranca: a reserva precisa pertencer ao licitante informado na URL.
    if (!reserva || Number(reserva.licitante_id) !== idLicitante) {
      throw new ErroDeValidacao('Reserva nao encontrada para este licitante.', 404);
    }
    if (reserva.status === 'LIBERADA') {
      return reserva;
    }
    return tx.liberar(idReserva);
  });
}

/**
 * Regra de credito 3: libera, de uma vez, todas as reservas ativas de um leilao.
 * Chamado pelo leiloes-service quando um leilao e CANCELADO: sem isso, o
 * credito de quem estava ganhando ficaria bloqueado para sempre.
 * Idempotente: chamar de novo devolve `liberadas: 0` e nao muda nada.
 *
 * @returns { leilaoId, liberadas, reservas }
 */
async function liberarPorLeilao(leilaoId) {
  const id = validarId(leilaoId, 'leilaoId');
  const reservas = await reservaRepository.liberarPorLeilao(id);
  return { leilaoId: id, liberadas: reservas.length, reservas };
}

module.exports = { consultarCredito, listarReservas, reservar, liberar, liberarPorLeilao };
