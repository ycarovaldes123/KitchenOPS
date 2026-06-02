-- Indices adicionales recomendados para KitchenOPS
-- Ejecutar en Supabase SQL Editor

-- Historial: filtra por fecha y ordena por created_at dentro del rango
CREATE INDEX IF NOT EXISTS idx_produccion_fecha_created_at
  ON produccion (fecha DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_colacion_fecha_created_at
  ON colacion (fecha DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mermas_fecha_created_at
  ON mermas (fecha DESC, created_at DESC);

-- Maestros: filtra por activo y ordena por nombre
CREATE INDEX IF NOT EXISTS idx_productos_activo_nombre
  ON productos (activo, nombre);

CREATE INDEX IF NOT EXISTS idx_pp_activo_nombre
  ON pp (activo, nombre);

CREATE INDEX IF NOT EXISTS idx_responsables_activo_nombre
  ON responsables (activo, nombre);

CREATE INDEX IF NOT EXISTS idx_verduras_activo_nombre
  ON verduras (activo, nombre);

-- Carta / joins frecuentes
CREATE INDEX IF NOT EXISTS idx_carta_activo_categoria
  ON carta (activo, categoria);

CREATE INDEX IF NOT EXISTS idx_carta_ingredientes_carta
  ON carta_ingredientes (carta_id);

CREATE INDEX IF NOT EXISTS idx_carta_ingredientes_pp
  ON carta_ingredientes (pp_id);

CREATE INDEX IF NOT EXISTS idx_carta_ingredientes_producto
  ON carta_ingredientes (codigo_producto);
