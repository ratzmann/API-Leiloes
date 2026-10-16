// =============================================================================
// docs/openapi.js  -  ESPECIFICACAO OpenAPI 3 do usuarios-service (Swagger)
// -----------------------------------------------------------------------------
// T2. Mostrada pelo Swagger UI em /docs, so nos ambientes com Swagger ligado
// (local e dev; ver config/ambiente.js). Escrita a mao (objeto JS) pra nao
// precisar de biblioteca de YAML nem de anotacoes no codigo.
//
// Quem chama: app.js (criarDocumentoOpenApi(versao)) e tests/app.test.js.
// =============================================================================

const erro = (descricao) => ({
  description: descricao,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
});

// Respostas da autorizacao e da validacao (revisao do T1): sem token -> 401;
// cadastro de outra pessoa -> 403; id que nao e inteiro positivo -> 400.
const semLogin = erro('Sem login: falta o token (Authorization: Bearer)');
const idInvalido = erro('Id invalido (nao e um inteiro positivo)');

const json = (descricao, schema) => ({
  description: descricao,
  content: { 'application/json': { schema } },
});

const ref = (nome) => ({ $ref: `#/components/schemas/${nome}` });

const parametroId = (descricao) => ({
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
  description: descricao,
});

const corpo = (schema) => ({
  required: true,
  content: { 'application/json': { schema } },
});

/**
 * Monta as rotas iguais de /leiloeiros e /licitantes (listar, cadastrar, buscar,
 * atualizar e remover). Recebe o nome da tag, os schemas de entrada, edicao e
 * saida e o texto do 403 (o licitante tambem nao altera o proprio limite de
 * credito). Devolve { colecao, item }, os dois caminhos prontos.
 */
function crud({ tag, singular, entrada, edicao, saida, semPermissao }) {
  const id = parametroId(`Id do ${singular}`);
  const soOProprio = erro(semPermissao);
  return {
    colecao: {
      get: {
        tags: [tag],
        summary: `Lista os ${tag.toLowerCase()} (dados pessoais so do proprio cadastro, LGPD)`,
        responses: { 200: json('Lista', { type: 'array', items: ref(saida) }) },
      },
      post: {
        tags: [tag],
        summary: `Cadastra um ${singular} (uso interno: o auth-service chama no registro; pelo Kong, 403)`,
        requestBody: corpo(ref(entrada)),
        responses: {
          201: json(`${singular} criado`, ref(saida)),
          400: erro('Dados invalidos'),
          409: erro('E-mail ou documento ja cadastrado'),
        },
      },
    },
    item: {
      get: {
        tags: [tag],
        summary: `Busca um ${singular} pelo id (dados pessoais so para o proprio, LGPD)`,
        parameters: [id],
        responses: {
          200: json(singular, ref(saida)),
          400: idInvalido,
          404: erro(`${singular} nao encontrado`),
        },
      },
      put: {
        tags: [tag],
        summary: `Atualiza o proprio cadastro de ${singular}`,
        parameters: [id],
        requestBody: corpo(ref(edicao)),
        responses: {
          200: json(`${singular} atualizado`, ref(saida)),
          400: erro('Dados ou id invalidos'),
          401: semLogin,
          403: soOProprio,
          404: erro(`${singular} nao encontrado`),
        },
      },
      delete: {
        tags: [tag],
        summary: `Remove o proprio cadastro de ${singular}`,
        parameters: [id],
        responses: {
          204: { description: 'Removido' },
          400: idInvalido,
          401: semLogin,
          403: soOProprio,
          404: erro(`${singular} nao encontrado`),
        },
      },
    },
  };
}

/**
 * Monta e devolve o documento OpenAPI (rotas, corpos e respostas de cada uma).
 * Recebe `versao` (a versao da imagem, mostrada no topo do Swagger).
 */
