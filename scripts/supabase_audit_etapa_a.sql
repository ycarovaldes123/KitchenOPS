-- Etapa A: audit trail columns for editable detalle tables
-- Run once in Supabase SQL Editor

ALTER TABLE detalle_mermas
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by      TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_rol  TEXT;

ALTER TABLE detalle_colacion
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by      TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_rol  TEXT;
