-- ============================================================
-- KitchenOps — Actualizar lista de responsables
-- Ejecutar en Supabase → SQL Editor
-- Fecha: 2026-07-22
-- ============================================================
-- Lista aprobada por jefe de cocina:
--   LUISA FLANDEZ, PAULINA TRONCOSO, JOAQUIN VELASQUEZ,
--   FELIPE CARO, JAVIERA SEPULVEDA, JOEL MENDEZ,
--   CAMILO PARADA, PAMELA COLIHUINCA
-- (2026-07-22: FELIPE VIDAL desactivado, reemplazado por CAMILO PARADA)
-- ============================================================

-- ── PASO 1: Desactivar todos los responsables actuales ──────
UPDATE responsables SET activo = false;

-- ── PASO 2: Upsert los 8 responsables aprobados ────────────
-- ON CONFLICT (nombre) → actualiza si ya existe, inserta si es nuevo
INSERT INTO responsables (nombre, email, rol, color_hex, iniciales, activo) VALUES
  ('LUISA FLANDEZ',      NULL,                                     'cocina',    '#E8560A', 'LF', true),
  ('PAULINA TRONCOSO',   NULL,                                     'cocina',    '#0EA5E9', 'PT', true),
  ('JOAQUIN VELASQUEZ',  NULL,                                     'cocina',    '#7C3AED', 'JV', true),
  ('FELIPE CARO',        'fcaro@cerveceriakunstmann.cl',           'jefatura',  '#D97706', 'FC', true),
  ('JAVIERA SEPULVEDA',  'jsepulveda@cerveceriakunstmann.cl',      'admin',     '#0D9373', 'JS', true),
  ('JOEL MENDEZ',        NULL,                                     'cocina',    '#DC2626', 'JM', true),
  ('CAMILO PARADA',      NULL,                                     'cocina',    '#EC4899', 'CP', true),
  ('PAMELA COLIHUINCA',  NULL,                                     'cocina',    '#059669', 'PC', true)
ON CONFLICT (nombre) DO UPDATE SET
  activo    = true,
  color_hex = EXCLUDED.color_hex,
  iniciales = EXCLUDED.iniciales,
  email     = COALESCE(EXCLUDED.email, responsables.email),
  rol       = EXCLUDED.rol;

-- ── Verificación ────────────────────────────────────────────
SELECT nombre, iniciales, rol, color_hex, activo
FROM responsables
ORDER BY activo DESC, nombre;
