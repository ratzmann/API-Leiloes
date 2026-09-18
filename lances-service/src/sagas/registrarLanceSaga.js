// Saga orquestrada do registro de lance.
// Cada servico tem seu banco, entao nao da pra fazer tudo numa transacao so.
//
//   1. consultar-disponibilidade  leiloes-service   so leitura
//   2. reservar-credito           usuarios-service  se algo falhar depois, libera a reserva
//   3. gravar-lance               lances-service    daqui pra frente o lance vale
//   4. liberar-credito-superado   usuarios-service  se falhar, fica pendente pra reprocessar
//
// O andamento fica salvo na tabela sagas_lance.

const lanceRepository = require('../repositories/lanceRepository');
const sagaRepository = require('../repositories/sagaRepository');
const leiloesClient = require('../clients/leiloesClient');
const usuariosClient = require('../clients/usuariosClient');
const { ServicoIndisponivel } = require('../clients/http');
const { ErroDeValidacao } = require('../utils/erros');
const { validarValorDoLance } = require('../services/regrasDoLance');

const PASSOS = {
  DISPONIBILIDADE: 'consultar-disponibilidade',
  RESERVA: 'reservar-credito',
  GRAVAR: 'gravar-lance',
  LIBERAR_SUPERADO: 'liberar-credito-superado',
};

const TENTATIVAS_PASSO_REPETIVEL = 3;
const esperaEntreTentativas = () => Number(process.env.SAGA_ESPERA_REPETICAO_MS ?? 300);

class FalhaSimulada extends Error {
  constructor(passo) {
    super(`Falha simulada no passo ${passo}.`);
    this.name = 'FalhaSimulada';
  }
}

function simularSeSolicitado(simularFalha, passo) {
  if (simularFalha && simularFalha === passo) {
    throw new FalhaSimulada(passo);
  }
}

function registrarPasso(saga, passo, resultado, detalhe) {
  saga.passos.push({ passo, resultado, detalhe, em: new Date().toISOString() });
}

// transforma qualquer erro em resposta HTTP, com o id da saga junto
function erroDaSaga(err, passo, saga) {
  let erro;
  if (err instanceof ErroDeValidacao) {
    erro = err;
  } else if (err instanceof ServicoIndisponivel) {
    erro = new ErroDeValidacao(`Servico indisponivel no passo ${passo}: ${err.message}`, 503);
  } else if (err instanceof FalhaSimulada) {
    erro = new ErroDeValidacao(err.message, 500);
  } else {
    console.error(err);
    erro = new ErroDeValidacao(`Falha interna no passo ${passo}.`, 500);
  }
  erro.sagaId = saga.id;
  return erro;
}

