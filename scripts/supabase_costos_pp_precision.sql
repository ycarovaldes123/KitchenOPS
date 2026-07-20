-- KitchenOPS - precision para costos PP por GR/CC
-- Ejecutar en Supabase SQL Editor antes de reimportar recetas PP.
-- Permite costos unitarios fraccionarios como 0.856 CLP/GR.

-- Dropear vista que depende de columnas de pp_recetas (SELECT * incluye las columnas a alterar)
DROP VIEW IF EXISTS public.v_pp_recetas_activas;

alter table public.productos
  alter column costo_promedio type numeric(14,6)
  using costo_promedio::numeric;

alter table public.pp_recetas
  alter column costo_unitario_calculado type numeric(14,6)
  using costo_unitario_calculado::numeric,
  alter column costo_total_calculado type numeric(14,6)
  using costo_total_calculado::numeric;

alter table public.pp_receta_ingredientes
  alter column costo_unitario_snap type numeric(14,6)
  using costo_unitario_snap::numeric,
  alter column costo_linea_calculado type numeric(14,6)
  using costo_linea_calculado::numeric;

alter table public.detalle_produccion
  alter column costo_unitario type numeric(14,6)
  using costo_unitario::numeric;

-- Recrear la vista
CREATE OR REPLACE VIEW public.v_pp_recetas_activas AS
  SELECT * FROM public.pp_recetas
  WHERE activo = true AND estado_workflow = 'aprobado';

COMMENT ON VIEW public.v_pp_recetas_activas IS
  'Recetas vigentes y aprobadas — las que se usan para calcular costos de producción';
