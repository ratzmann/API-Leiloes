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
