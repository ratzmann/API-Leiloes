CREATE TABLE IF NOT EXISTS leiloes (
    id                SERIAL PRIMARY KEY,
    leiloeiro_id      INTEGER      NOT NULL,   -- referencia ao id em usuarios-service
    titulo            VARCHAR(150) NOT NULL,
    descricao         TEXT,
    local_evento      VARCHAR(150),
    raca              VARCHAR(60),
    quantidade_bois   INTEGER      NOT NULL,
    lance_inicial     NUMERIC(12,2) NOT NULL,
    incremento_minimo NUMERIC(12,2) NOT NULL DEFAULT 1,
    data_inicio       TIMESTAMP    NOT NULL,
    data_fim          TIMESTAMP    NOT NULL,
    status            VARCHAR(20)  NOT NULL DEFAULT 'AGENDADO',
    criado_em         TIMESTAMP    DEFAULT NOW(),
    atualizado_em     TIMESTAMP    DEFAULT NOW(),

    CONSTRAINT chk_leiloes_status
        CHECK (status IN ('AGENDADO', 'ABERTO', 'ENCERRADO', 'CANCELADO')),
    CONSTRAINT chk_leiloes_periodo      CHECK (data_fim > data_inicio),
    CONSTRAINT chk_leiloes_quantidade   CHECK (quantidade_bois >= 1),
    CONSTRAINT chk_leiloes_lance_inicial CHECK (lance_inicial > 0),
    CONSTRAINT chk_leiloes_incremento   CHECK (incremento_minimo > 0)
);

CREATE INDEX IF NOT EXISTS idx_leiloes_leiloeiro   ON leiloes(leiloeiro_id);
CREATE INDEX IF NOT EXISTS idx_leiloes_status      ON leiloes(status);
CREATE INDEX IF NOT EXISTS idx_leiloes_data_inicio ON leiloes(data_inicio);
