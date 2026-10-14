// Especificacao OpenAPI 3 do usuarios-service, mostrada pelo Swagger UI em /docs.
// Escrita a mao (objeto JS) pra nao precisar de biblioteca de YAML nem de anotacoes.
// So e publicada nos ambientes com Swagger ligado (ver config/ambiente.js).

const erro = (descricao) => ({
  description: descricao,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
});

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

// CRUD igual para /leiloeiros e /licitantes; muda o nome e os schemas
function crud({ tag, singular, entrada, saida }) {
  const id = parametroId(`Id do ${singular}`);
  return {
    colecao: {
      get: {
        tags: [tag],
        summary: `Lista os ${tag.toLowerCase()}`,
        responses: { 200: json('Lista', { type: 'array', items: ref(saida) }) },
      },
      post: {
        tags: [tag],
        summary: `Cadastra um ${singular}`,
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
        summary: `Busca um ${singular} pelo id`,
        parameters: [id],
        responses: { 200: json(singular, ref(saida)), 404: erro(`${singular} nao encontrado`) },
      },
      put: {
        tags: [tag],
        summary: `Atualiza um ${singular}`,
        parameters: [id],
        requestBody: corpo(ref(entrada)),
        responses: {
          200: json(`${singular} atualizado`, ref(saida)),
          400: erro('Dados invalidos'),
          404: erro(`${singular} nao encontrado`),
        },
      },
      delete: {
        tags: [tag],
        summary: `Remove um ${singular}`,
        parameters: [id],
        responses: { 204: { description: 'Removido' }, 404: erro(`${singular} nao encontrado`) },
      },
    },
  };
}

function criarDocumentoOpenApi(versao) {
  const leiloeiros = crud({
    tag: 'Leiloeiros',
    singular: 'leiloeiro',
    entrada: 'LeiloeiroEntrada',
    saida: 'Leiloeiro',
  });
  const licitantes = crud({
    tag: 'Licitantes',
    singular: 'licitante',
    entrada: 'LicitanteEntrada',
    saida: 'Licitante',
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
        '(Authorization: Bearer). Swagger disponivel apenas no DEV.',
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
          responses: { 200: json('Credito', ref('Credito')), 404: erro('Licitante nao encontrado') },
        },
      },
      '/licitantes/{id}/reservas': {
        get: {
          tags: ['Credito'],
          summary: 'Lista as reservas de credito do licitante',
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
    },
  };
}

module.exports = criarDocumentoOpenApi;
