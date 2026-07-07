-- Migration 003: Adicionar campo foto_url para anexar fotos às RCs
ALTER TABLE rc_registros ADD COLUMN IF NOT EXISTS foto_url TEXT;
COMMENT ON COLUMN rc_registros.foto_url IS 'URL da foto/imagem anexada ao registro RC (base64 dataURL ou link externo)';

-- Recriar a view (DROP + CREATE) pois a coluna nova muda a ordem do r.*
DROP VIEW IF EXISTS rc_registros_completo;

CREATE VIEW rc_registros_completo AS
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
