CREATE TABLE IF NOT EXISTS usuarios (
    id            SERIAL PRIMARY KEY,
    nome          VARCHAR(150)        NOT NULL,
    email         VARCHAR(150) UNIQUE NOT NULL,
    senha_hash    VARCHAR(255)        NOT NULL,
    papel         VARCHAR(20)         NOT NULL CHECK (papel IN ('LEILOEIRO', 'LICITANTE')),
    perfil_id     INTEGER,            -- id do registro correspondente no usuarios-service
    criado_em     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
