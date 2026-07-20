-- KitchenOPS - agregar codigo_producto maestro para verduras de rendimiento
-- Ejecutar en Supabase SQL Editor.

alter table public.verduras
  add column if not exists codigo_producto text references public.productos(codigo);

-- Backfill conservador por nombre exacto normalizado.
update public.verduras v
set codigo_producto = p.codigo
from public.productos p
where v.codigo_producto is null
  and upper(trim(v.nombre)) = upper(trim(p.nombre));

create index if not exists idx_verduras_codigo_producto
  on public.verduras(codigo_producto);