async function executar({ leilaoId, licitanteId, valor, simularFalha = null }) {
  const saga = await sagaRepository.criar({ leilaoId, licitanteId, valor });
  saga.passos = [];

  let passoAtual = PASSOS.DISPONIBILIDADE;
  let reserva = null;
  let lance = null;
  let superado = null;

  try {
    // passo 1: o leilao existe e esta aceitando lance?
    const leilao = await leiloesClient.consultarDisponibilidade(leilaoId);
    if (!leilao) {
      throw new ErroDeValidacao('Leilao nao encontrado no leiloes-service.', 404);
    }
    if (!leilao.aceitandoLances) {
      throw new ErroDeValidacao(
        `Leilao nao esta aceitando lances (status ${leilao.status}, fora do periodo ou ainda nao aberto).`,
        409
      );
    }
    // ja barra lance baixo aqui, antes de mexer no credito de alguem
    validarValorDoLance({
      valor,
      licitanteId,
      maiorLance: await lanceRepository.buscarMaiorPorLeilao(leilaoId),
      lanceInicial: leilao.lanceInicial,
      incrementoMinimo: leilao.incrementoMinimo,
    });
    registrarPasso(saga, passoAtual, 'OK', `Leilao ${leilaoId} ${leilao.status}, aceitando lances.`);
    await sagaRepository.salvar(saga);

    // passo 2: reserva o valor no credito do licitante
    passoAtual = PASSOS.RESERVA;
    simularSeSolicitado(simularFalha, passoAtual);
    reserva = await usuariosClient.reservarCredito(licitanteId, valor, `saga-${saga.id}`);
    saga.reserva_id = reserva.id;
    registrarPasso(saga, passoAtual, 'OK', `Reserva ${reserva.id} de R$ ${Number(valor).toFixed(2)}.`);
    await sagaRepository.salvar(saga);

    // passo 3: grava o lance
    passoAtual = PASSOS.GRAVAR;
    simularSeSolicitado(simularFalha, passoAtual);
    ({ lance, superado } = await lanceRepository.registrarComTrava(leilaoId, async (tx) => {
      const maiorAtual = await tx.buscarMaior();
      // confere de novo com o leilao travado (pode ter entrado outro lance no meio)
      validarValorDoLance({
        valor,
        licitanteId,
        maiorLance: maiorAtual,
        lanceInicial: leilao.lanceInicial,
        incrementoMinimo: leilao.incrementoMinimo,
      });
      const novo = await tx.criar({ licitanteId, valor, sagaId: saga.id, reservaId: reserva.id });
      return { lance: novo, superado: maiorAtual };
    }));
    saga.lance_id = lance.id;
    registrarPasso(saga, passoAtual, 'OK', `Lance ${lance.id} gravado.`);
  } catch (err) {
    const erro = erroDaSaga(err, passoAtual, saga);
    registrarPasso(saga, passoAtual, 'FALHOU', erro.message);
    saga.erro = erro.message;
    saga.status = 'FALHOU';

    // compensacao: se ja tinha reservado credito, devolve
    if (reserva) {
      try {
        await usuariosClient.liberarReserva(licitanteId, reserva.id);
        registrarPasso(saga, PASSOS.RESERVA, 'COMPENSADO', `Reserva ${reserva.id} liberada.`);
        saga.status = 'COMPENSADA';
      } catch (errCompensacao) {
        registrarPasso(saga, PASSOS.RESERVA, 'FALHOU_COMPENSACAO', errCompensacao.message);
        saga.status = 'FALHOU_COMPENSACAO';
      }
    }

    await sagaRepository.salvar(saga);
    throw erro;
  }

  // passo 4: libera o credito de quem foi superado
  if (superado && superado.reserva_id) {
    saga.licitante_superado_id = Number(superado.licitante_id);
    saga.reserva_superada_id = Number(superado.reserva_id);
    await liberarCreditoSuperado(saga, simularFalha);
  } else {
    registrarPasso(saga, PASSOS.LIBERAR_SUPERADO, 'OK', 'Nenhum lance anterior com credito reservado.');
    saga.status = 'CONCLUIDA';
  }
  await sagaRepository.salvar(saga);

  return { ...lance, sagaId: saga.id, sagaStatus: saga.status };
}

async function liberarCreditoSuperado(saga, simularFalha = null) {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS_PASSO_REPETIVEL; tentativa++) {
    try {
      simularSeSolicitado(simularFalha, PASSOS.LIBERAR_SUPERADO);
      await usuariosClient.liberarReserva(saga.licitante_superado_id, saga.reserva_superada_id);
      registrarPasso(
        saga,
        PASSOS.LIBERAR_SUPERADO,
        'OK',
        `Reserva ${saga.reserva_superada_id} do licitante ${saga.licitante_superado_id} liberada.`
      );
      saga.status = 'CONCLUIDA';
      saga.erro = null;
      return true;
    } catch (err) {
      ultimoErro = err;
      if (tentativa < TENTATIVAS_PASSO_REPETIVEL) {
        await new Promise((resolve) => setTimeout(resolve, esperaEntreTentativas()));
      }
    }
  }

  registrarPasso(
    saga,
    PASSOS.LIBERAR_SUPERADO,
    'PENDENTE',
    `Nao foi possivel liberar apos ${TENTATIVAS_PASSO_REPETIVEL} tentativas: ${ultimoErro.message}`
  );
  saga.status = 'CONCLUIDA_COM_PENDENCIA';
  saga.erro = ultimoErro.message;
  return false;
}

// tenta de novo o passo 4 de uma saga que ficou pendente
async function reprocessar(sagaId) {
  const saga = await sagaRepository.buscarPorId(sagaId);
  if (!saga) {
    throw new ErroDeValidacao('Saga nao encontrada.', 404);
  }
  if (saga.status !== 'CONCLUIDA_COM_PENDENCIA') {
    throw new ErroDeValidacao(`Saga com status ${saga.status} nao tem pendencia para reprocessar.`, 409);
  }

  saga.passos = Array.isArray(saga.passos) ? saga.passos : [];
  const liberou = await liberarCreditoSuperado(saga);
  const salva = await sagaRepository.salvar(saga);

  if (!liberou) {
    const erro = new ErroDeValidacao('usuarios-service ainda indisponivel; a pendencia continua.', 503);
    erro.sagaId = saga.id;
    throw erro;
  }
  return salva;
}

module.exports = { executar, reprocessar, PASSOS };
