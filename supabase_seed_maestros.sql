-- ============================================================
-- KitchenOps — Seed: Productos y PPs
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- ─── PRODUCTOS (ejemplos base — reemplazar con exportación Softland) ──

INSERT INTO productos (codigo, nombre, unidad_medida, costo_promedio) VALUES
  ('0301001', 'CARNE PLATEADA',         'KG', 6800),
  ('0301002', 'PECHUGA DE POLLO',       'KG', 3200),
  ('0301003', 'ENTRAÑA',                'KG', 9500),
  ('0301004', 'MALAYA',                 'KG', 5400),
  ('0301005', 'COSTILLA DE RES',        'KG', 5900),
  ('0301006', 'LOMO VETADO',            'KG', 12500),
  ('0301007', 'PIERNA DE CERDO',        'KG', 3800),
  ('0301008', 'CHORIZO',                'UN', 850),
  ('0301009', 'MORCILLA',               'UN', 650),
  ('0302001', 'ACEITE VEGETAL',         'LT', 1400),
  ('0302002', 'MANTEQUILLA',            'KG', 4200),
  ('0302003', 'CREMA',                  'LT', 1900),
  ('0401001', 'PAPA',                   'KG', 480),
  ('0401002', 'CEBOLLA',                'KG', 390),
  ('0401003', 'TOMATE',                 'KG', 520),
  ('0401004', 'PALTA',                  'KG', 1800),
  ('0401005', 'ZANAHORIA',              'KG', 350),
  ('0401006', 'CHAMPIÑON',              'KG', 2800),
  ('0401007', 'LECHUGA',                'KG', 1100),
  ('0501001', 'HARINA',                 'KG', 580),
  ('0501002', 'ARROZ',                  'KG', 720),
  ('0601001', 'QUESO GOUDA',            'KG', 5200),
  ('0601002', 'QUESO CREMA',            'KG', 4800),
  ('0701001', 'PAN HAMBURGUESA',        'UN', 280),
  ('0701002', 'PAN DE MOLDE',           'UN', 180)
ON CONFLICT (codigo) DO UPDATE SET
  nombre        = EXCLUDED.nombre,
  unidad_medida = EXCLUDED.unidad_medida,
  costo_promedio = EXCLUDED.costo_promedio;


-- ─── PPs (Productos en Proceso) ───────────────────────────────
-- PORCION: total_kg = cantidad × gramos_por_pp
-- UND:     total    = cantidad × gramos_por_pp
-- DIRECTO: total    = cantidad (sin conversión, el insumo se registra directamente)

INSERT INTO pp (nombre, tipo_pp, gramos_por_pp, codigo_producto) VALUES
  -- Carnes por porción (gramos_por_pp = KG de insumo por PP producido)
  ('PP MECHADA',             'PORCION', 0.500, '0301001'),  -- 500g plateada por porción
  ('PP FILETE DE POLLO',     'PORCION', 0.200, '0301002'),  -- 200g pechuga por filete
  ('PP ENTRAÑA',             'PORCION', 0.350, '0301003'),  -- 350g entraña por porción
  ('PP COSTILLA',            'PORCION', 0.400, '0301005'),  -- 400g costilla
  ('PP LOMO VETADO',         'PORCION', 0.300, '0301006'),  -- 300g lomo
  ('PP PIERNA CERDO',        'PORCION', 0.400, '0301007'),  -- 400g pierna

  -- Preparaciones directas (gramos_por_pp null — se registra en KG directamente)
  ('PP COLACION POLLO',      'DIRECTO', NULL,  '0301002'),
  ('PP COLACION RES',        'DIRECTO', NULL,  '0301001'),
  ('PP PURÉ DE PAPA',        'DIRECTO', NULL,  '0401001'),
  ('PP ENSALADA TOMATE',     'DIRECTO', NULL,  '0401003'),
  ('PP ENSALADA PALTA',      'DIRECTO', NULL,  '0401004')
ON CONFLICT (nombre) DO UPDATE SET
  tipo_pp         = EXCLUDED.tipo_pp,
  gramos_por_pp   = EXCLUDED.gramos_por_pp,
  codigo_producto = EXCLUDED.codigo_producto;


-- ─── Verificación ─────────────────────────────────────────────
SELECT 'productos' AS tabla, COUNT(*) FROM productos
UNION ALL
SELECT 'pp',                  COUNT(*) FROM pp
UNION ALL
SELECT 'responsables',        COUNT(*) FROM responsables
UNION ALL
SELECT 'verduras',            COUNT(*) FROM verduras;
