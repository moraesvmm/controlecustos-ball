-- Migração 005: Colaboradores + colunas faltantes em custo_geral

-- Tabela de colaboradores (base para PROCVs)
CREATE TABLE IF NOT EXISTS colaboradores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cc TEXT,
    cod_req TEXT UNIQUE NOT NULL,
    nome TEXT,
    area TEXT,
    turno TEXT,
    area_cc TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Colunas faltantes na tabela custo_geral
ALTER TABLE custo_geral ADD COLUMN IF NOT EXISTS valor_mob NUMERIC(14,2);
ALTER TABLE custo_geral ADD COLUMN IF NOT EXISTS sc_codigo TEXT;
ALTER TABLE custo_geral ADD COLUMN IF NOT EXISTS descricao_db TEXT;
