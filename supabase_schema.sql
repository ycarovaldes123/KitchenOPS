-- ============================================================
-- KitchenOps — Schema definitivo Supabase
-- Cervecería Kunstmann · Torobayo · Valdivia
-- ============================================================
-- INSTRUCCIONES:
-- 1. Abre Supabase → SQL Editor
-- 2. Ejecuta primero la sección DROP (limpia el prototipo)
-- 3. Ejecuta la sección CREATE
-- ============================================================


-- ============================================================
-- PASO 1: ELIMINAR SCHEMA PROTOTIPO (orden inverso de FKs)
-- ============================================================

DROP TABLE IF EXISTS staging_hist_rendimiento         CASCADE;
DROP TABLE IF EXISTS staging_hist_detalle_produccion  CASCADE;
DROP TABLE IF EXISTS staging_hist_detalle_colacion    CASCADE;
DROP TABLE IF EXISTS staging_hist_detalle_mermas      CASCADE;
DROP TABLE IF EXISTS staging_hist_produccion          CASCADE;
DROP TABLE IF EXISTS staging_hist_colacion            CASCADE;
DROP TABLE IF EXISTS staging_hist_mermas              CASCADE;
DROP TABLE IF EXISTS staging_excel_productos          CASCADE;
DROP TABLE IF EXISTS staging_excel_productos_en_proceso CASCADE;
DROP TABLE IF EXISTS staging_excel_responsables       CASCADE;
DROP TABLE IF EXISTS staging_excel_verduras           CASCADE;
DROP TABLE IF EXISTS staging_actualizacion_precios_softland CASCADE;
DROP TABLE IF EXISTS softland_importacion_detalle     CASCADE;
DROP TABLE IF EXISTS softland_importaciones           CASCADE;
DROP TABLE IF EXISTS revalorizaciones_log             CASCADE;
DROP TABLE IF EXISTS productos_estado_log             CASCADE;
DROP TABLE IF EXISTS productos_en_proceso_equivalencias CASCADE;
DROP TABLE IF EXISTS productos_en_proceso_alias       CASCADE;
DROP TABLE IF EXISTS produccion_consumos              CASCADE;
DROP TABLE IF EXISTS receta_detalle                   CASCADE;
DROP TABLE IF EXISTS recetas                          CASCADE;
DROP TABLE IF EXISTS migracion_id_map                 CASCADE;
DROP TABLE IF EXISTS exportaciones                    CASCADE;
DROP TABLE IF EXISTS email_logs                       CASCADE;
DROP TABLE IF EXISTS audit_logs                       CASCADE;
DROP TABLE IF EXISTS colacion_detalle                 CASCADE;
DROP TABLE IF EXISTS merma_detalle                    CASCADE;
DROP TABLE IF EXISTS produccion_detalle               CASCADE;
DROP TABLE IF EXISTS produccion_rendimiento           CASCADE;
DROP TABLE IF EXISTS colaciones                       CASCADE;
DROP TABLE IF EXISTS mermas                           CASCADE;
DROP TABLE IF EXISTS producciones                     CASCADE;
DROP TABLE IF EXISTS productos_costos                 CASCADE;
DROP TABLE IF EXISTS productos_en_proceso             CASCADE;
DROP TABLE IF EXISTS verduras                         CASCADE;
DROP TABLE IF EXISTS productos                        CASCADE;
DROP TABLE IF EXISTS usuarios                         CASCADE;
DROP TABLE IF EXISTS responsables                     CASCADE;
DROP TABLE IF EXISTS motivos_merma                    CASCADE;
DROP TABLE IF EXISTS unidades_medida                  CASCADE;
DROP TABLE IF EXISTS turnos                           CASCADE;
DROP TABLE IF EXISTS roles                            CASCADE;

-- Tablas de carta (si existían)
DROP TABLE IF EXISTS carta_ingredientes               CASCADE;
DROP TABLE IF EXISTS carta                            CASCADE;
DROP TABLE IF EXISTS pp_ingredientes                  CASCADE;
DROP TABLE IF EXISTS pp                               CASCADE;
DROP TABLE IF EXISTS detalle_mermas                   CASCADE;
DROP TABLE IF EXISTS detalle_colacion                 CASCADE;
DROP TABLE IF EXISTS detalle_produccion               CASCADE;
DROP TABLE IF EXISTS rendimiento                      CASCADE;
DROP TABLE IF EXISTS colacion                         CASCADE;
DROP TABLE IF EXISTS produccion                       CASCADE;


