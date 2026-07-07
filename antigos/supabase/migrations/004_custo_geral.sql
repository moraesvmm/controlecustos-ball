-- Migração para o Módulo de Custo Geral

-- Tabela para os dados importados do Datasul (Planilha2)
CREATE TABLE IF NOT EXISTS datasul_ordens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_ordem TEXT UNIQUE NOT NULL,
    solicitante TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para os dados de Custo Geral (Financeiro)
CREATE TABLE IF NOT EXISTS custo_geral (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cod_estabel TEXT,
    cod_depos TEXT,
    it_codigo TEXT,
    descricao_codigo TEXT,
    grupo TEXT,
    ct_codigo TEXT,
    descricao_conta TEXT,
    dt_trans DATE,
    mes INTEGER,
    esp_docto TEXT,
    especdoc TEXT,
    tipo_trans TEXT,
    ent_sai TEXT,
    quantidade NUMERIC(14,4),
    un TEXT,
    numero_ordem TEXT,
    nro_docto TEXT,
    linha TEXT,
    cod_emitente TEXT,
    descricao_emitente TEXT,
    nat_operacao TEXT,
    material NUMERIC(14,2),
    ggf NUMERIC(14,2),
    valor_tt NUMERIC(14,2),
    quant_tt_ajustado NUMERIC(14,4),
    custo_do_mes NUMERIC(14,2),
    custo_mes_anterior NUMERIC(14,2),
    custo_de_entrada NUMERIC(14,2),
    -- Colunas enriquecidas (calculadas no backend ou via join no frontend)
    solicitante TEXT,
    area TEXT,
    item_tipo TEXT,
    carater TEXT,
    nome_solicitante TEXT,
    class_diver TEXT,
    cc TEXT,
    custo_cc NUMERIC(14,2),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS se necessário (opcional, dependendo da configuração do projeto)
-- ALTER TABLE datasul_ordens ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE custo_geral ENABLE ROW LEVEL SECURITY;
