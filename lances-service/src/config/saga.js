// =============================================================================
// config/saga.js  -  CONFIGURACAO da Saga de registro de lance
// -----------------------------------------------------------------------------
// As variaveis de ambiente que mudam o comportamento da Saga ficam aqui, na
// camada config/ (como o config/ambiente.js), em vez de espalhadas pelo
// controller e pelo orquestrador:
//   SAGA_PERMITIR_FALHA_SIMULADA=true -> aceita o header X-Simular-Falha
//                                        (demonstracao da compensacao);
//   SAGA_ESPERA_REPETICAO_MS          -> espera entre as tentativas do passo 4
//                                        (padrao 300 ms; os testes usam 0).
// As funcoes leem o ambiente A CADA chamada, entao os testes podem trocar os
// valores sem recarregar o modulo.
//
// Quem chama: controllers/lanceController.js e sagas/registrarLanceSaga.js
// =============================================================================

/**
 * true se a demonstracao de falhas estiver ligada (SAGA_PERMITIR_FALHA_SIMULADA=true).
 * Desligada por padrao: sem a variavel, o header X-Simular-Falha e ignorado
 * (seguranca em producao). Recebe `env` (padrao: process.env).
 */
function falhaSimuladaPermitida(env = process.env) {
  return env.SAGA_PERMITIR_FALHA_SIMULADA === 'true';
}

/**
 * Quantos milissegundos esperar entre as tentativas do passo 4 da Saga.
 * Recebe `env` (padrao: process.env) e devolve SAGA_ESPERA_REPETICAO_MS como
 * numero, ou 300 se a variavel nao existir.
 */
function esperaEntreTentativasMs(env = process.env) {
  return Number(env.SAGA_ESPERA_REPETICAO_MS ?? 300);
}

module.exports = { falhaSimuladaPermitida, esperaEntreTentativasMs };
