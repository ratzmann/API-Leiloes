// Especificacao OpenAPI 3 do leiloes-service, mostrada pelo Swagger UI em /docs.
// Escrita a mao (objeto JS) pra nao precisar de biblioteca de YAML nem de anotacoes.
// So e publicada nos ambientes com Swagger ligado (ver config/ambiente.js).

const erro = (descricao) => ({
  description: descricao,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
});

const leilaoJson = (descricao) => ({
  description: descricao,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Leilao' } } },
});

const parametroId = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
  description: 'Id do leilao',
};

// atalhos PATCH /leiloes/{id}/abrir|encerrar|cancelar (Regra 5)
function atalhoDeStatus(resumo) {
  return {
    patch: {
      tags: ['Ciclo de vida'],
      summary: resumo,
      parameters: [parametroId],
      responses: {
        200: leilaoJson('Leilao com o novo status'),
        404: erro('Leilao nao encontrado'),
        409: erro('Transicao de status nao permitida'),
      },
    },
  };
}

function criarDocumentoOpenApi(versao) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'leiloes-service',
      version: versao,
      description:
        'Cadastro de leilao (evento) do sistema de Leilao de Bois. Pelo Kong, as rotas ' +
        '/leiloes exigem um JWT (Authorization: Bearer). Swagger disponivel apenas no DEV.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Leiloes', description: 'Cadastro e consulta' },
      { name: 'Ciclo de vida', description: 'AGENDADO -> ABERTO -> ENCERRADO, ou CANCELADO' },
      { name: 'Operacao', description: 'Health check e metricas' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Erro: {
          type: 'object',
          properties: { erro: { type: 'string', example: 'Leilao nao encontrado.' } },
        },
        LeilaoEntrada: {
          type: 'object',
          required: [
            'leiloeiroId',
            'titulo',
            'quantidadeBois',
            'lanceInicial',
            'incrementoMinimo',
            'dataInicio',
            'dataFim',
          ],
          properties: {
            leiloeiroId: { type: 'integer', example: 1 },
            titulo: { type: 'string', minLength: 3, example: 'Leilao de Nelore - Lote 12' },
            descricao: { type: 'string', example: 'Lote de garrotes' },
            localEvento: { type: 'string', example: 'Parque de Exposicoes de Lages' },
            raca: { type: 'string', example: 'Nelore' },
            quantidadeBois: { type: 'integer', minimum: 1, example: 40 },
            lanceInicial: { type: 'number', example: 5000 },
            incrementoMinimo: { type: 'number', example: 100 },
            dataInicio: { type: 'string', format: 'date-time', example: '2026-12-01T14:00:00Z' },
            dataFim: { type: 'string', format: 'date-time', example: '2026-12-01T18:00:00Z' },
          },
        },
        Leilao: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            leiloeiro_id: { type: 'integer', example: 1 },
            titulo: { type: 'string' },
            descricao: { type: 'string', nullable: true },
            local_evento: { type: 'string', nullable: true },
            raca: { type: 'string', nullable: true },
            quantidade_bois: { type: 'integer' },
            lance_inicial: { type: 'string', example: '5000.00' },
            incremento_minimo: { type: 'string', example: '100.00' },
            data_inicio: { type: 'string', format: 'date-time' },
            data_fim: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['AGENDADO', 'ABERTO', 'ENCERRADO', 'CANCELADO'] },
            criado_em: { type: 'string', format: 'date-time' },
            atualizado_em: { type: 'string', format: 'date-time' },
          },
        },
        Disponibilidade: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            status: { type: 'string' },
            aceitandoLances: { type: 'boolean' },
            lanceInicial: { type: 'number' },
            incrementoMinimo: { type: 'number' },
            dataInicio: { type: 'string', format: 'date-time' },
            dataFim: { type: 'string', format: 'date-time' },
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
      '/leiloes': {
        get: {
          tags: ['Leiloes'],
          summary: 'Lista leiloes',
          parameters: [
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string', enum: ['AGENDADO', 'ABERTO', 'ENCERRADO', 'CANCELADO'] },
            },
            { name: 'leiloeiroId', in: 'query', schema: { type: 'integer' } },
          ],
          responses: {
            200: {
              description: 'Lista de leiloes',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Leilao' } },
                },
              },
            },
          },
        },
        post: {
          tags: ['Leiloes'],
          summary: 'Cadastra um leilao (Regras 1 a 4)',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LeilaoEntrada' } },
            },
          },
          responses: {
            201: leilaoJson('Leilao cadastrado com status AGENDADO'),
            400: erro('Dados invalidos ou data de inicio no passado'),
            404: erro('Leiloeiro nao encontrado no usuarios-service'),
            409: erro('Leiloeiro ja tem leilao no mesmo periodo'),
            503: erro('usuarios-service indisponivel'),
          },
        },
      },
      '/leiloes/{id}': {
        get: {
          tags: ['Leiloes'],
          summary: 'Detalha um leilao',
          parameters: [parametroId],
          responses: { 200: leilaoJson('Leilao'), 404: erro('Leilao nao encontrado') },
        },
        put: {
          tags: ['Leiloes'],
          summary: 'Edita um leilao ainda AGENDADO (Regra 6)',
          parameters: [parametroId],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LeilaoEntrada' } },
            },
          },
          responses: {
            200: leilaoJson('Leilao atualizado'),
            400: erro('Dados invalidos'),
            404: erro('Leilao nao encontrado'),
            409: erro('Leilao nao esta mais AGENDADO ou conflita com a agenda'),
          },
        },
        delete: {
          tags: ['Leiloes'],
          summary: 'Remove um leilao ainda AGENDADO (Regra 6)',
          parameters: [parametroId],
          responses: {
            204: { description: 'Removido' },
            404: erro('Leilao nao encontrado'),
            409: erro('Leilao nao esta mais AGENDADO'),
          },
        },
      },
      '/leiloes/{id}/disponibilidade': {
        get: {
          tags: ['Leiloes'],
          summary: 'Diz se o leilao aceita lances agora (usado pelo lances-service)',
          parameters: [parametroId],
          responses: {
            200: {
              description: 'Disponibilidade',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Disponibilidade' } },
              },
            },
            404: erro('Leilao nao encontrado'),
          },
        },
      },
      '/leiloes/{id}/status': {
        patch: {
          tags: ['Ciclo de vida'],
          summary: 'Muda o status (Regra 5)',
          parameters: [parametroId],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: ['AGENDADO', 'ABERTO', 'ENCERRADO', 'CANCELADO'] },
                  },
                },
              },
            },
          },
          responses: {
            200: leilaoJson('Leilao com o novo status'),
            400: erro('Status invalido'),
            404: erro('Leilao nao encontrado'),
            409: erro('Transicao de status nao permitida'),
          },
        },
      },
      '/leiloes/{id}/abrir': atalhoDeStatus('AGENDADO -> ABERTO'),
      '/leiloes/{id}/encerrar': atalhoDeStatus('ABERTO -> ENCERRADO'),
      '/leiloes/{id}/cancelar': atalhoDeStatus('AGENDADO ou ABERTO -> CANCELADO'),
    },
  };
}

module.exports = criarDocumentoOpenApi;
