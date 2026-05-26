-- ============================================================
-- KitchenOps — Eliminar PPs de ejemplo del seed inicial
-- Ejecutar en Supabase → SQL Editor
-- ============================================================
-- Estos PPs fueron creados como ejemplos ficticios al inicio
-- y deben eliminarse para no aparecer en producción.
-- ============================================================

DO $$
DECLARE
  _nombres TEXT[] := ARRAY[
    'PP MECHADA',
    'PP FILETE DE POLLO',
    'PP ENTRAÑA',
    'PP COSTILLA',
    'PP LOMO VETADO',
    'PP PIERNA CERDO',
    'PP COLACION POLLO',
    'PP COLACION RES',
    'PP PURÉ DE PAPA',
    'PP ENSALADA TOMATE',
    'PP ENSALADA PALTA'
  ];
  _n TEXT;
BEGIN
  FOREACH _n IN ARRAY _nombres LOOP
    BEGIN
      DELETE FROM pp WHERE nombre = _n;
      RAISE NOTICE 'Eliminado: %', _n;
    EXCEPTION WHEN foreign_key_violation THEN
      -- Tiene registros históricos de producción → marcar inactivo
      UPDATE pp SET activo = false WHERE nombre = _n;
      RAISE NOTICE 'Marcado inactivo (tiene historial): %', _n;
    END;
  END LOOP;
END $$;

-- Verificación: PPs que quedaron activos
SELECT nombre, tipo_pp, codigo_producto
FROM pp
WHERE activo IS NOT FALSE
ORDER BY nombre;
