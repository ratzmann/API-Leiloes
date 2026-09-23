// =============================================================================
// sagas/registrarLanceSaga.js  -  ORQUESTRADOR DA SAGA de registro de lance
// -----------------------------------------------------------------------------
// O PROBLEMA
//   Registrar um lance envolve 3 servicos, cada um com o SEU banco:
//     leiloes-service  (o leilao aceita lances?)
//     usuarios-service (o licitante tem credito? reserva o valor)
//     lances-service   (grava o lance)
//   Num sistema com um banco so, fariamos tudo numa transacao (BEGIN/COMMIT).
//   Com bancos separados isso nao existe: nao ha um COMMIT que valha para os tres.
//
// A SOLUCAO: padrao SAGA
//   Uma sequencia de transacoes LOCAIS, uma por servico. Se um passo falha,
//   executamos as COMPENSACOES (acoes que desfazem) dos passos que ja deram
//   certo. "Orquestrada" = existe um coordenador central (este arquivo) que
//   diz a cada servico o que fazer e em que ordem.
//
// Saga orquestrada do registro de lance.
// Cada servico tem seu banco, entao nao da pra fazer tudo numa transacao so.
//
//   1. consultar-disponibilidade  leiloes-service   so leitura
//   2. reservar-credito           usuarios-service  se algo falhar depois, libera a reserva
//   3. gravar-lance               lances-service    daqui pra frente o lance vale
//   4. liberar-credito-superado   usuarios-service  se falhar, fica pendente pra reprocessar
//
// O andamento fica salvo na tabela sagas_lance.
//
// STATUS FINAIS POSSIVEIS
//   CONCLUIDA                -> tudo certo
//   CONCLUIDA_COM_PENDENCIA  -> lance gravado, mas o passo 4 falhou 3 vezes
//                               (pode ser reprocessado depois)
//   FALHOU                   -> falhou antes de reservar credito (nada a desfazer)
//   COMPENSADA               -> falhou depois da reserva, e a reserva foi devolvida
//   FALHOU_COMPENSACAO       -> falhou e ATE a devolucao falhou (exige atencao manual)
// =============================================================================

const lanceRepository = require('../repositories/lanceRepository');
const sagaRepository = require('../repositories/sagaRepository');
const leiloesClient = require('../clients/leiloesClient');
const usuariosClient = require('../clients/usuariosClient');
const { ServicoIndisponivel } = require('../clients/http');
const { ErroDeValidacao } = require('../utils/erros');
const { validarValorDoLance } = require('../services/regrasDoLance');

// Nomes dos passos, centralizados num objeto para evitar erro de digitacao
// (usamos PASSOS.RESERVA em vez de escrever 'reservar-credito' em varios lugares).
// Estes mesmos textos sao aceitos no header X-Simular-Falha.
const PASSOS = {
  DISPONIBILIDADE: 'consultar-disponibilidade',
  RESERVA: 'reservar-credito',
  GRAVAR: 'gravar-lance',
  LIBERAR_SUPERADO: 'liberar-credito-superado',
};

// O passo 4 e "repetivel": tenta ate 3 vezes antes de desistir.
const TENTATIVAS_PASSO_REPETIVEL = 3;
// Espera entre tentativas (padrao 300 ms). E uma FUNCAO (e nao uma constante)
// para ler a variavel de ambiente na hora - os testes a zeram para rodar rapido.
const esperaEntreTentativas = () => Number(process.env.SAGA_ESPERA_REPETICAO_MS ?? 300);

/** Erro usado apenas na demonstracao (header X-Simular-Falha). */
class FalhaSimulada extends Error {
  constructor(passo) {
    super(`Falha simulada no passo ${passo}.`);
    this.name = 'FalhaSimulada';
  }
}

/** Se pediram para simular falha NESTE passo, lanca FalhaSimulada. */
function simularSeSolicitado(simularFalha, passo) {
  if (simularFalha && simularFalha === passo) {
    throw new FalhaSimulada(passo);
  }
}

/**
 * Anota um passo no "diario" da saga (em memoria; e gravado no banco no
 * proximo sagaRepository.salvar).
 * { passo, resultado, ... } e atalho para { passo: passo, resultado: resultado, ... }.
 * toISOString() gera a data/hora no formato padrao "2026-10-01T14:00:00.000Z".
 */
function registrarPasso(saga, passo, resultado, detalhe) {
  saga.passos.push({ passo, resultado, detalhe, em: new Date().toISOString() });
}

// transforma qualquer erro em resposta HTTP, com o id da saga junto
/**
 * Converte os varios tipos de erro num ErroDeValidacao com o codigo HTTP certo:
 *   ErroDeValidacao      -> mantem (ex.: 409 credito insuficiente)
 *   ServicoIndisponivel  -> 503 (outro servico fora do ar)
 *   FalhaSimulada        -> 500 (demonstracao)
 *   qualquer outro       -> 500 (bug; detalhe vai para o log)
 * E sempre anexa o sagaId, para o cliente poder consultar a saga.
 */
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

/**
 * EXECUTA A SAGA do comeco ao fim.
 * @returns o lance gravado + { sagaId, sagaStatus }
 * @throws  ErroDeValidacao (com sagaId) se o lance for recusado ou algo falhar
 */
