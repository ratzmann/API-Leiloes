// =============================================================================
// services/licitanteService.js  -  REGRAS DE NEGOCIO do licitante
// -----------------------------------------------------------------------------
// Licitante = a pessoa que da lances. Alem dos dados cadastrais, tem um
// LIMITE DE CREDITO, que define quanto ela pode comprometer em lances
// (o controle das reservas fica no creditoService).
//
// Regras de negocio do licitante (mesma numeracao do README):
//   1. CPF valido (digitos verificadores) e unico          -> validarDados / cadastrar
//   2. e-mail unico                                       -> cadastrar
//   3. limite de credito nunca negativo                   -> validarDados
//   4. so o proprio licitante altera ou remove o cadastro -> atualizar / remover
//   5. o licitante NAO altera o proprio limite de credito -> atualizar
//
// Quem chama: controllers/licitanteController.js
// Quem e chamado: repositories/licitanteRepository.js, utils/validadores.js
// =============================================================================

const licitanteRepository = require('../repositories/licitanteRepository');
const { ErroDeValidacao } = require('../utils/erros');
const { emailValido, cpfValido } = require('../utils/validadores');
const { garantirProprioPerfil, visaoPara } = require('../utils/autorizacao');

// O que QUALQUER usuario logado pode ver de um licitante. CPF, e-mail,
// telefone, limite de credito e usuario_id sao dados pessoais (LGPD): so
// aparecem para o proprio licitante.
const CAMPOS_PUBLICOS = ['id', 'nome', 'criado_em'];

/**
 * Valida os dados do licitante. Lanca ErroDeValidacao (400) no primeiro
 * problema. `limiteCredito !== undefined`: o limite e opcional, entao so
 * validamos se ele foi informado.
 */
function validarDados({ nome, email, cpf, limiteCredito }) {
  if (!nome || nome.trim().length < 3) {
    throw new ErroDeValidacao('Nome deve ter ao menos 3 caracteres.');
  }
  if (!emailValido(email)) {
    throw new ErroDeValidacao('E-mail invalido.');
  }
  if (!cpfValido(cpf)) {
    throw new ErroDeValidacao('CPF invalido.');
  }
  if (limiteCredito !== undefined && Number(limiteCredito) < 0) {
    throw new ErroDeValidacao('Limite de credito nao pode ser negativo.');
  }
}

/**
 * Lista todos os licitantes. Cada um aparece inteiro so para o proprio
 * licitante; para os demais, so os CAMPOS_PUBLICOS (visaoPara).
 * @param usuario  quem esta logado (payload do token)
 */
async function listar(usuario) {
  const licitantes = await licitanteRepository.listar();
  return licitantes.map((licitante) => visaoPara(licitante, usuario, 'LICITANTE', CAMPOS_PUBLICOS));
}

/**
 * GET /licitantes/:id: busca um licitante (404 se nao existir) e aplica a
 * visibilidade - CPF e demais dados pessoais so para o proprio licitante.
 */
async function consultar(id, usuario) {
  const licitante = await buscarPorId(id);
  return visaoPara(licitante, usuario, 'LICITANTE', CAMPOS_PUBLICOS);
}

/**
 * Busca um licitante COMPLETO; 404 se nao existir. Uso interno do service
 * (consultar, atualizar, remover) - nao aplica a visibilidade.
 */
async function buscarPorId(id) {
  const licitante = await licitanteRepository.buscarPorId(id);
  if (!licitante) {
    throw new ErroDeValidacao('Licitante nao encontrado.', 404);
  }
  return licitante;
}

/**
 * Regras 1 a 3. Cadastra um licitante. O CPF e "limpo" (so digitos) antes
 * de validar e de gravar, para que "529.982.247-25" e "52998224725" sejam o
 * MESMO CPF na checagem de duplicidade.
 */
async function cadastrar({ usuarioId, nome, email, cpf, telefone, limiteCredito }) {
  // (cpf || '') evita erro se o cpf vier vazio: usa texto vazio no lugar.
  const cpfLimpo = (cpf || '').replace(/\D/g, '');
  validarDados({ nome, email, cpf: cpfLimpo, limiteCredito });

  const emailExistente = await licitanteRepository.buscarPorEmail(email);
  if (emailExistente) {
    throw new ErroDeValidacao('Ja existe um licitante cadastrado com este e-mail.', 409);
  }

  const cpfExistente = await licitanteRepository.buscarPorCpf(cpfLimpo);
  if (cpfExistente) {
    throw new ErroDeValidacao('Ja existe um licitante cadastrado com este CPF.', 409);
  }

  return licitanteRepository.criar({
    usuarioId,
    nome,
    email,
    // "cpf: cpfLimpo" = grava o campo cpf com o valor de cpfLimpo.
    cpf: cpfLimpo,
    telefone,
    limiteCredito,
  });
}

/**
 * Regras 4 e 5. Atualiza nome e/ou telefone do proprio licitante. Ele NAO
 * altera o proprio limite de credito (senao bastaria aumentar o limite para dar
 * lances sem lastro); o limite e definido no cadastro, e muda-lo depois
 * exigiria um papel de administrador.
 * Ordem: existe? (404) -> e o dono? (403) -> tentou mudar o limite? (403)
 * -> dados validos? (400).
 * @param usuario  quem esta logado (payload do token)
 */
async function atualizar(id, dados, usuario) {
  await buscarPorId(id);
  garantirProprioPerfil(usuario, 'LICITANTE', id);
  if (dados.limiteCredito !== undefined) {
    throw new ErroDeValidacao('O limite de credito nao pode ser alterado pelo proprio licitante.', 403);
  }
  if (dados.nome && dados.nome.trim().length < 3) {
    throw new ErroDeValidacao('Nome deve ter ao menos 3 caracteres.');
  }
  return licitanteRepository.atualizar(id, dados);
}

/**
 * Remove o proprio cadastro (404 se nao existir; 403 se nao for o dono).
 * As reservas dele somem junto: ON DELETE CASCADE.
 */
async function remover(id, usuario) {
  await buscarPorId(id);
  garantirProprioPerfil(usuario, 'LICITANTE', id);
  return licitanteRepository.remover(id);
}

module.exports = { listar, consultar, buscarPorId, cadastrar, atualizar, remover, validarDados };
