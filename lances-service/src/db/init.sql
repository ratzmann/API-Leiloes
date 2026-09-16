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
