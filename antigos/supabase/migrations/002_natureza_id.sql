-- Atualiza naturezas: CONSERTO, FABRICACAO, COMPRA (+ SERVICO legado)
-- Execute após 001_schema.sql se o banco já existir

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'natureza_tipo' AND e.enumlabel = 'FABRICACAO') THEN
    ALTER TYPE natureza_tipo ADD VALUE 'FABRICACAO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'natureza_tipo' AND e.enumlabel = 'COMPRA') THEN
    ALTER TYPE natureza_tipo ADD VALUE 'COMPRA';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- item_id agrupa o mesmo item (pode repetir — igual Excel coluna ID)
COMMENT ON COLUMN rc_registros.item_id IS 'ID do item/peça (agrupador). Várias linhas podem compartilhar o mesmo ID.';
