// =============================================================================
// docs/openapi.js  -  ESPECIFICACAO OpenAPI 3 do leiloes-service (Swagger)
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

// Respostas da autorizacao (revisao do T1): sem token -> 401; papel errado ou
// leilao de outra pessoa -> 403. Id que nao e inteiro positivo -> 400.
const semLogin = erro('Sem login: falta o token de LEILOEIRO (Authorization: Bearer)');
const soODono = erro('Sem permissao: so o leiloeiro dono do leilao pode alterar');
const idInvalido = erro('Id invalido (nao e um inteiro positivo)');

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

/**
 * Monta um atalho PATCH /leiloes/{id}/abrir|encerrar|cancelar (Regras 5 e 7).
 * Recebe o resumo e `extras`, respostas a mais de um atalho so (ex.: o 503
 * do cancelar). Devolve a operacao pronta para o documento.
 */
function atalhoDeStatus(resumo, extras = {}) {
  return {
    patch: {
      tags: ['Ciclo de vida'],
      summary: resumo,
      parameters: [parametroId],
      responses: {
        200: leilaoJson('Leilao com o novo status'),
        400: idInvalido,
        401: semLogin,
        403: soODono,
        404: erro('Leilao nao encontrado'),
        409: erro('Transicao de status nao permitida'),
        ...extras,
      },
    },
  };
}

/**
 * Monta e devolve o documento OpenAPI (rotas, corpos e respostas de cada uma).
 * Recebe `versao` (a versao da imagem, mostrada no topo do Swagger).
 */
function criarDocumentoOpenApi(versao) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'leiloes-service',
      version: versao,
      description:
        'Cadastro de leilao (evento) do sistema de Leilao de Bois. Pelo Kong, as rotas ' +
        '/leiloes exigem um JWT (Authorization: Bearer). No servico, as consultas (GET) sao ' +
        'livres; cadastrar exige um token de LEILOEIRO (o leilao fica em nome dele) e editar, ' +
        'mudar o status ou remover so o leiloeiro dono. Sem token: 401; sem permissao: 403. ' +
        'Rodando sozinho (sem USUARIOS_SERVICE_URL) o leiloeiro nao e validado e o cancelamento ' +
        'nao libera reservas. Swagger disponivel apenas no DEV.',
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
            'titulo',
            'quantidadeBois',
            'lanceInicial',
            'incrementoMinimo',
            'dataInicio',
            'dataFim',
          ],
          properties: {
            leiloeiroId: {
              type: 'integer',
              example: 1,
              description: 'Opcional: o leilao fica em nome do leiloeiro do token; se enviado, tem que ser o proprio',
            },
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
        LeilaoEdicao: {
          type: 'object',
          description: 'Edicao parcial: so os campos enviados mudam',
          properties: {
            titulo: { type: 'string', minLength: 3, example: 'Leilao de Nelore - Lote 12 (revisado)' },
            descricao: { type: 'string' },
            localEvento: { type: 'string' },
            raca: { type: 'string' },
            quantidadeBois: { type: 'integer', minimum: 1, example: 45 },
            lanceInicial: { type: 'number' },
            incrementoMinimo: { type: 'number' },
            dataInicio: { type: 'string', format: 'date-time' },
            dataFim: { type: 'string', format: 'date-time' },
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
            400: erro('leiloeiroId invalido'),
          },
        },
        post: {
          tags: ['Leiloes'],
          summary: 'Cadastra um leilao em nome do leiloeiro logado (Regras 1 a 4 e 7)',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LeilaoEntrada' } },
            },
          },
          responses: {
            201: leilaoJson('Leilao cadastrado com status AGENDADO'),
            400: erro('Dados invalidos ou data de inicio no passado'),
            401: semLogin,
            403: erro('Sem permissao: so LEILOEIRO cadastra, e so em nome proprio'),
            404: erro('Leiloeiro nao encontrado no usuarios-service (so com USUARIOS_SERVICE_URL)'),
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
          responses: {
            200: leilaoJson('Leilao'),
            400: idInvalido,
            404: erro('Leilao nao encontrado'),
          },
        },
        put: {
          tags: ['Leiloes'],
          summary: 'Edita um leilao ainda AGENDADO (Regras 6 e 7)',
          parameters: [parametroId],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LeilaoEdicao' } },
            },
          },
          responses: {
            200: leilaoJson('Leilao atualizado'),
            400: erro('Dados ou id invalidos'),
            401: semLogin,
            403: soODono,
            404: erro('Leilao nao encontrado'),
            409: erro('Leilao nao esta mais AGENDADO ou conflita com a agenda'),
          },
        },
        delete: {
          tags: ['Leiloes'],
          summary: 'Remove um leilao ainda AGENDADO (Regras 6 e 7)',
          parameters: [parametroId],
          responses: {
            204: { description: 'Removido' },
            400: idInvalido,
            401: semLogin,
            403: soODono,
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
            400: idInvalido,
            404: erro('Leilao nao encontrado'),
          },
        },
      },
      '/leiloes/{id}/status': {
        patch: {
          tags: ['Ciclo de vida'],
          summary: 'Muda o status (Regras 5, 7 e 8)',
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
            400: erro('Status ou id invalidos'),
            401: semLogin,
            403: soODono,
            404: erro('Leilao nao encontrado'),
            409: erro('Transicao de status nao permitida'),
            503: erro('Leilao cancelado, mas o credito nao pode ser liberado agora: repita'),
          },
        },
      },
      '/leiloes/{id}/abrir': atalhoDeStatus('AGENDADO -> ABERTO'),
      '/leiloes/{id}/encerrar': atalhoDeStatus('ABERTO -> ENCERRADO'),
      '/leiloes/{id}/cancelar': atalhoDeStatus(
        'AGENDADO ou ABERTO -> CANCELADO (devolve o credito reservado, Regra 8)',
        { 503: erro('Leilao cancelado, mas o credito nao pode ser liberado agora: repita') }
      ),
    },
  };
}

module.exports = criarDocumentoOpenApi;
