-- ============================================================
-- KitchenOps — Eliminar productos NO alimentarios
-- Ejecutar en Supabase → SQL Editor
-- Fecha: 2026-05-20
-- ============================================================
-- Elimina de forma segura: primero intenta DELETE,
-- si tiene referencias en otras tablas (FK) lo marca inactivo.
-- ============================================================

DO $$
DECLARE
  _codigos TEXT[];
  _c       TEXT;
BEGIN
  -- ── 1. INSUMOS LIMPIEZA / ASEO (prefijo 21xx) ─────────────
  -- ALUSA FOIL, CLORO, GEL ALCOHOL, JABONES, BOLSAS BASURA,
  -- ESPONJAS, GUANTES, MASCARILLAS, GORROS, PAÑOS, ESCOBAS, etc.
  SELECT ARRAY_AGG(codigo) INTO _codigos
  FROM productos
  WHERE codigo LIKE '21%';

  -- ── 2. ENVASES / EMBALAJES (prefijo 12xx) ─────────────────
  -- BOLSAS SELLADORA, BANDEJAS, POCILLOS, ROLLOS, etc.
  -- SE CONSERVAN: 1201017 (PALITOS COCKTAIL) y 1201021 (PALOS BROCHETAS)
  SELECT _codigos || ARRAY_AGG(codigo) INTO _codigos
  FROM productos
  WHERE codigo LIKE '12%'
    AND codigo NOT IN ('1201017', '1201021');

  -- ── 3. SOUVENIR / CIGARROS / tabaco (por nombre) ──────────
  SELECT _codigos || ARRAY_AGG(codigo) INTO _codigos
  FROM productos
  WHERE nombre ILIKE '%souvenir%'
     OR nombre ILIKE '%cigarro%'
     OR nombre ILIKE '%tabaco%'
     OR nombre ILIKE '%cigarette%';

  -- ── Ejecutar limpieza ──────────────────────────────────────
  IF _codigos IS NULL OR array_length(_codigos, 1) = 0 THEN
    RAISE NOTICE 'No se encontraron productos para eliminar.';
    RETURN;
  END IF;

  FOREACH _c IN ARRAY _codigos LOOP
    BEGIN
      DELETE FROM productos WHERE codigo = _c;
      RAISE NOTICE 'Eliminado: %', _c;
    EXCEPTION WHEN foreign_key_violation THEN
      -- Tiene referencias en detalle_colacion, detalle_mermas, etc. → marcar inactivo
      UPDATE productos SET activo = false WHERE codigo = _c;
      RAISE NOTICE 'Marcado inactivo (tiene referencias): %', _c;
    END;
  END LOOP;
END $$;

-- ── Verificación: ver qué quedó ────────────────────────────
SELECT
  CASE
    WHEN codigo LIKE '21%' THEN 'LIMPIEZA'
    WHEN codigo LIKE '12%' THEN 'EMBALAJE'
    ELSE 'OTRO'
  END AS categoria,
  COUNT(*) AS restantes
FROM productos
WHERE codigo LIKE '21%' OR codigo LIKE '12%'
GROUP BY 1;

-- Si el resultado está vacío (o solo muestra EMBALAJE con 2 filas = PALOS+PALITOS), todo OK.
SELECT codigo, nombre FROM productos WHERE codigo IN ('1201017','1201021');
