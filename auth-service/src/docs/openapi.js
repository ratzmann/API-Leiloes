// =============================================================================
// docs/openapi.js  -  ESPECIFICACAO OpenAPI 3 do auth-service (Swagger)
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

const json = (descricao, nome) => ({
  description: descricao,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${nome}` } } },
});

/**
 * Monta e devolve o documento OpenAPI (rotas, corpos e respostas de cada uma).
 * Recebe `versao` (a versao da imagem, mostrada no topo do Swagger).
 */
function criarDocumentoOpenApi(versao) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'auth-service',
      version: versao,
      description:
        'Autenticacao do sistema de Leilao de Bois: registro de credenciais e login com ' +
        'emissao de JWT (HS256). Ao registrar, cria o perfil (leiloeiro ou licitante) no ' +
        'usuarios-service. Rotas publicas (sem JWT). Swagger disponivel apenas no DEV.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Autenticacao', description: 'Registro e login' },
      { name: 'Operacao', description: 'Health check e metricas' },
    ],
    components: {
      schemas: {
        Erro: {
          type: 'object',
          properties: { erro: { type: 'string', example: 'Credenciais invalidas.' } },
        },
        RegistroEntrada: {
          type: 'object',
          required: ['nome', 'email', 'senha', 'papel'],
          properties: {
            nome: { type: 'string', minLength: 3, example: 'Maria Compradora' },
            email: { type: 'string', format: 'email', example: 'maria@fazenda.com' },
            senha: { type: 'string', minLength: 6, example: 'segredo123' },
            papel: { type: 'string', enum: ['LEILOEIRO', 'LICITANTE'] },
            dadosPerfil: {
              type: 'object',
              description:
                'Campos extras do perfil no usuarios-service: registroProfissional e ' +
                'telefone (LEILOEIRO) ou cpf, telefone e limiteCredito (LICITANTE)',
              example: { cpf: '52998224725', limiteCredito: 50000 },
            },
          },
        },
        LoginEntrada: {
          type: 'object',
          required: ['email', 'senha'],
          properties: {
            email: { type: 'string', format: 'email', example: 'maria@fazenda.com' },
            senha: { type: 'string', example: 'segredo123' },
          },
        },
        Usuario: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            nome: { type: 'string' },
            email: { type: 'string' },
            papel: { type: 'string', enum: ['LEILOEIRO', 'LICITANTE'] },
            perfil_id: { type: 'integer', nullable: true, description: 'Id no usuarios-service' },
            criado_em: { type: 'string', format: 'date-time' },
          },
        },
        Registro: {
          type: 'object',
          properties: {
            usuario: { $ref: '#/components/schemas/Usuario' },
            perfil: {
              type: 'object',
              nullable: true,
              description: 'Perfil criado no usuarios-service (null se ele estiver fora do ar)',
            },
            token: { type: 'string', description: 'JWT para o header Authorization: Bearer' },
          },
        },
        Login: {
          type: 'object',
          properties: {
            usuario: { $ref: '#/components/schemas/Usuario' },
            token: { type: 'string', description: 'JWT para o header Authorization: Bearer' },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['Operacao'],
          summary: 'Health check (versao e ambiente no ar)',
          responses: { 200: { description: 'Servico no ar' } },
        },
      },
      '/metrics': {
        get: {
          tags: ['Operacao'],
          summary: 'Metricas no formato do Prometheus',
          responses: { 200: { description: 'Texto no formato de exposicao do Prometheus' } },
        },
      },
      '/registrar': {
        post: {
          tags: ['Autenticacao'],
          summary: 'Registra credenciais e cria o perfil no usuarios-service',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RegistroEntrada' } },
            },
          },
          responses: {
            201: json('Usuario registrado, com token', 'Registro'),
            400: erro('Dados invalidos'),
            409: erro('E-mail ja cadastrado'),
          },
        },
      },
      '/login': {
        post: {
          tags: ['Autenticacao'],
          summary: 'Confere e-mail e senha e emite o JWT',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginEntrada' } },
            },
          },
          responses: {
            200: json('Login aceito, com token', 'Login'),
            400: erro('E-mail ou senha ausentes'),
            401: erro('Credenciais invalidas'),
          },
        },
      },
    },
  };
}

module.exports = criarDocumentoOpenApi;
