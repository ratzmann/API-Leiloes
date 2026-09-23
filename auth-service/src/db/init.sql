-- =============================================================================
-- init.sql  -  ESTRUTURA do banco do auth-service (auth-db)
-- -----------------------------------------------------------------------------
-- O Postgres executa este arquivo automaticamente na PRIMEIRA vez que o
-- container do banco sobe (o docker-compose.yml o coloca na pasta
-- /docker-entrypoint-initdb.d/). Linhas que comecam com -- sao comentarios SQL.
--
-- Este banco guarda so as CREDENCIAIS (e-mail + senha criptografada + papel).
-- Os dados de dominio (CPF, credito, registro profissional) ficam no
-- usuarios-service, ligados pela coluna perfil_id.
-- =============================================================================

-- CREATE TABLE cria a tabela; IF NOT EXISTS evita erro se ela ja existir.
CREATE TABLE IF NOT EXISTS usuarios (
    -- SERIAL = numero inteiro que o banco incrementa sozinho (1, 2, 3...).
    -- PRIMARY KEY = identificador unico de cada linha.
    id            SERIAL PRIMARY KEY,
    -- VARCHAR(150) = texto de ate 150 caracteres; NOT NULL = obrigatorio.
    nome          VARCHAR(150)        NOT NULL,
    -- UNIQUE = o banco recusa dois usuarios com o mesmo e-mail.
    email         VARCHAR(150) UNIQUE NOT NULL,
    -- Guardamos o HASH da senha (resultado do bcrypt), nunca a senha em si.
    senha_hash    VARCHAR(255)        NOT NULL,
    -- CHECK = regra conferida pelo proprio banco: so aceita esses dois valores.
    papel         VARCHAR(20)         NOT NULL CHECK (papel IN ('LEILOEIRO', 'LICITANTE')),
    perfil_id     INTEGER,            -- id do registro correspondente no usuarios-service
    -- DEFAULT NOW() = se nao for informado, grava a data/hora do INSERT.
    criado_em     TIMESTAMP DEFAULT NOW()
);

-- INDICE: uma estrutura auxiliar que deixa a busca por e-mail rapida (usada em
-- todo login), como o indice remissivo no fim de um livro.
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