async function executar({ leilaoId, licitanteId, valor, simularFalha = null }) {
  // Cria o registro da saga no banco ANTES de tudo (status INICIADA).
  const saga = await sagaRepository.criar({ leilaoId, licitanteId, valor });
  saga.passos = [];

  // Variaveis de controle: em que passo estamos e o que ja foi feito.
  // Sao usadas no catch para saber O QUE compensar.
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
    // A referencia `saga-<id>` torna a reserva IDEMPOTENTE: se esta chamada for
    // repetida, o usuarios-service devolve a mesma reserva em vez de criar outra.
    passoAtual = PASSOS.RESERVA;
    simularSeSolicitado(simularFalha, passoAtual);
    reserva = await usuariosClient.reservarCredito(licitanteId, valor, `saga-${saga.id}`);
    saga.reserva_id = reserva.id;
    registrarPasso(saga, passoAtual, 'OK', `Reserva ${reserva.id} de R$ ${Number(valor).toFixed(2)}.`);
    await sagaRepository.salvar(saga);

    // passo 3: grava o lance
    // Este e o "PONTO SEM VOLTA": depois de gravado, o lance vale e a saga nao
    // desfaz mais nada - dai em diante so segue para frente.
    passoAtual = PASSOS.GRAVAR;
    simularSeSolicitado(simularFalha, passoAtual);
    // Os parenteses em volta de ({ lance, superado } = ...) sao obrigatorios
    // quando se desestrutura para variaveis JA declaradas (com let, acima).
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
      // `superado` = quem tinha o maior lance antes deste (vai receber o credito de volta).
      return { lance: novo, superado: maiorAtual };
    }));
    saga.lance_id = lance.id;
    registrarPasso(saga, passoAtual, 'OK', `Lance ${lance.id} gravado.`);
  } catch (err) {
    // ALGUM PASSO (1, 2 ou 3) FALHOU.
    const erro = erroDaSaga(err, passoAtual, saga);
    registrarPasso(saga, passoAtual, 'FALHOU', erro.message);
    saga.erro = erro.message;
    saga.status = 'FALHOU';

    // compensacao: se ja tinha reservado credito, devolve
    // (Se falhou no passo 1, `reserva` ainda e null e nao ha nada a desfazer.)
    if (reserva) {
      try {
        await usuariosClient.liberarReserva(licitanteId, reserva.id);
        registrarPasso(saga, PASSOS.RESERVA, 'COMPENSADO', `Reserva ${reserva.id} liberada.`);
        saga.status = 'COMPENSADA';
      } catch (errCompensacao) {
        // Pior caso: nem a compensacao funcionou. Fica registrado para
        // correcao manual.
        registrarPasso(saga, PASSOS.RESERVA, 'FALHOU_COMPENSACAO', errCompensacao.message);
        saga.status = 'FALHOU_COMPENSACAO';
      }
    }

    await sagaRepository.salvar(saga);
    // Repassa o erro para o controller responder ao cliente.
    throw erro;
  }

  // passo 4: libera o credito de quem foi superado
  // So existe se havia um lance anterior E ele tinha reserva de credito.
  if (superado && superado.reserva_id) {
    saga.licitante_superado_id = Number(superado.licitante_id);
    saga.reserva_superada_id = Number(superado.reserva_id);
    await liberarCreditoSuperado(saga, simularFalha);
  } else {
    registrarPasso(saga, PASSOS.LIBERAR_SUPERADO, 'OK', 'Nenhum lance anterior com credito reservado.');
    saga.status = 'CONCLUIDA';
  }
  await sagaRepository.salvar(saga);

  // Devolve os campos do lance (...lance) mais o id e o status da saga.
  return { ...lance, sagaId: saga.id, sagaStatus: saga.status };
}

/**
 * PASSO 4 (repetivel): devolve o credito do licitante que foi superado.
 * O lance novo JA esta gravado, entao uma falha aqui NAO desfaz nada: tentamos
 * ate 3 vezes e, se nao der, marcamos a saga como CONCLUIDA_COM_PENDENCIA para
 * reprocessar depois (POST /lances/sagas/:id/reprocessar).
 * @returns true se liberou, false se ficou pendente
 */
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
      // Espera um pouco antes de tentar de novo (menos na ultima tentativa).
      if (tentativa < TENTATIVAS_PASSO_REPETIVEL) {
        await new Promise((resolve) => setTimeout(resolve, esperaEntreTentativas()));
      }
    }
  }

  // Esgotou as tentativas: registra a pendencia.
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
/**
 * Reprocessa o passo 4. So vale para sagas CONCLUIDA_COM_PENDENCIA (409 nas
 * demais). Como liberar e idempotente, repetir nao causa problema.
 * @returns a saga atualizada; lanca 503 se o usuarios-service continuar fora.
 */
async function reprocessar(sagaId) {
  const saga = await sagaRepository.buscarPorId(sagaId);
  if (!saga) {
    throw new ErroDeValidacao('Saga nao encontrada.', 404);
  }
  if (saga.status !== 'CONCLUIDA_COM_PENDENCIA') {
    throw new ErroDeValidacao(`Saga com status ${saga.status} nao tem pendencia para reprocessar.`, 409);
  }

  // Garante que passos seja uma lista (o pg converte JSONB em array JS).
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
