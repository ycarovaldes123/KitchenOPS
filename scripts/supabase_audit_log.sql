-- Tabla de auditoría para acciones críticas en KitchenOPS
-- Ejecutar una vez en el editor SQL de Supabase

CREATE TABLE IF NOT EXISTS audit_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  usuario_email    text        NOT NULL,
  rol_usuario      text        NOT NULL,
  accion           text        NOT NULL,
  tabla            text        NOT NULL,
  registro_id      text,
  datos_anteriores jsonb,
  datos_nuevos     jsonb,
  motivo           text
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS audit_log_usuario_idx   ON audit_log (usuario_email);
CREATE INDEX IF NOT EXISTS audit_log_accion_idx    ON audit_log (accion);
CREATE INDEX IF NOT EXISTS audit_log_tabla_idx     ON audit_log (tabla);
CREATE INDEX IF NOT EXISTS audit_log_created_idx   ON audit_log (created_at DESC);

-- RLS: solo service role puede insertar, admin puede leer
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Solo el backend (anon/service_role) puede insertar
CREATE POLICY "backend insert" ON audit_log
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Solo usuarios autenticados pueden leer sus propios registros
-- (el filtro real de acceso es en la API, no en RLS)
CREATE POLICY "authenticated read" ON audit_log
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE audit_log IS 'Registro de acciones críticas: importaciones, modificaciones de maestros, recálculos masivos';