function criarDocumentoOpenApi(versao) {
  const leiloeiros = crud({
    tag: 'Leiloeiros',
    singular: 'leiloeiro',
    entrada: 'LeiloeiroEntrada',
    edicao: 'LeiloeiroEdicao',
    saida: 'Leiloeiro',
    semPermissao: 'Sem permissao: so o proprio leiloeiro altera ou remove o cadastro',
  });
  const licitantes = crud({
    tag: 'Licitantes',
    singular: 'licitante',
    entrada: 'LicitanteEntrada',
    edicao: 'LicitanteEdicao',
    saida: 'Licitante',
    semPermissao:
      'Sem permissao: so o proprio licitante altera ou remove o cadastro, e ele nao altera o proprio limite de credito',
  });
  const idLicitante = parametroId('Id do licitante');

  return {
    openapi: '3.0.3',
    info: {
      title: 'usuarios-service',
      version: versao,
      description:
        'Cadastro de leiloeiros e licitantes do sistema de Leilao de Bois, com o credito ' +
        'do licitante usado pela saga de lance. Pelo Kong, as rotas exigem um JWT ' +
        '(Authorization: Bearer). Consultas sao livres, mas os dados pessoais (CPF, e-mail, ' +
        'telefone, limite) so aparecem para o proprio dono (LGPD); alterar ou remover um ' +
        'cadastro exige o token do proprio (sem token: 401; de outra pessoa: 403). A criacao de ' +
        'perfis e as reservas de credito sao rotas internas: pelo Kong respondem 403. ' +
        'Swagger disponivel apenas no DEV.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Leiloeiros', description: 'Cadastro de leiloeiros' },
      { name: 'Licitantes', description: 'Cadastro de licitantes' },
      { name: 'Credito', description: 'Credito do licitante (saga de lance)' },
      { name: 'Operacao', description: 'Health check e metricas' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Erro: {
          type: 'object',
          properties: { erro: { type: 'string', example: 'Licitante nao encontrado.' } },
        },
        LeiloeiroEntrada: {
          type: 'object',
          required: ['nome', 'email', 'registroProfissional'],
          properties: {
            usuarioId: { type: 'integer', example: 1, description: 'Id no auth-service' },
            nome: { type: 'string', minLength: 3, example: 'Joao Leiloeiro' },
            email: { type: 'string', format: 'email', example: 'joao@leiloes.com' },
            registroProfissional: { type: 'string', example: 'JUCESC-000123' },
            telefone: { type: 'string', example: '47999990000' },
          },
        },
        Leiloeiro: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            usuario_id: { type: 'integer', nullable: true },
            nome: { type: 'string' },
            email: { type: 'string' },
            registro_profissional: { type: 'string' },
            telefone: { type: 'string', nullable: true },
            criado_em: { type: 'string', format: 'date-time' },
          },
        },
        LicitanteEntrada: {
          type: 'object',
          required: ['nome', 'email', 'cpf'],
          properties: {
            usuarioId: { type: 'integer', example: 2, description: 'Id no auth-service' },
            nome: { type: 'string', minLength: 3, example: 'Maria Compradora' },
            email: { type: 'string', format: 'email', example: 'maria@fazenda.com' },
            cpf: { type: 'string', example: '52998224725' },
            telefone: { type: 'string', example: '47988880000' },
            limiteCredito: { type: 'number', minimum: 0, example: 50000 },
          },
        },
        Licitante: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            usuario_id: { type: 'integer', nullable: true },
            nome: { type: 'string' },
            email: { type: 'string' },
            cpf: { type: 'string' },
            telefone: { type: 'string', nullable: true },
            limite_credito: { type: 'string', example: '50000.00' },
            criado_em: { type: 'string', format: 'date-time' },
          },
        },
        LeiloeiroEdicao: {
          type: 'object',
          description: 'Edicao parcial: so os campos enviados mudam',
          properties: {
            nome: { type: 'string', minLength: 3, example: 'Carlos Pereira' },
            telefone: { type: 'string', example: '47988887777' },
          },
        },
        LicitanteEdicao: {
          type: 'object',
          description: 'Edicao parcial. limiteCredito e recusado (403): o licitante nao altera o proprio limite',
          properties: {
            nome: { type: 'string', minLength: 3, example: 'Maria Compradora' },
            telefone: { type: 'string', example: '47988880000' },
          },
        },
        Credito: {
          type: 'object',
          properties: {
            licitanteId: { type: 'integer', example: 1 },
            limite: { type: 'number', example: 50000 },
            reservado: { type: 'number', example: 1500 },
            disponivel: { type: 'number', example: 48500 },
          },
        },
        Reserva: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 10 },
            licitante_id: { type: 'integer', example: 1 },
            valor: { type: 'string', example: '1500.00' },
            referencia: { type: 'string', nullable: true, example: 'saga-7f3c' },
            status: { type: 'string', enum: ['RESERVADA', 'LIBERADA'] },
            criado_em: { type: 'string', format: 'date-time' },
            liberado_em: { type: 'string', format: 'date-time', nullable: true },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/health': {
        get: {
          tags: ['Operacao'],
          summary: 'Health check (versao e ambiente no ar)',
          security: [],
          responses: { 200: { description: 'Servico no ar' } },
        },
      },
      '/metrics': {
        get: {
          tags: ['Operacao'],
          summary: 'Metricas no formato do Prometheus',
          security: [],
          responses: { 200: { description: 'Texto no formato de exposicao do Prometheus' } },
        },
      },
      '/leiloeiros': leiloeiros.colecao,
      '/leiloeiros/{id}': leiloeiros.item,
      '/licitantes': licitantes.colecao,
      '/licitantes/{id}': licitantes.item,
      '/licitantes/{id}/credito': {
        get: {
          tags: ['Credito'],
          summary: 'Limite, reservado e disponivel do licitante',
          parameters: [idLicitante],
          responses: {
            200: json('Credito', ref('Credito')),
            400: idInvalido,
            404: erro('Licitante nao encontrado'),
          },
        },
      },
      '/licitantes/{id}/reservas': {
        get: {
          tags: ['Credito'],
          summary: 'Lista as reservas de credito do licitante (rota interna: pelo Kong, 403)',
          parameters: [idLicitante],
          responses: { 200: json('Reservas', { type: 'array', items: ref('Reserva') }) },
        },
        post: {
          tags: ['Credito'],
          summary: 'Reserva credito (passo 2 da saga; o Kong bloqueia chamadas de fora)',
          parameters: [idLicitante],
          requestBody: corpo({
            type: 'object',
            required: ['valor'],
            properties: {
              valor: { type: 'number', example: 1500 },
              referencia: { type: 'string', example: 'saga-7f3c', description: 'Id da saga (idempotencia)' },
            },
          }),
          responses: {
            201: json('Reserva criada', ref('Reserva')),
            200: json('Mesma referencia: devolve a reserva ja existente', ref('Reserva')),
            400: erro('Valor invalido'),
            404: erro('Licitante nao encontrado'),
            409: erro('Credito insuficiente'),
          },
        },
      },
      '/licitantes/{id}/reservas/{reservaId}/liberar': {
        post: {
          tags: ['Credito'],
          summary: 'Libera a reserva (compensacao da saga; idempotente)',
          parameters: [
            idLicitante,
            { name: 'reservaId', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
          ],
          responses: {
            200: json('Reserva liberada', ref('Reserva')),
            404: erro('Reserva nao encontrada para este licitante'),
          },
        },
      },
      '/reservas/leilao/{leilaoId}/liberar': {
        post: {
          tags: ['Credito'],
          summary:
            'Libera todas as reservas de um leilao cancelado (uso interno do leiloes-service, ' +
            'Regra 8; idempotente). O Kong nao tem rota /reservas.',
          security: [],
          parameters: [
            { name: 'leilaoId', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
          ],
          responses: {
            200: json('Resumo da liberacao', {
              type: 'object',
              properties: {
                leilaoId: { type: 'integer', example: 4 },
                liberadas: { type: 'integer', example: 2 },
                reservas: { type: 'array', items: ref('Reserva') },
              },
            }),
            400: erro('leilaoId invalido'),
          },
        },
      },
    },
  };
}

module.exports = criarDocumentoOpenApi;