-- ============================================================
-- PASO 2: CREAR SCHEMA DEFINITIVO
-- ============================================================

-- ─── RESPONSABLES ────────────────────────────────────────────
-- UUID como PK → permite que personal de cocina comparta email
-- nombre UNIQUE → identificador operacional (el que se ve en registros)
-- email → para auth (cocina comparte chefstorobayo@, finanzas/jefatura email propio)
CREATE TABLE responsables (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT NOT NULL UNIQUE,   -- "PAULINA TRONCOSO", "JAVIERA SEPULVEDA"
  email      TEXT,                    -- puede ser el mismo para varios de cocina
  rol        TEXT NOT NULL,           -- cocina | jefatura | finanzas
  activo     BOOLEAN DEFAULT true,
  color_hex  TEXT DEFAULT '#6B7280',  -- color del avatar en UI
  iniciales  TEXT,                    -- "PT", "JS", etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PRODUCTOS SOFTLAND ──────────────────────────────────────
-- CRÍTICO: codigo es TEXT porque "0301032" tiene cero inicial
-- Es la fuente de verdad de Softland. Javiera actualiza mensualmente.
CREATE TABLE productos (
  codigo         TEXT PRIMARY KEY,    -- SIEMPRE TEXT, nunca INTEGER
  nombre         TEXT NOT NULL,
  unidad_medida  TEXT NOT NULL,       -- KG | GR | LT | UN | CC | PR
  costo_promedio NUMERIC(14,6) NOT NULL DEFAULT 0,  -- CLP; puede tener decimales para PP por GR/CC
  activo         BOOLEAN DEFAULT true,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PP (Productos en Proceso) ───────────────────────────────
CREATE TABLE pp (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT NOT NULL UNIQUE,
  tipo_pp         TEXT NOT NULL,   -- PORCION | CC | UND | DIRECTO
  gramos_por_pp   NUMERIC,         -- cantidad del insumo por PP producido
  codigo_producto TEXT REFERENCES productos(codigo),
  activo          BOOLEAN DEFAULT true
);

-- PP con múltiples ingredientes
-- Solo caso actual: PP MIX TABLA CRIOLLA (Entraña 200g + Malaya 200g)
CREATE TABLE pp_ingredientes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pp_id           UUID REFERENCES pp(id) ON DELETE CASCADE,
  orden           INTEGER DEFAULT 1,
  codigo_producto TEXT REFERENCES productos(codigo),
  nombre_producto TEXT,
  gramos          NUMERIC,
  unidad_medida   TEXT
);

-- ─── VERDURAS (para rendimiento) ─────────────────────────────
CREATE TABLE verduras (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT NOT NULL UNIQUE,
  codigo_producto TEXT REFERENCES productos(codigo),
  activo     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PRODUCCIÓN ──────────────────────────────────────────────
CREATE TABLE produccion (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              DATE NOT NULL,
  responsable_id     UUID REFERENCES responsables(id),
  responsable_nombre TEXT NOT NULL,  -- snapshot — preserva nombre en historial
  turno              TEXT NOT NULL,  -- AM | PM
  observacion        TEXT NOT NULL,  -- OBLIGATORIO
  estado             TEXT DEFAULT 'REGISTRADO',
  correo_enviado     BOOLEAN DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Detalle líneas de producción
-- FÓRMULA: total_producido = cantidad × gramos_por_pp
-- recetas_ref es SOLO referencia histórica, nunca entra en cálculo
CREATE TABLE detalle_produccion (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id   UUID REFERENCES produccion(id) ON DELETE CASCADE,
  pp_id           UUID REFERENCES pp(id),
  nombre_pp       TEXT NOT NULL,      -- snapshot del nombre
  tipo_pp         TEXT,
  cantidad        NUMERIC NOT NULL,
  gramos_por_pp   NUMERIC,
  total_producido NUMERIC,            -- = cantidad × gramos_por_pp
  recetas_ref     INTEGER,            -- SOLO referencia histórica
  codigo_producto TEXT,               -- snapshot
  costo_unitario  NUMERIC(14,6) DEFAULT 0,  -- snapshot al momento del registro
  costo_total     INTEGER DEFAULT 0   -- snapshot al momento del registro
);

-- Rendimiento de verduras (asociado al informe de producción)
-- merma_kg y merma_pct se CALCULAN en app, no se almacenan
CREATE TABLE rendimiento (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id   UUID REFERENCES produccion(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  verdura         TEXT NOT NULL,
  kg_utilizados   NUMERIC NOT NULL,
  rendimiento_kg  NUMERIC NOT NULL,
  -- merma_kg = kg_utilizados - rendimiento_kg  (calculado en app)
  -- merma_pct = merma_kg / kg_utilizados × 100 (calculado en app)
  responsable_nombre TEXT  -- snapshot
);

-- ─── COLACIÓN ────────────────────────────────────────────────
CREATE TABLE colacion (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              DATE NOT NULL,
  responsable_id     UUID REFERENCES responsables(id),
  responsable_nombre TEXT NOT NULL,  -- snapshot
  menu               TEXT NOT NULL,  -- descripción del menú (OBLIGATORIO)
  n_inscritos        INTEGER NOT NULL DEFAULT 0,  -- 0 en datos históricos pre-abril 2026
  costo_total        INTEGER DEFAULT 0,
  -- costo_por_plato = costo_total / n_inscritos (calculado en app)
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE detalle_colacion (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colacion_id     UUID REFERENCES colacion(id) ON DELETE CASCADE,
  codigo_producto TEXT REFERENCES productos(codigo),
  nombre_producto TEXT,     -- snapshot
  cantidad        NUMERIC NOT NULL,
  unidad_medida   TEXT,
  costo_unitario  INTEGER DEFAULT 0,  -- snapshot
  costo_total     INTEGER DEFAULT 0   -- snapshot
);

CREATE TABLE frutas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              DATE NOT NULL,
  responsable_id     UUID REFERENCES responsables(id),
  responsable_nombre TEXT NOT NULL,
  observacion        TEXT DEFAULT '',
  costo_total        INTEGER DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE detalle_frutas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fruta_id        UUID REFERENCES frutas(id) ON DELETE CASCADE,
  codigo_producto TEXT REFERENCES productos(codigo),
  nombre_producto TEXT,
  cantidad        NUMERIC NOT NULL,
  unidad_medida   TEXT,
  costo_unitario  NUMERIC DEFAULT 0,
  costo_total     INTEGER DEFAULT 0,
  updated_at      TIMESTAMPTZ,
  updated_by      TEXT,
  updated_by_rol  TEXT
);

CREATE TABLE inventarios (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              DATE NOT NULL,
  responsable_id     UUID REFERENCES responsables(id),
  responsable_nombre TEXT NOT NULL,
  observacion        TEXT DEFAULT '',
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE detalle_inventario (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id   UUID REFERENCES inventarios(id) ON DELETE CASCADE,
  ubicacion       TEXT NOT NULL,
  codigo_producto TEXT REFERENCES productos(codigo),
  nombre_producto TEXT,
  cantidad        NUMERIC NOT NULL,
  unidad_medida   TEXT,
  updated_at      TIMESTAMPTZ,
  updated_by      TEXT,
  updated_by_rol  TEXT
);

-- ─── MERMAS ──────────────────────────────────────────────────
CREATE TABLE mermas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              DATE NOT NULL,
  responsable_id     UUID REFERENCES responsables(id),
  responsable_nombre TEXT NOT NULL,  -- snapshot
  observacion        TEXT NOT NULL,  -- OBLIGATORIO
  estado             TEXT DEFAULT 'REGISTRADO',
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE detalle_mermas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merma_id        UUID REFERENCES mermas(id) ON DELETE CASCADE,
  codigo_producto TEXT REFERENCES productos(codigo),
  nombre_producto TEXT,     -- snapshot
  cantidad        NUMERIC NOT NULL,
  unidad_medida   TEXT,
  motivo          TEXT,     -- Validado en app: ver lib/mermas.ts; valores históricos permitidos para lectura
  costo_unitario  INTEGER DEFAULT 0,  -- snapshot
  costo_total     INTEGER DEFAULT 0   -- snapshot
);

-- ─── CARTA / COSTOS ──────────────────────────────────────────
-- precio_carta SIEMPRE incluye IVA (19%). Nunca recalcular.
-- costo_bruto = costo_neto × 1.19
-- margen = (precio_carta - costo_bruto) / precio_carta
CREATE TABLE carta (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_softland TEXT,           -- TEXT — puede tener cero inicial
  nombre       TEXT NOT NULL,
  categoria    TEXT NOT NULL,  -- PICADAS | CLÁSICOS | SANDWICH & BURGERS | ENSALADAS | POSTRES | CATERING
  tipo_carta   TEXT NOT NULL DEFAULT 'ANTIGUA',
  precio_carta INTEGER,        -- CON IVA — jamás recalcular
  activo       BOOLEAN DEFAULT true,
  foto_url     TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE carta_ingredientes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carta_id        UUID REFERENCES carta(id) ON DELETE CASCADE,
  codigo_producto TEXT REFERENCES productos(codigo),
  pp_id           UUID REFERENCES pp(id),
  nombre          TEXT,
  cantidad        NUMERIC NOT NULL,
  unidad_medida   TEXT,
  precio_unitario NUMERIC,
  costo_total     NUMERIC
);


-- ============================================================
-- PASO 3: ÍNDICES DE PERFORMANCE
-- ============================================================

CREATE INDEX idx_produccion_fecha         ON produccion(fecha);
CREATE INDEX idx_produccion_responsable   ON produccion(responsable_id);
CREATE INDEX idx_detalle_prod_produccion  ON detalle_produccion(produccion_id);
CREATE INDEX idx_rendimiento_produccion   ON rendimiento(produccion_id);
CREATE INDEX idx_rendimiento_fecha        ON rendimiento(fecha);
CREATE INDEX idx_colacion_fecha           ON colacion(fecha);
CREATE INDEX idx_detalle_col_colacion     ON detalle_colacion(colacion_id);
CREATE INDEX idx_frutas_fecha             ON frutas(fecha);
CREATE INDEX idx_detalle_frutas_fruta     ON detalle_frutas(fruta_id);
CREATE INDEX idx_inventarios_fecha        ON inventarios(fecha);
CREATE INDEX idx_detalle_inventario       ON detalle_inventario(inventario_id);
CREATE INDEX idx_mermas_fecha             ON mermas(fecha);
CREATE INDEX idx_detalle_mer_merma        ON detalle_mermas(merma_id);
CREATE INDEX idx_productos_activo         ON productos(activo);
CREATE INDEX idx_pp_activo                ON pp(activo);


-- ============================================================
-- PASO 4: ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE responsables         ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_ingredientes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE verduras              ENABLE ROW LEVEL SECURITY;
ALTER TABLE produccion            ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_produccion    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendimiento           ENABLE ROW LEVEL SECURITY;
ALTER TABLE colacion              ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_colacion      ENABLE ROW LEVEL SECURITY;
ALTER TABLE frutas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_frutas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventarios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_inventario    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mermas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_mermas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE carta                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE carta_ingredientes    ENABLE ROW LEVEL SECURITY;

-- Política: solo usuarios autenticados de Kunstmann pueden leer
-- (las políticas de escritura se refinan por rol en el middleware Next.js)
CREATE POLICY "Acceso autenticado" ON responsables
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON productos
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON pp
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON pp_ingredientes
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON verduras
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON produccion
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON detalle_produccion
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON rendimiento
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON colacion
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON detalle_colacion
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON frutas
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON detalle_frutas
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON inventarios
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON detalle_inventario
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON mermas
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON detalle_mermas
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON carta
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso autenticado" ON carta_ingredientes
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- PASO 5: DATOS MAESTROS INICIALES
-- ============================================================

-- Responsables
-- admin: acceso total (ycaro + jsepulveda) — pueden hacer todo
-- finanzas: KPIs, costos, historial, export (solo lectura operaciones)
-- jefatura: dashboard, historial, export
-- cocina: registrar producción, colación, mermas, historial
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
  email = EXCLUDED.email, rol = EXCLUDED.rol,
  color_hex = EXCLUDED.color_hex, iniciales = EXCLUDED.iniciales;

-- Verduras (base del módulo de rendimiento)
INSERT INTO verduras (nombre) VALUES
  ('PALTA (KG)'),
  ('CEBOLLA MORADA (KG)'),
  ('CEBOLLA BLANCA (KG)'),
  ('LIMON (KG)'),
  ('MORRON (KG)'),
  ('TOMATE (KG)'),
  ('AJI VERDE (KG)')
ON CONFLICT (nombre) DO NOTHING;
