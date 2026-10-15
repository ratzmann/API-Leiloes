// =============================================================================
// docs/openapi.js  -  ESPECIFICACAO OpenAPI 3 do lances-service (Swagger)
// -----------------------------------------------------------------------------
// T2. Mostrada pelo Swagger UI em /docs, so nos ambientes com Swagger ligado
// (local e dev; ver config/ambiente.js). Escrita a mao (objeto JS) pra nao
// precisar de biblioteca de YAML nem de anotacoes no codigo.
//
// Quem chama: app.js (criarDocumentoOpenApi(versao)).
// =============================================================================

const erro = (descricao) => ({
  description: descricao,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
});

// Erros da Saga trazem tambem o sagaId (para consultar GET /lances/sagas/{id}).
const erroDaSaga = (descricao) => ({
  description: descricao,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErroDaSaga' } } },
});

const json = (descricao, schema) => ({
  description: descricao,
  content: { 'application/json': { schema } },
});

const ref = (nome) => ({ $ref: `#/components/schemas/${nome}` });

const parametroId = (nome, descricao) => ({
  name: nome,
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
  description: descricao,
});

const idInvalido = erro('Id invalido (nao e um inteiro positivo)');

/**
 * Monta e devolve o documento OpenAPI.
 * Recebe `versao` (a versao da imagem, mostrada no topo do Swagger).
 */
