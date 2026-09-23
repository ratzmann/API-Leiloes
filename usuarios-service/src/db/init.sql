-- =============================================================================
-- init.sql  -  ESTRUTURA do banco do usuarios-service (usuarios-db)
-- -----------------------------------------------------------------------------
-- Executado pelo Postgres na primeira subida do container E tambem pelo
-- db/migrar.js toda vez que o servico inicia. Por isso TODO comando usa
-- "IF NOT EXISTS": rodar de novo nao da erro nem apaga dados.
--
-- Tabelas:
--   leiloeiros       -> quem conduz os leiloes
--   licitantes       -> quem da lances (tem um limite de credito)
--   reservas_credito -> "bloqueios" de credito feitos pela Saga de lance
-- =============================================================================

CREATE TABLE IF NOT EXISTS leiloeiros (
    -- SERIAL PRIMARY KEY: id numerico gerado automaticamente e unico.
    id                    SERIAL PRIMARY KEY,
    usuario_id            INTEGER,             -- referencia ao id em auth-service
    nome                  VARCHAR(150) NOT NULL,
    -- UNIQUE: o banco impede e-mail repetido (segunda barreira, alem do service).
    email                 VARCHAR(150) UNIQUE NOT NULL,
    -- Registro na junta comercial (ex.: JUCESC-000123), tambem unico.
    registro_profissional VARCHAR(30)  UNIQUE NOT NULL,
    telefone              VARCHAR(20),
    criado_em             TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS licitantes (
    id             SERIAL PRIMARY KEY,
    usuario_id     INTEGER,                    -- referencia ao id em auth-service
    nome           VARCHAR(150) NOT NULL,
    email          VARCHAR(150) UNIQUE NOT NULL,
    -- CPF guardado so com os 11 digitos (sem pontos e traco).
    cpf            VARCHAR(11)  UNIQUE NOT NULL,
    telefone       VARCHAR(20),
    -- NUMERIC(12,2): numero decimal EXATO com 2 casas (ideal para dinheiro;
    -- tipos de ponto flutuante podem gerar erros de arredondamento).
    limite_credito NUMERIC(12,2) NOT NULL DEFAULT 0,
    criado_em      TIMESTAMP DEFAULT NOW()
);

-- Indices para acelerar as buscas feitas no cadastro (checagem de duplicidade).
CREATE INDEX IF NOT EXISTS idx_leiloeiros_email ON leiloeiros(email);
CREATE INDEX IF NOT EXISTS idx_licitantes_email ON licitantes(email);
CREATE INDEX IF NOT EXISTS idx_licitantes_cpf ON licitantes(cpf);

-- reservas de credito da saga de lance
-- disponivel = limite_credito - soma das reservas RESERVADA
-- Exemplo: limite 5000, reservas ativas de 1000 e 1500 -> disponivel = 2500.
CREATE TABLE IF NOT EXISTS reservas_credito (
    id           SERIAL PRIMARY KEY,
    -- REFERENCES = chave estrangeira: toda reserva pertence a um licitante que
    -- existe. ON DELETE CASCADE: se o licitante for apagado, as reservas vao junto.
    licitante_id INTEGER       NOT NULL REFERENCES licitantes(id) ON DELETE CASCADE,
    valor        NUMERIC(12,2) NOT NULL,
    -- UNIQUE na referencia garante a IDEMPOTENCIA: a mesma saga nunca cria
    -- duas reservas, mesmo que a chamada seja repetida.
    referencia   VARCHAR(80)   UNIQUE,        -- id da saga
    -- RESERVADA = credito bloqueado; LIBERADA = credito devolvido.
    status       VARCHAR(20)   NOT NULL DEFAULT 'RESERVADA',
    criado_em    TIMESTAMP     DEFAULT NOW(),
    liberado_em  TIMESTAMP,

    -- CONSTRAINT ... CHECK: regras conferidas pelo proprio banco.
    CONSTRAINT chk_reservas_valor  CHECK (valor > 0),
    CONSTRAINT chk_reservas_status CHECK (status IN ('RESERVADA', 'LIBERADA'))
);

-- Indice composto: acelera "somar as reservas RESERVADA do licitante X".
CREATE INDEX IF NOT EXISTS idx_reservas_licitante_status ON reservas_credito(licitante_id, status);

-- Leilao ao qual a reserva pertence (enviado pela Saga de lance). Permite
-- liberar de uma vez todo o credito preso num leilao CANCELADO.
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS: bancos que ja existiam ganham a
-- coluna quando o servico sobe (db/migrar.js). Reservas antigas ficam com NULL.
ALTER TABLE reservas_credito ADD COLUMN IF NOT EXISTS leilao_id INTEGER;

-- Acelera "liberar as reservas RESERVADA do leilao X".
CREATE INDEX IF NOT EXISTS idx_reservas_leilao_status ON reservas_credito(leilao_id, status);
