-- ============================================================
-- KitchenOps — Parche: seed data + rol admin + políticas RLS
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- ─── 1. REPARAR POLÍTICAS RLS (idempotente) ──────────────────
-- Las políticas fallaron en el SQL original con "already exists"
-- Primero las eliminamos si existen, luego recreamos

DO $$
DECLARE
  t TEXT;
  tablas TEXT[] := ARRAY[
    'responsables','productos','pp','pp_ingredientes','verduras',
    'produccion','detalle_produccion','rendimiento',
    'colacion','detalle_colacion',
    'mermas','detalle_mermas',
    'carta','carta_ingredientes'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Acceso autenticado" ON %I', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "Acceso autenticado" ON %I FOR ALL USING (auth.role() = ''authenticated'')',
      t
    );
  END LOOP;
END $$;


-- ─── 2. AGREGAR COLUMNA rol si aún dice 'finanzas' para admins ──
-- (la tabla ya existe, solo actualizamos datos)


-- ─── 3. SEED — RESPONSABLES (con rol admin para ycaro y jsepulveda) ──
INSERT INTO responsables (nombre, email, rol, color_hex, iniciales) VALUES
  ('YONATAN CARO',       'ycaro@cerveceriakunstmann.cl',         'admin',    '#8B5CF6', 'YC'),
  ('JAVIERA SEPULVEDA',  'jsepulveda@cerveceriakunstmann.cl',    'admin',    '#0D9373', 'JS'),
  ('DANIEL DELGADO',     'ddelgado@cerveceriakunstmann.cl',      'finanzas', '#3B82F6', 'DD'),
  ('FELIPE CARO',        'fcaro@cerveceriakunstmann.cl',         'jefatura', '#E8560A', 'FC'),
  ('PAULINA TRONCOSO',   'chefstorobayo@cerveceriakunstmann.cl', 'cocina',   '#D97706', 'PT'),
  ('LUISA FLANDEZ',      'chefstorobayo@cerveceriakunstmann.cl', 'cocina',   '#10B981', 'LF'),
  ('JOAQUIN VELASQUEZ',  'chefstorobayo@cerveceriakunstmann.cl', 'cocina',   '#6366F1', 'JV'),
  ('JOEL MENDEZ',        'chefstorobayo@cerveceriakunstmann.cl', 'cocina',   '#F59E0B', 'JM'),
  ('FELIPE VIDAL',       'chefstorobayo@cerveceriakunstmann.cl', 'cocina',   '#EF4444', 'FV'),
  ('PAMELA COLIHUINCA',  'chefstorobayo@cerveceriakunstmann.cl', 'cocina',   '#EC4899', 'PC'),
  ('PIA TELLO',          'chefstorobayo@cerveceriakunstmann.cl', 'cocina',   '#14B8A6', 'PT2')
ON CONFLICT (nombre) DO UPDATE SET
  email     = EXCLUDED.email,
  rol       = EXCLUDED.rol,
  color_hex = EXCLUDED.color_hex,
  iniciales = EXCLUDED.iniciales;


-- ─── 4. SEED — VERDURAS ──────────────────────────────────────
INSERT INTO verduras (nombre) VALUES
  ('PALTA (KG)'),
  ('CEBOLLA MORADA (KG)'),
  ('CEBOLLA BLANCA (KG)'),
  ('LIMON (KG)'),
  ('MORRON (KG)'),
  ('TOMATE (KG)'),
  ('AJI VERDE (KG)')
ON CONFLICT (nombre) DO NOTHING;


-- ─── 5. VERIFICACIÓN RÁPIDA ───────────────────────────────────
SELECT nombre, rol, iniciales FROM responsables ORDER BY
  CASE rol WHEN 'admin' THEN 1 WHEN 'finanzas' THEN 2 WHEN 'jefatura' THEN 3 ELSE 4 END,
  nombre;
