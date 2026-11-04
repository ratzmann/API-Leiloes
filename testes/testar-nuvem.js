// =============================================================================
// testes/testar-nuvem.js  -  TESTE INTEGRADO dos 4 servicos no Render (T2)
// -----------------------------------------------------------------------------
// Confere, na nuvem, que os 4 servicos conversam entre si (sem o Kong: cada um
// e chamado direto pela URL do Render). Sao 21 conferencias:
//   0. /health dos 4 (versao e ambiente);
//   1. registro de 2 licitantes e 1 leiloeiro (auth -> usuarios, chave interna);
//   2. login;
//   3. cadastro e abertura de um leilao (leiloes -> usuarios valida o leiloeiro);
//   4. lance de A pela Saga (lances -> leiloes e usuarios) e credito reservado;
//   5. B cobre o lance: o credito de A volta (passo 4 da Saga);
//   6. recusas: lance abaixo do incremento (400) e credito de outro licitante (403);
//   7. cancelar o leilao devolve o credito (leiloes -> usuarios, rota interna).
//
// Cria dados de teste novos a cada execucao (e-mails com sufixo) e, no fim,
// cancela o leilao. Nao usa nem imprime segredos.
//
// Uso (Node 24, sem instalar nada):
//   node testes/testar-nuvem.js dev
//   node testes/testar-nuvem.js homol
// Leva ~2 min: o leilao criado so comeca a aceitar lances depois de ~1 min.
// No plano gratuito do Render os servicos "dormem"; a primeira chamada pode
// levar quase 1 min.
// Quem chama: a pessoa que quer conferir o DEV ou o HOMOL (docs/T2-PROCESSO.md).
// Quem e chamado: os 4 servicos publicados no Render.
// =============================================================================

const AMBIENTES = {
  dev: {
    auth: 'https://auth-service-dev-rslq.onrender.com',
    usuarios: 'https://usuarios-service-dev.onrender.com',
    leiloes: 'https://leiloes-service-dev-bnhz.onrender.com',
    lances: 'https://lances-service-dev.onrender.com',
  },
  homol: {
    auth: 'https://auth-service-homol-czky.onrender.com',
    usuarios: 'https://usuarios-service-homol.onrender.com',
    leiloes: 'https://leiloes-service-homol-igr9.onrender.com',
    lances: 'https://lances-service-homol.onrender.com',
  },
};

const nomeAmbiente = process.argv[2];
const URLS = AMBIENTES[nomeAmbiente];
if (!URLS) {
  console.log('Uso: node testes/testar-nuvem.js dev   (ou homol)');
  process.exit(2);
}

const sufixo = Date.now();
const dominio = `teste-${nomeAmbiente}.com`;
let falhas = 0;

/** Espera `ms` milissegundos (usado enquanto o leilao nao comeca). */
function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chama um servico: recebe o nome do servico, o metodo, a rota, o corpo
 * (opcional) e o token (opcional). Devolve { status, json }.
 */
