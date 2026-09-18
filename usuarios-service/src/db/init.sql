CREATE TABLE IF NOT EXISTS leiloeiros (
    id                    SERIAL PRIMARY KEY,
    usuario_id            INTEGER,             -- referencia ao id em auth-service
    nome                  VARCHAR(150) NOT NULL,
    email                 VARCHAR(150) UNIQUE NOT NULL,
    registro_profissional VARCHAR(30)  UNIQUE NOT NULL,
    telefone              VARCHAR(20),
    criado_em             TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS licitantes (
    id             SERIAL PRIMARY KEY,
    usuario_id     INTEGER,                    -- referencia ao id em auth-service
    nome           VARCHAR(150) NOT NULL,
    email          VARCHAR(150) UNIQUE NOT NULL,
    cpf            VARCHAR(11)  UNIQUE NOT NULL,
    telefone       VARCHAR(20),
    limite_credito NUMERIC(12,2) NOT NULL DEFAULT 0,
    criado_em      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leiloeiros_email ON leiloeiros(email);
CREATE INDEX IF NOT EXISTS idx_licitantes_email ON licitantes(email);
CREATE INDEX IF NOT EXISTS idx_licitantes_cpf ON licitantes(cpf);

-- reservas de credito da saga de lance
-- disponivel = limite_credito - soma das reservas RESERVADA
CREATE TABLE IF NOT EXISTS reservas_credito (
    id           SERIAL PRIMARY KEY,
    licitante_id INTEGER       NOT NULL REFERENCES licitantes(id) ON DELETE CASCADE,
    valor        NUMERIC(12,2) NOT NULL,
    referencia   VARCHAR(80)   UNIQUE,        -- id da saga
    status       VARCHAR(20)   NOT NULL DEFAULT 'RESERVADA',
    criado_em    TIMESTAMP     DEFAULT NOW(),
    liberado_em  TIMESTAMP,

    CONSTRAINT chk_reservas_valor  CHECK (valor > 0),
    CONSTRAINT chk_reservas_status CHECK (status IN ('RESERVADA', 'LIBERADA'))
);

CREATE INDEX IF NOT EXISTS idx_reservas_licitante_status ON reservas_credito(licitante_id, status);