function criarDocumentoOpenApi(versao) {
  const idLance = parametroId('id', 'Id do lance');
  const idLeilao = parametroId('leilaoId', 'Id do leilao');
  const idSaga = parametroId('id', 'Id da saga');

  return {
    openapi: '3.0.3',
    info: {
      title: 'lances-service',
      version: versao,
      description:
        'Lances do sistema de Leilao de Bois. Registrar um lance dispara a Saga orquestrada: ' +
        '1) consulta o leilao no leiloes-service; 2) reserva o credito no usuarios-service; ' +
        '3) grava o lance; 4) libera o credito de quem foi superado. Se algo falha depois da ' +
        'reserva, ela e devolvida (compensacao). Pelo Kong, as rotas /lances exigem um JWT. ' +
        'No servico, as consultas sao livres e dar lance exige um token de LICITANTE, sempre ' +
        'em nome proprio (sem token: 401; papel errado ou em nome de outra pessoa: 403). ' +
        'Precisa do leiloes-service e do usuarios-service (LEILOES_SERVICE_URL e ' +
        'USUARIOS_SERVICE_URL). Swagger disponivel apenas no DEV.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Lances', description: 'Registro e consulta de lances' },
      { name: 'Sagas', description: 'Andamento da Saga de cada lance' },
      { name: 'Operacao', description: 'Health check e metricas' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Erro: {
          type: 'object',
          properties: { erro: { type: 'string', example: 'Lance nao encontrado.' } },
        },
        ErroDaSaga: {
          type: 'object',
          properties: {
            erro: { type: 'string', example: 'Credito insuficiente: disponivel R$ 3000.00, lance de R$ 3500.00.' },
            sagaId: { type: 'integer', example: 12 },
          },
        },
        LanceEntrada: {
          type: 'object',
          required: ['leilaoId', 'valor'],
          properties: {
            leilaoId: { type: 'integer', example: 1 },
            valor: { type: 'number', example: 1000 },
            licitanteId: {
              type: 'integer',
              example: 1,
              description: 'Opcional: o lance e do licitante do token; se enviado, tem que ser o proprio',
            },
          },
        },
        Lance: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            leilao_id: { type: 'integer', example: 1 },
            licitante_id: { type: 'integer', example: 1 },
            valor: { type: 'string', example: '1000.00' },
            saga_id: { type: 'integer', example: 4 },
            reserva_id: { type: 'integer', example: 1 },
            criado_em: { type: 'string', format: 'date-time' },
          },
        },
        LanceRegistrado: {
          allOf: [
            ref('Lance'),
            {
              type: 'object',
              properties: {
                sagaId: { type: 'integer', example: 4 },
                sagaStatus: { type: 'string', enum: ['CONCLUIDA', 'CONCLUIDA_COM_PENDENCIA'] },
              },
            },
          ],
        },
        Saga: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 4 },
            leilao_id: { type: 'integer' },
            licitante_id: { type: 'integer' },
            valor: { type: 'string', example: '1000.00' },
            status: {
              type: 'string',
              enum: ['INICIADA', 'CONCLUIDA', 'CONCLUIDA_COM_PENDENCIA', 'FALHOU', 'COMPENSADA', 'FALHOU_COMPENSACAO'],
            },
            passos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  em: { type: 'string', format: 'date-time' },
                  passo: { type: 'string', example: 'reservar-credito' },
                  resultado: { type: 'string', example: 'OK' },
                  detalhe: { type: 'string' },
                },
              },
            },
            lance_id: { type: 'integer', nullable: true },
            reserva_id: { type: 'integer', nullable: true },
            licitante_superado_id: { type: 'integer', nullable: true },
            reserva_superada_id: { type: 'integer', nullable: true },
            erro: { type: 'string', nullable: true },
            criado_em: { type: 'string', format: 'date-time' },
            atualizado_em: { type: 'string', format: 'date-time' },
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
      '/lances': {
        get: {
          tags: ['Lances'],
          summary: 'Lista todos os lances',
          responses: { 200: json('Lista de lances', { type: 'array', items: ref('Lance') }) },
        },
        post: {
          tags: ['Lances'],
          summary: 'Da um lance em nome do licitante logado (dispara a Saga; Regras 1 a 7)',
          parameters: [
            {
              name: 'X-Simular-Falha',
              in: 'header',
              required: false,
              schema: { type: 'string', enum: ['reservar-credito', 'gravar-lance', 'liberar-credito-superado'] },
              description: 'So para demonstracao (SAGA_PERMITIR_FALHA_SIMULADA=true): forca a falha de um passo',
            },
          ],
          requestBody: { required: true, content: { 'application/json': { schema: ref('LanceEntrada') } } },
          responses: {
            201: json('Lance gravado; sagaStatus CONCLUIDA ou CONCLUIDA_COM_PENDENCIA (passo 4 a reprocessar)', ref('LanceRegistrado')),
            400: erroDaSaga('Dados invalidos, abaixo do minimo ou cobrindo o proprio lance'),
            401: erro('Sem login: falta o token de LICITANTE (Authorization: Bearer)'),
            403: erro('Sem permissao: so LICITANTE da lance, e so em nome proprio'),
            404: erroDaSaga('Leilao nao encontrado no leiloes-service'),
            409: erroDaSaga('Leilao nao aceita lances agora ou credito insuficiente'),
            500: erroDaSaga('Falha (simulada ou interna) depois da reserva: a Saga devolveu o credito'),
            503: erroDaSaga('leiloes-service ou usuarios-service indisponivel'),
          },
        },
      },
      '/lances/{id}': {
        get: {
          tags: ['Lances'],
          summary: 'Busca um lance pelo id',
          parameters: [idLance],
          responses: { 200: json('Lance', ref('Lance')), 400: idInvalido, 404: erro('Lance nao encontrado') },
        },
      },
      '/lances/leilao/{leilaoId}': {
        get: {
          tags: ['Lances'],
          summary: 'Historico de lances de um leilao (lista vazia se nao houver)',
          parameters: [idLeilao],
          responses: { 200: json('Lances do leilao', { type: 'array', items: ref('Lance') }), 400: idInvalido },
        },
      },
      '/lances/leilao/{leilaoId}/maior': {
        get: {
          tags: ['Lances'],
          summary: 'Maior lance de um leilao',
          parameters: [idLeilao],
          responses: {
            200: json('Maior lance', ref('Lance')),
            400: idInvalido,
            404: erro('O leilao ainda nao recebeu lances'),
          },
        },
      },
      '/lances/sagas': {
        get: {
          tags: ['Sagas'],
          summary: 'Lista as sagas (andamento de cada lance)',
          responses: { 200: json('Sagas', { type: 'array', items: ref('Saga') }) },
        },
      },
      '/lances/sagas/{id}': {
        get: {
          tags: ['Sagas'],
          summary: 'Detalha uma saga, passo a passo',
          parameters: [idSaga],
          responses: { 200: json('Saga', ref('Saga')), 400: idInvalido, 404: erro('Saga nao encontrada') },
        },
      },
      '/lances/sagas/{id}/reprocessar': {
        post: {
          tags: ['Sagas'],
          summary: 'Reprocessa o passo 4 de uma saga CONCLUIDA_COM_PENDENCIA (idempotente)',
          parameters: [idSaga],
          responses: {
            200: json('Saga atualizada (CONCLUIDA)', ref('Saga')),
            400: idInvalido,
            404: erro('Saga nao encontrada'),
            409: erro('A saga nao tem pendencia para reprocessar'),
            503: erroDaSaga('usuarios-service ainda indisponivel: a pendencia continua'),
          },
        },
      },
    },
  };
}

module.exports = criarDocumentoOpenApi;
