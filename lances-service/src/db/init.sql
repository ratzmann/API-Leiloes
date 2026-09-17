CREATE TABLE IF NOT EXISTS lances (
    id           SERIAL PRIMARY KEY,
    leilao_id    INTEGER        NOT NULL,
    licitante_id INTEGER        NOT NULL,
    valor        NUMERIC(12, 2) NOT NULL,
    criado_em    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lances_leilao_id ON lances(leilao_id);
CREATE INDEX IF NOT EXISTS idx_lances_licitante_id ON lances(licitante_id);
CREATE INDEX IF NOT EXISTS idx_lances_leilao_valor ON lances(leilao_id, valor DESC);

-- Saga de registro de lance: cada lance guarda a saga que o criou e a reserva
-- de credito que o garante (liberada quando o lance e superado).
ALTER TABLE lances ADD COLUMN IF NOT EXISTS saga_id    INTEGER;
ALTER TABLE lances ADD COLUMN IF NOT EXISTS reserva_id INTEGER;

-- Registro de cada execucao da Saga, passo a passo, para auditoria e reprocessamento.
CREATE TABLE IF NOT EXISTS sagas_lance (
    id                    SERIAL PRIMARY KEY,
    leilao_id             INTEGER        NOT NULL,
    licitante_id          INTEGER        NOT NULL,
    valor                 NUMERIC(12, 2) NOT NULL,
    status                VARCHAR(30)    NOT NULL DEFAULT 'INICIADA',
    passos                JSONB          NOT NULL DEFAULT '[]',
    lance_id              INTEGER,
    reserva_id            INTEGER,
    licitante_superado_id INTEGER,
    reserva_superada_id   INTEGER,
    erro                  TEXT,
    criado_em             TIMESTAMP DEFAULT NOW(),
    atualizado_em         TIMESTAMP DEFAULT NOW(),

    CONSTRAINT chk_sagas_lance_status CHECK (status IN (
        'INICIADA', 'CONCLUIDA', 'CONCLUIDA_COM_PENDENCIA',
        'FALHOU', 'COMPENSADA', 'FALHOU_COMPENSACAO'
    ))
);

CREATE INDEX IF NOT EXISTS idx_sagas_lance_status ON sagas_lance(status);
