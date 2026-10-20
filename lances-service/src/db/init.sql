-- =============================================================================
-- init.sql  -  ESTRUTURA do banco do lances-service (lances-db)
-- -----------------------------------------------------------------------------
-- Executado pelo Postgres na primeira subida E pelo db/migrar.js a cada inicio
-- do servico. Por isso tudo usa IF NOT EXISTS (pode rodar varias vezes).
--
-- Tabelas:
--   lances      -> cada lance dado
--   sagas_lance -> o "diario de bordo" de cada execucao da Saga
-- =============================================================================

CREATE TABLE IF NOT EXISTS lances (
    id           SERIAL PRIMARY KEY,
    -- Sem FOREIGN KEY: leilao e licitante moram em OUTROS bancos
    -- (leiloes-db e usuarios-db). A existencia deles e conferida pela Saga.
    leilao_id    INTEGER        NOT NULL,
    licitante_id INTEGER        NOT NULL,
    valor        NUMERIC(12, 2) NOT NULL,
    criado_em    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lances_leilao_id ON lances(leilao_id);
CREATE INDEX IF NOT EXISTS idx_lances_licitante_id ON lances(licitante_id);
-- Indice pensado na consulta "maior lance do leilao X" (valor DESC = do maior
-- para o menor), a mais usada pelo servico.
CREATE INDEX IF NOT EXISTS idx_lances_leilao_valor ON lances(leilao_id, valor DESC);

-- saga e reserva de credito ligadas ao lance
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS: acrescenta colunas numa tabela que
-- ja existia (bancos criados antes da Saga ganham as colunas novas ao subir).
ALTER TABLE lances ADD COLUMN IF NOT EXISTS saga_id    INTEGER;
ALTER TABLE lances ADD COLUMN IF NOT EXISTS reserva_id INTEGER;

-- historico de cada saga, passo a passo
CREATE TABLE IF NOT EXISTS sagas_lance (
    id                    SERIAL PRIMARY KEY,
    leilao_id             INTEGER        NOT NULL,
    licitante_id          INTEGER        NOT NULL,
    valor                 NUMERIC(12, 2) NOT NULL,
    status                VARCHAR(30)    NOT NULL DEFAULT 'INICIADA',
    -- JSONB: coluna que guarda JSON (aqui, a lista de passos executados com
    -- resultado e horario). Otimo para dados de formato flexivel.
    passos                JSONB          NOT NULL DEFAULT '[]',
    lance_id              INTEGER,
    reserva_id            INTEGER,
    -- Quem tinha o maior lance antes (e a reserva dele), para o passo 4.
    licitante_superado_id INTEGER,
    reserva_superada_id   INTEGER,
    erro                  TEXT,
    criado_em             TIMESTAMP DEFAULT NOW(),
    atualizado_em         TIMESTAMP DEFAULT NOW(),

    -- Status possiveis de uma saga (explicados em sagas/registrarLanceSaga.js).
    CONSTRAINT chk_sagas_lance_status CHECK (status IN (
        'INICIADA', 'CONCLUIDA', 'CONCLUIDA_COM_PENDENCIA',
        'FALHOU', 'COMPENSADA', 'FALHOU_COMPENSACAO'
    ))
);

CREATE INDEX IF NOT EXISTS idx_sagas_lance_status ON sagas_lance(status);
