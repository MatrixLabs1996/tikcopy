-- =====================================================================
-- 002 — Redesign Briefings / Pesquisas (Públicos)
-- =====================================================================
-- IMPORTANTE: esta migration DROPA dados existentes em briefings e researches.
-- Use somente em ambiente de testes ou após backup.
--
-- Novo modelo:
--   briefings        → template estruturado da OFERTA (vários por projeto)
--   research_docs    → biblioteca livre por NICHO + PÚBLICO (compartilhada
--                      entre todos projetos do mesmo nicho do usuário)
--   publicos         → fatias de público criadas pelo usuário, por nicho
-- =====================================================================

-- 1) Apaga schema antigo
DROP TABLE IF EXISTS briefings CASCADE;

-- 2) Renomeia researches → briefings (template estruturado da oferta)
ALTER TABLE researches RENAME TO briefings;

-- Renomeia índices antigos (se existirem) pra refletir o novo nome
-- (Supabase usa nomes auto, então só renomeamos os que sabemos)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'researches_pkey') THEN
        ALTER INDEX researches_pkey RENAME TO briefings_pkey;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_researches_user') THEN
        ALTER INDEX idx_researches_user RENAME TO idx_briefings_user;
    END IF;
END $$;

-- 3) Cria tabela `publicos` — fatias de público por nicho do usuário
CREATE TABLE publicos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nicho text NOT NULL,
    nome text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, nicho, nome)
);

CREATE INDEX idx_publicos_user_nicho ON publicos (user_id, nicho);

-- RLS
ALTER TABLE publicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own publicos"
    ON publicos
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 4) Cria tabela `research_docs` — biblioteca de pesquisa por nicho+público
CREATE TABLE research_docs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nicho text NOT NULL,
    publico_id uuid REFERENCES publicos(id) ON DELETE SET NULL,
    title text NOT NULL,
    type text NOT NULL CHECK (type IN ('upload', 'text', 'link')),
    -- Conteúdo textual (texto colado, ou futuro: texto extraído do arquivo pra IA)
    content text,
    -- Arquivo cru no R2 (quando type = 'upload')
    file_key text,
    file_name text,
    file_ext text,
    file_size_bytes integer,
    content_type text,
    -- Link externo (quando type = 'link')
    source_url text,
    -- Metadados de origem (pensados pra futura extensão de browser)
    source_platform text,   -- youtube | instagram | tiktok | reddit | manual | …
    source_metadata jsonb,  -- author, video_id, likes, etc
    imported_via text NOT NULL DEFAULT 'web',  -- web | extension | upload
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_research_docs_user_nicho ON research_docs (user_id, nicho);
CREATE INDEX idx_research_docs_publico ON research_docs (publico_id);

-- RLS
ALTER TABLE research_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own research_docs"
    ON research_docs
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- FIM
-- =====================================================================
