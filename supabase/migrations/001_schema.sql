-- Controle RC - Schema baseado na planilha CONTROLE RC (1).xlsx
-- Tabela principal: Planilha1 / Tabela4

CREATE TYPE natureza_tipo AS ENUM ('CONSERTO', 'FABRICACAO', 'COMPRA', 'SERVICO');
CREATE TYPE criticidade_tipo AS ENUM ('CRITICA', 'ALTA', 'MEDIA', 'BAIXA');

CREATE TABLE rc_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sinal TEXT,
  item_id INTEGER,
  natureza natureza_tipo NOT NULL DEFAULT 'CONSERTO',
  item TEXT NOT NULL,
  descricao_falha TEXT,
  solicitante TEXT,
  criticidade criticidade_tipo,
  linha TEXT,
  maquina TEXT,
  fornecedor TEXT,
  nf_saida TEXT,
  data_saida DATE,
  orcamento TEXT,
  rc TEXT,
  po TEXT,
  valor NUMERIC(14,2) DEFAULT 0,
  previsao_entrega DATE,
  data_recebimento DATE,
  comentario TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para filtros (slicers do Excel)
CREATE INDEX idx_rc_natureza ON rc_registros(natureza);
CREATE INDEX idx_rc_status_fields ON rc_registros(data_recebimento, po, rc, orcamento);
CREATE INDEX idx_rc_linha ON rc_registros(linha);
CREATE INDEX idx_rc_maquina ON rc_registros(maquina);
CREATE INDEX idx_rc_fornecedor ON rc_registros(fornecedor);
CREATE INDEX idx_rc_criticidade ON rc_registros(criticidade);

-- View com campos calculados (fórmulas Excel colunas Q-X)
CREATE OR REPLACE VIEW rc_registros_completo AS
SELECT
  r.*,
  EXTRACT(YEAR FROM r.previsao_entrega)::INTEGER AS ano_previsto,
  CASE
    WHEN r.data_recebimento IS NOT NULL THEN 'ENTREGUE'
    WHEN r.po IS NOT NULL AND r.po <> '' THEN 'PENDENTE DE ENTREGA'
    WHEN r.rc IS NOT NULL AND r.rc <> '' THEN 'PENDENTE DE PEDIDO'
    WHEN r.orcamento IS NOT NULL AND r.orcamento <> '' THEN 'PENDENTE DE ORCAMENTO'
    ELSE 'PENDENTE'
  END AS status,
  CASE
    WHEN r.data_recebimento IS NOT NULL THEN NULL
    WHEN r.previsao_entrega IS NULL THEN NULL
    WHEN EXTRACT(MONTH FROM r.previsao_entrega) >= EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM r.previsao_entrega) >= EXTRACT(YEAR FROM CURRENT_DATE)
    THEN r.valor
    ELSE NULL
  END AS valor_previsto,
  CASE WHEN r.data_recebimento IS NOT NULL THEN r.valor ELSE NULL END AS valor_recebido,
  CASE
    WHEN r.data_recebimento IS NULL AND r.previsao_entrega IS NULL THEN NULL
    WHEN r.data_recebimento IS NOT NULL THEN TO_CHAR(r.data_recebimento, 'Mon')
    ELSE TO_CHAR(r.previsao_entrega, 'Mon')
  END AS mes_referencia,
  CONCAT(r.maquina, ' - ', r.linha) AS maquina_linha,
  CASE
    WHEN r.data_saida IS NULL THEN NULL
    ELSE (CURRENT_DATE - r.data_saida)::INTEGER
  END AS dias_fora
FROM rc_registros r;

-- RLS
ALTER TABLE rc_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura pública rc_registros" ON rc_registros FOR SELECT USING (true);
CREATE POLICY "Inserção rc_registros" ON rc_registros FOR INSERT WITH CHECK (true);
CREATE POLICY "Atualização rc_registros" ON rc_registros FOR UPDATE USING (true);
CREATE POLICY "Exclusão rc_registros" ON rc_registros FOR DELETE USING (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rc_registros_updated_at
  BEFORE UPDATE ON rc_registros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
