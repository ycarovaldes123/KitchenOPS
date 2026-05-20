-- Columna de workflow para pp_recetas
-- Ejecutar una vez en el editor SQL de Supabase

-- Estado del flujo de aprobación de recetas
-- borrador              → creada por jefatura, no visible en costos
-- pendiente_revision    → enviada a cocina para revisión
-- pendiente_aprobacion  → revisada, esperando aprobación de finanzas/admin
-- aprobado              → activa y afecta costos de producción
-- rechazado             → devuelta con observaciones
-- inactivo              → desactivada pero conservada en historial

ALTER TABLE pp_recetas
  ADD COLUMN IF NOT EXISTS estado_workflow text NOT NULL DEFAULT 'aprobado'
  CHECK (estado_workflow IN (
    'borrador',
    'pendiente_revision',
    'pendiente_aprobacion',
    'aprobado',
    'rechazado',
    'inactivo'
  ));

-- Las recetas existentes (importadas de Softland) quedan como aprobadas
-- UPDATE pp_recetas SET estado_workflow = 'aprobado' WHERE estado_workflow IS NULL;

-- Columnas de trazabilidad del workflow
ALTER TABLE pp_recetas
  ADD COLUMN IF NOT EXISTS workflow_updated_by   text,
  ADD COLUMN IF NOT EXISTS workflow_updated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS workflow_observacion  text;

COMMENT ON COLUMN pp_recetas.estado_workflow IS
  'borrador→pendiente_revision→pendiente_aprobacion→aprobado|rechazado. Solo admin/finanzas pueden aprobar.';

-- Solo recetas aprobadas afectan costos de producción
-- La vista v_pp_recetas_activas filtra por estado_workflow = aprobado
CREATE OR REPLACE VIEW v_pp_recetas_activas AS
  SELECT * FROM pp_recetas
  WHERE activo = true AND estado_workflow = 'aprobado';

COMMENT ON VIEW v_pp_recetas_activas IS
  'Recetas vigentes y aprobadas — las que se usan para calcular costos de producción';
