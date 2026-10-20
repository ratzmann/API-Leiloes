// =============================================================================
// repositories/usuarioRepository.js  -  CAMADA DE REPOSITORY do auth-service
// -----------------------------------------------------------------------------
// O repository e o UNICO lugar que conversa com o banco de dados (SQL).
// O service pede "busque o usuario com este e-mail" e o repository sabe
// COMO fazer isso em SQL. Vantagem: nos testes trocamos este arquivo por um
// "mock" (repositories/__mocks__/usuarioRepository.js) e testamos as regras
// sem precisar de um banco de verdade.
//
// Quem chama: services/authService.js   |   Quem e chamado: config/db.js (Postgres)
// =============================================================================

const pool = require('../config/db');

/**
 * Busca um usuario pelo e-mail.
 * @returns o usuario encontrado (objeto) ou null se nao existir.
 */
async function buscarPorEmail(email) {
  // pool.query(sql, valores) envia o comando ao Postgres.
  // O $1 e um "parametro": o valor real vai separado, na lista [email].
  // NUNCA montamos o SQL juntando textos (ex.: "... = '" + email + "'"),
  // porque isso abriria brecha para SQL INJECTION (um usuario malicioso
  // digitar um pedaco de SQL no campo e-mail). O parametro impede isso.
  const { rows } = await pool.query(
    'SELECT * FROM usuarios WHERE email = $1',
    [email]
  );
  // rows e a lista de linhas encontradas. rows[0] e a primeira;
  // se a lista estiver vazia, rows[0] e undefined e devolvemos null.
  return rows[0] || null;
}

/**
 * Insere um novo usuario e devolve o registro criado.
 * RETURNING faz o Postgres devolver as colunas da linha recem-inserida
 * (incluindo o id gerado automaticamente). Note que senha_hash NAO esta
 * na lista do RETURNING: a senha nao sai do banco sem necessidade.
 */
async function criar({ nome, email, senhaHash, papel }) {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, papel)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nome, email, papel, perfil_id, criado_em`,
    [nome, email, senhaHash, papel]
  );
  return rows[0];
}

/**
 * Grava o id do perfil (criado no usuarios-service) no usuario de autenticacao.
 * E assim que os dois bancos ficam "ligados" sem um acessar o outro.
 */
async function atualizarPerfilId(usuarioId, perfilId) {
  await pool.query(
    'UPDATE usuarios SET perfil_id = $1 WHERE id = $2',
    [perfilId, usuarioId]
  );
}

/**
 * Apaga um usuario pelo id. Usado so na COMPENSACAO do registro, quando o
 * perfil nao pode ser criado no usuarios-service.
 * @returns true se apagou alguma linha
 */
async function remover(id) {
  const { rowCount } = await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { buscarPorEmail, criar, atualizarPerfilId, remover };