async function chamar(servico, metodo, rota, corpo, token) {
  const resposta = await fetch(URLS[servico] + rota, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resposta.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { json = { bruto: texto.slice(0, 120) }; }
  return { status: resposta.status, json };
}

/** Imprime uma conferencia ([OK] ou [FALHA]) e conta as falhas. */
function passo(nome, ok, detalhe) {
  if (!ok) falhas++;
  console.log(`${ok ? '[OK]   ' : '[FALHA]'} ${nome}${detalhe ? ' -> ' + detalhe : ''}`);
}

/** Gera um CPF valido (digitos verificadores certos), diferente a cada chamada. */
function novoCpf() {
  const digitos = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const verificador = (base) => {
    let soma = 0;
    base.forEach((n, i) => { soma += n * (base.length + 1 - i); });
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = verificador(digitos);
  return [...digitos, d1, verificador([...digitos, d1])].join('');
}

/** Roda as 21 conferencias, em ordem, e termina com codigo 1 se alguma falhar. */
async function main() {
  console.log(`Teste integrado no ambiente ${nomeAmbiente.toUpperCase()}\n`);

  // 0. acorda os servicos (o plano gratuito dorme depois de ~15 min sem uso)
  for (const [nome, url] of Object.entries(URLS)) {
    const inicio = Date.now();
    const saude = await fetch(url + '/health').then((r) => r.json()).catch((e) => ({ erro: e.message }));
    passo(`0. ${nome} /health`, saude.status === 'ok' && saude.ambiente === nomeAmbiente,
      `${saude.versao} (${saude.ambiente}) em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  }

  // 1. registros pelo auth (o auth cria o perfil no usuarios pela rota interna)
  const regA = await chamar('auth', 'POST', '/registrar', { nome: 'Licitante A Teste', email: `a${sufixo}@${dominio}`, senha: 'senha123', papel: 'LICITANTE', dadosPerfil: { cpf: novoCpf(), limiteCredito: 5000 } });
  passo('1. registrar licitante A (auth -> usuarios)', regA.status === 201 && regA.json.perfil, `HTTP ${regA.status}`);
  const regB = await chamar('auth', 'POST', '/registrar', { nome: 'Licitante B Teste', email: `b${sufixo}@${dominio}`, senha: 'senha123', papel: 'LICITANTE', dadosPerfil: { cpf: novoCpf(), limiteCredito: 5000 } });
  passo('1. registrar licitante B', regB.status === 201 && regB.json.perfil, `HTTP ${regB.status}`);
  const regL = await chamar('auth', 'POST', '/registrar', { nome: 'Leiloeiro Teste', email: `l${sufixo}@${dominio}`, senha: 'senha123', papel: 'LEILOEIRO', dadosPerfil: { registroProfissional: `JUCESC-${String(sufixo).slice(-6)}` } });
  passo('1. registrar leiloeiro', regL.status === 201 && regL.json.perfil, `HTTP ${regL.status}`);
  if (falhas) return;
  const tokenA = regA.json.token;
  const tokenB = regB.json.token;
  const tokenL = regL.json.token;
  const idA = regA.json.perfil.id;
  const idB = regB.json.perfil.id;

  // 2. login confere a senha e devolve um token novo
  const login = await chamar('auth', 'POST', '/login', { email: `a${sufixo}@${dominio}`, senha: 'senha123' });
  passo('2. login do licitante A', login.status === 200 && login.json.token, `HTTP ${login.status}`);

  // 3. leilao comecando em ~60 s (o leiloes valida o leiloeiro no usuarios)
  const inicio = new Date(Date.now() + 60 * 1000).toISOString();
  const fim = new Date(Date.now() + 50 * 60 * 1000).toISOString();
  const leilao = await chamar('leiloes', 'POST', '/leiloes', { titulo: `Teste integrado ${nomeAmbiente} ${sufixo}`, quantidadeBois: 10, lanceInicial: 1000, incrementoMinimo: 100, dataInicio: inicio, dataFim: fim }, tokenL);
  passo('3. cadastrar leilao (leiloes -> usuarios)', leilao.status === 201, `HTTP ${leilao.status}, leilao ${leilao.json && leilao.json.id}`);
  if (leilao.status !== 201) return;
  const idLeilao = leilao.json.id;
  const aberto = await chamar('leiloes', 'PATCH', `/leiloes/${idLeilao}/abrir`, null, tokenL);
  passo('3. abrir o leilao (dono)', aberto.status === 200 && aberto.json.status === 'ABERTO', `HTTP ${aberto.status}`);

  let aceitando = false;
  for (let i = 0; i < 40 && !aceitando; i++) {
    const disponibilidade = await chamar('leiloes', 'GET', `/leiloes/${idLeilao}/disponibilidade`);
    aceitando = Boolean(disponibilidade.json && disponibilidade.json.aceitandoLances);
    if (!aceitando) await esperar(5000);
  }
  passo('3. leilao aceitando lances', aceitando);
  if (!aceitando) return;

  // 4. Saga: lance de A (lances -> leiloes e lances -> usuarios, com a chave interna)
  const lanceA = await chamar('lances', 'POST', '/lances', { leilaoId: idLeilao, valor: 1000 }, tokenA);
  passo('4. lance de A R$ 1000 (Saga)', lanceA.status === 201 && lanceA.json.sagaStatus === 'CONCLUIDA', `HTTP ${lanceA.status}, ${lanceA.json && (lanceA.json.sagaStatus || lanceA.json.erro)}`);
  const creditoA1 = await chamar('usuarios', 'GET', `/licitantes/${idA}/credito`, null, tokenA);
  passo('4. credito de A: R$ 1000 reservados', creditoA1.status === 200 && creditoA1.json.reservado === 1000, `reservado ${creditoA1.json && creditoA1.json.reservado}`);

  // 5. B cobre o lance: o passo 4 da Saga devolve o credito de A
  const lanceB = await chamar('lances', 'POST', '/lances', { leilaoId: idLeilao, valor: 1200 }, tokenB);
  passo('5. lance de B R$ 1200 (Saga)', lanceB.status === 201 && lanceB.json.sagaStatus === 'CONCLUIDA', `HTTP ${lanceB.status}, ${lanceB.json && (lanceB.json.sagaStatus || lanceB.json.erro)}`);
  const creditoA2 = await chamar('usuarios', 'GET', `/licitantes/${idA}/credito`, null, tokenA);
  const creditoB2 = await chamar('usuarios', 'GET', `/licitantes/${idB}/credito`, null, tokenB);
  passo('5. credito de A devolvido (passo 4)', creditoA2.json && creditoA2.json.reservado === 0, `A reservado ${creditoA2.json && creditoA2.json.reservado}`);
  passo('5. credito de B: R$ 1200 reservados', creditoB2.json && creditoB2.json.reservado === 1200, `B reservado ${creditoB2.json && creditoB2.json.reservado}`);
  const maior = await chamar('lances', 'GET', `/lances/leilao/${idLeilao}/maior`);
  passo('5. maior lance do leilao e o de B', maior.json && Number(maior.json.valor) === 1200 && Number(maior.json.licitante_id) === Number(idB), `R$ ${maior.json && maior.json.valor}`);

  // 6. recusas: regra do incremento e LGPD do credito
  const baixo = await chamar('lances', 'POST', '/lances', { leilaoId: idLeilao, valor: 1250 }, tokenA);
  passo('6. lance abaixo do incremento recusado (400)', baixo.status === 400, baixo.json && baixo.json.erro);
  const alheio = await chamar('usuarios', 'GET', `/licitantes/${idB}/credito`, null, tokenA);
  passo('6. A nao ve o credito de B (403)', alheio.status === 403, alheio.json && alheio.json.erro);

  // 7. cancelar devolve o credito (leiloes -> usuarios, rota interna com a chave)
  const cancelado = await chamar('leiloes', 'PATCH', `/leiloes/${idLeilao}/cancelar`, null, tokenL);
  passo('7. cancelar o leilao (leiloes -> usuarios)', cancelado.status === 200 && cancelado.json.status === 'CANCELADO', `HTTP ${cancelado.status}`);
  const creditoB3 = await chamar('usuarios', 'GET', `/licitantes/${idB}/credito`, null, tokenB);
  passo('7. credito de B devolvido pelo cancelamento', creditoB3.json && creditoB3.json.reservado === 0, `B reservado ${creditoB3.json && creditoB3.json.reservado}`);
}

main()
  .catch((err) => { falhas++; console.log('[FALHA] erro inesperado:', err.message); })
  .finally(() => {
    console.log(`\nResultado: ${falhas === 0 ? 'TUDO OK' : `${falhas} falha(s)`}`);
    process.exitCode = falhas === 0 ? 0 : 1;
  });
