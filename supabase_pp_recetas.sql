-- ============================================================
-- KitchenOps — Módulo Recetas PP
-- Cervecería Kunstmann · Torobayo · Valdivia
-- ============================================================
-- Ejecutar en Supabase SQL Editor DESPUÉS de supabase_schema.sql
-- ============================================================


-- ============================================================
-- PASO 1: CREAR TABLAS
-- ============================================================

-- Master de recetas PP (una receta por código 0501xxx)
CREATE TABLE IF NOT EXISTS pp_recetas (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_receta            TEXT NOT NULL UNIQUE,  -- 0501xxx (código interno receta)
  codigo_pp                TEXT,                  -- 0502xxx (código Softland PP terminado)
  nombre                   TEXT NOT NULL,
  rendimiento              NUMERIC NOT NULL DEFAULT 1,  -- en la UM base del PP (GR, PR, CC, KG)
  unidad_rendimiento       TEXT NOT NULL DEFAULT 'GR',  -- GR | PR | CC | KG
  costo_total_calculado    INTEGER DEFAULT 0,     -- suma de todas las líneas (CLP)
  costo_unitario_calculado INTEGER DEFAULT 0,     -- costo_total / rendimiento (CLP por unidad)
  estado                   TEXT NOT NULL DEFAULT 'PENDIENTE',
  -- ACTIVO     = receta completa y costos OK
  -- PENDIENTE  = ingredientes sin costo (costo_promedio = 0)
  -- INCOMPLETO = ingredientes sin código en productos
  activo                   BOOLEAN DEFAULT true,
  importado_at             TIMESTAMPTZ,           -- última importación desde Excel
  calculado_at             TIMESTAMPTZ,           -- último recálculo de costos
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Líneas de ingredientes por receta
CREATE TABLE IF NOT EXISTS pp_receta_ingredientes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pp_receta_id          UUID NOT NULL REFERENCES pp_recetas(id) ON DELETE CASCADE,
  orden                 INTEGER NOT NULL DEFAULT 1,
  codigo_ingrediente    TEXT,                     -- FK a productos.codigo (puede ser NULL si no matchea)
  nombre_ingrediente    TEXT NOT NULL,            -- tal como viene del Excel (snapshot)
  cantidad              NUMERIC NOT NULL DEFAULT 0,
  unidad_medida         TEXT NOT NULL DEFAULT 'KG',
  -- Snapshot del costo al momento del último recálculo
  costo_unitario_snap   INTEGER DEFAULT 0,
  costo_linea_calculado INTEGER DEFAULT 0,        -- = calc(cantidad, UM, costo_unitario_snap)
  -- Estado de la línea
  sin_codigo            BOOLEAN DEFAULT false,    -- true si codigo_ingrediente es NULL
  sin_costo             BOOLEAN DEFAULT false,    -- true si costo_unitario_snap = 0
  created_at            TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- PASO 2: ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_pp_recetas_codigo         ON pp_recetas(codigo_receta);
CREATE INDEX IF NOT EXISTS idx_pp_recetas_codigo_pp      ON pp_recetas(codigo_pp);
CREATE INDEX IF NOT EXISTS idx_pp_recetas_estado         ON pp_recetas(estado);
CREATE INDEX IF NOT EXISTS idx_pp_recetas_activo         ON pp_recetas(activo);
CREATE INDEX IF NOT EXISTS idx_pp_ing_receta             ON pp_receta_ingredientes(pp_receta_id);
CREATE INDEX IF NOT EXISTS idx_pp_ing_codigo             ON pp_receta_ingredientes(codigo_ingrediente);


-- ============================================================
-- PASO 3: ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE pp_recetas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_receta_ingredientes  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso autenticado" ON pp_recetas
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Acceso autenticado" ON pp_receta_ingredientes
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- PASO 4: FUNCIÓN TRIGGER → updated_at automático
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pp_recetas_updated_at
  BEFORE UPDATE ON pp_recetas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- NOTAS DE USO
-- ============================================================
-- 1. Poblar via /api/maestros/importar-recetas-pp  (POST multipart, field "file")
--    Lee la hoja PRODUCCION de Recetas Torobayo Actualizadas.xlsx
--
-- 2. Recalcular costos via /api/maestros/recetas-pp  (POST { accion: "recalcular" })
--    Cruza codigo_ingrediente → productos.costo_promedio en tiempo real
--    y actualiza costo_total_calculado, costo_unitario_calculado, estado
--
-- 3. Mapeo de códigos:
--    codigo_receta = 0501xxx  (código interno en Excel)
--    codigo_pp     = 0502xxx  (código Softland PP terminado, mismo sufijo)
--    Ej: 0501001 MECHADA → 0502001 PP MECHADA
--
-- 4. Estados:
--    ACTIVO     = todos los ingredientes tienen costo > 0
--    PENDIENTE  = ≥1 ingrediente tiene costo = 0 (stock Softland vacío temporalmente)
--    INCOMPLETO = ≥1 ingrediente no existe en tabla productos
