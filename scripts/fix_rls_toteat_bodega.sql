-- Correccion si se ejecuto supabase_toteat_bodega.sql con "Run and enable RLS".
-- Ejecutar en Supabase SQL Editor con "Run without RLS".

alter table if exists public.ventas_toteat disable row level security;
alter table if exists public.productos_criticos_bodega disable row level security;
alter table if exists public.control_bodega_cocina disable row level security;

-- Confirmacion visual: rowsecurity debe quedar en false para estas tablas.
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'ventas_toteat',
    'productos_criticos_bodega',
    'control_bodega_cocina'
  )
order by tablename;
