-- ============================================================
-- Crear PPs faltantes: ASADO DE TIRA y PASTELERA CHOCLO
-- + vincular PPs existentes sin codigo_producto
-- Generado: 2026-06-02
-- ============================================================
BEGIN;

-- ── 1. PRIMERO crear TODOS los productos 0502xxx ─────────────
-- (la FK de pp.codigo_producto apunta a productos, hay que
--  insertar primero antes de hacer cualquier UPDATE en pp)

INSERT INTO productos (codigo, nombre, unidad_medida, costo_promedio, activo)
VALUES
  -- Nuevos PPs con costo real del Excel
  ('0502261', 'PP ASADO DE TIRA',        'UN', 5935, true),
  ('0502241', 'PP PASTELERA CHOCLO',     'UN', 467,  true),
  -- PPs existentes en tabla pp pero sin producto vinculado (costo 0, se recalcula)
  ('0502266', 'PP CHAMPIÑONES HIDRATADOS', 'UN', 0, true),
  ('0502267', 'PP CIERVO SIN PEPINILLOS',  'UN', 0, true),
  ('0502268', 'PP SALSA TARTARA',           'CC', 0, true),
  ('0502269', 'PP SALSA BRAVA',             'CC', 0, true),
  ('0502270', 'PP LACTONESA DE AJO',        'CC', 0, true),
  ('0502272', 'PP CANASTO DE PAPAS',        'UN', 0, true),
  ('0502273', 'PP SALSA ESPAÑOLA',          'CC', 0, true),
  ('0502274', 'PP LECHE DE TIGRE',          'CC', 0, true),
  ('0502275', 'PP PURE DE CAMOTE',          'GR', 0, true),
  ('0502276', 'PP SALSA MALTESA',           'CC', 0, true),
  ('0502277', 'PP ACEITE VERDE',            'CC', 0, true),
  ('0502278', 'PP PURE DE ARVEJAS',         'GR', 0, true),
  ('0502279', 'PP GOULASH',                 'GR', 0, true),
  ('0502281', 'PP SALSA PONZOU',            'CC', 0, true)
ON CONFLICT (codigo) DO UPDATE
  SET nombre         = EXCLUDED.nombre,
      costo_promedio = CASE WHEN EXCLUDED.costo_promedio > 0
                            THEN EXCLUDED.costo_promedio
                            ELSE productos.costo_promedio END;

-- ── 2. AHORA actualizar codigo_producto en PPs existentes ────

UPDATE pp SET codigo_producto = '0502266' WHERE nombre = 'PP CHAMPIÑONES HIDRATADOS'  AND (codigo_producto IS NULL OR codigo_producto = '0101121');
UPDATE pp SET codigo_producto = '0502267' WHERE nombre = 'PP CIERVO SIN PEPINILLOS'   AND codigo_producto IS NULL;
UPDATE pp SET codigo_producto = '0502268' WHERE nombre = 'PP SALSA TARTARA'            AND codigo_producto IS NULL;
UPDATE pp SET codigo_producto = '0502269' WHERE nombre = 'PP SALSA BRAVA'              AND codigo_producto IS NULL;
UPDATE pp SET codigo_producto = '0502270' WHERE nombre = 'PP LACTONESA DE AJO'         AND codigo_producto IS NULL;
UPDATE pp SET codigo_producto = '0502272' WHERE nombre = 'PP CANASTO DE PAPAS'         AND codigo_producto IS NULL;
UPDATE pp SET codigo_producto = '0502273' WHERE nombre = 'PP SALSA ESPAÑOLA'           AND codigo_producto IS NULL;
UPDATE pp SET codigo_producto = '0502274' WHERE nombre = 'PP LECHE DE TIGRE'           AND codigo_producto IS NULL;
UPDATE pp SET codigo_producto = '0502275' WHERE nombre = 'PP PURE DE CAMOTE'           AND codigo_producto IS NULL;
UPDATE pp SET codigo_producto = '0502276' WHERE nombre = 'PP SALSA MALTESA'            AND codigo_producto IS NULL;
UPDATE pp SET codigo_producto = '0502277' WHERE nombre = 'PP ACEITE VERDE'             AND codigo_producto IS NULL;
UPDATE pp SET codigo_producto = '0502278' WHERE nombre = 'PP PURE DE ARVEJAS'          AND codigo_producto IS NULL;
UPDATE pp SET codigo_producto = '0502279' WHERE nombre = 'PP GOULASH'                  AND codigo_producto IS NULL;
UPDATE pp SET codigo_producto = '0502281' WHERE nombre = 'PP SALSA PONZOU'             AND codigo_producto IS NULL;

-- ── 3. Crear los 2 PPs nuevos ────────────────────────────────

INSERT INTO pp (nombre, tipo_pp, gramos_por_pp, codigo_producto, activo)
VALUES
  ('PP ASADO DE TIRA',    'UND', 1, '0502261', true),
  ('PP PASTELERA CHOCLO', 'UND', 1, '0502241', true);

COMMIT;
