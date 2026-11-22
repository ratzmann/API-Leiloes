// =============================================================================
// utils/encerramento.js  -  ENCERRAMENTO GRACIOSO do servico (SIGTERM / SIGINT)
// -----------------------------------------------------------------------------
// Quando o Kubernetes (T3) apaga ou troca um pod, ele manda o sinal SIGTERM ao
// processo e espera ate 30 s; se o processo nao terminar, manda SIGKILL. O Docker
// (docker stop) e o Render fazem o mesmo. O Node, rodando como processo 1 do
// container, IGNORA o SIGTERM se ninguem tratar: o pod ficava 30 s "Terminating"
// (ainda contando no painel "Pods no ar" do Grafana) e so morria a forca.
//
// Com este modulo, ao receber o sinal o servico:
//   1. para de aceitar conexoes novas e termina as requisicoes em andamento
//      (servidor.close);
//   2. fecha as conexoes com o Postgres (pool.end);
//   3. sai com codigo 0. Se algo travar, sai a forca (codigo 1) depois de um prazo.
//
// Camada: apoio (utils). Quem chama: server.js | Quem e chamado: http.Server e pg.Pool
// (Arquivo identico no auth-service, no usuarios-service e no leiloes-service.)
// =============================================================================

// prazo maximo do encerramento: abaixo dos 30 s que o Kubernetes espera
const PRAZO_PADRAO_MS = 10000;

/**
 * Encerra o servico com calma: fecha o servidor HTTP (espera as requisicoes em
 * andamento), depois o pool do banco, e chama `sair(0)`. Se der erro, `sair(1)`.
 * Se nao terminar em `prazoMs`, um temporizador chama `sair(1)` (encerramento a forca).
 *
 * Recebe { servidor, pool, sinal, sair, prazoMs, log }; `sair` e `log` existem para
 * os testes trocarem process.exit e console por funcoes falsas.
 * Devolve uma Promise que termina depois de chamar `sair`.
 */
async function encerrar({ servidor, pool, sinal, sair, prazoMs = PRAZO_PADRAO_MS, log = console }) {
  log.log(`Sinal ${sinal} recebido: encerrando (fim das requisicoes em andamento e do banco)...`);
  const forcar = setTimeout(() => {
    log.error(`Encerramento passou de ${prazoMs} ms: saindo a forca.`);
    sair(1);
  }, prazoMs);
  // unref: o temporizador sozinho nao segura o processo vivo
  forcar.unref();

  try {
    await new Promise((resolve, reject) => servidor.close((err) => (err ? reject(err) : resolve())));
    await pool.end();
    clearTimeout(forcar);
    log.log('Encerrado sem pendencias.');
    sair(0);
  } catch (err) {
    clearTimeout(forcar);
    log.error('Erro ao encerrar:', err.message);
    sair(1);
  }
}

/**
 * Registra o encerramento gracioso para SIGTERM (Kubernetes, Docker, Render) e
 * SIGINT (Ctrl+C no terminal). `once`: um segundo sinal nao dispara outro encerramento.
 *
 * Recebe o servidor HTTP (o retorno de app.listen) e o pool do banco; opcionalmente
 * `processo` (padrao: process), para os testes. Nao devolve nada.
 */
function prepararEncerramento(servidor, pool, processo = process) {
  for (const sinal of ['SIGTERM', 'SIGINT']) {
    processo.once(sinal, () => encerrar({ servidor, pool, sinal, sair: (codigo) => processo.exit(codigo) }));
  }
}

module.exports = { encerrar, prepararEncerramento, PRAZO_PADRAO_MS };
