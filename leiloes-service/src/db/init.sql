-- =============================================================================
-- init.sql  -  ESTRUTURA do banco do leiloes-service (leiloes-db)
-- -----------------------------------------------------------------------------
-- Executado pelo Postgres na primeira subida do container do banco.
-- Uma tabela so: leiloes (o evento/pregao).
-- =============================================================================

CREATE TABLE IF NOT EXISTS leiloes (
    id                SERIAL PRIMARY KEY,
    -- Nao ha FOREIGN KEY aqui: o leiloeiro mora em OUTRO banco (usuarios-db).
    -- A existencia dele e conferida via HTTP antes de gravar (Regra 3).
    leiloeiro_id      INTEGER      NOT NULL,   -- referencia ao id em usuarios-service
    titulo            VARCHAR(150) NOT NULL,
    -- TEXT = texto sem limite de tamanho.
    descricao         TEXT,
    local_evento      VARCHAR(150),
    raca              VARCHAR(60),
    quantidade_bois   INTEGER      NOT NULL,
    -- NUMERIC(12,2): decimal exato, ate 12 digitos com 2 casas (dinheiro).
    lance_inicial     NUMERIC(12,2) NOT NULL,
    -- Passo minimo entre um lance e o proximo.
    incremento_minimo NUMERIC(12,2) NOT NULL DEFAULT 1,
    data_inicio       TIMESTAMP    NOT NULL,
    data_fim          TIMESTAMP    NOT NULL,
    -- Todo leilao nasce AGENDADO.
    status            VARCHAR(20)  NOT NULL DEFAULT 'AGENDADO',
    criado_em         TIMESTAMP    DEFAULT NOW(),
    atualizado_em     TIMESTAMP    DEFAULT NOW(),

    -- CONSTRAINTS: regras garantidas pelo PROPRIO banco. Mesmo que um bug no
    -- codigo deixasse passar um dado errado, o banco recusaria o INSERT/UPDATE.
    -- (E uma "segunda linha de defesa", alem das validacoes do service.)
    CONSTRAINT chk_leiloes_status
        CHECK (status IN ('AGENDADO', 'ABERTO', 'ENCERRADO', 'CANCELADO')),
    CONSTRAINT chk_leiloes_periodo      CHECK (data_fim > data_inicio),
    CONSTRAINT chk_leiloes_quantidade   CHECK (quantidade_bois >= 1),
    CONSTRAINT chk_leiloes_lance_inicial CHECK (lance_inicial > 0),
    CONSTRAINT chk_leiloes_incremento   CHECK (incremento_minimo > 0)
);

-- Indices para os filtros mais usados: por leiloeiro, por status e por data.
CREATE INDEX IF NOT EXISTS idx_leiloes_leiloeiro   ON leiloes(leiloeiro_id);
CREATE INDEX IF NOT EXISTS idx_leiloes_status      ON leiloes(status);
CREATE INDEX IF NOT EXISTS idx_leiloes_data_inicio ON leiloes(data_inicio);
