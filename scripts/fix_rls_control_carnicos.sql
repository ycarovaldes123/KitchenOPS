-- Correccion si supabase_control_carnicos.sql se ejecuto con "Run and enable RLS".
-- El control de acceso de Control Carnicos ya lo hace la API (requireRol(['admin'])),
-- no la base de datos, asi que RLS encendido sin una politica que cubra DELETE/UPDATE
-- hace que esas operaciones fallen en silencio (0 filas afectadas, sin error visible).
-- Ejecutar en Supabase SQL Editor.

alter table if exists public.carnicos_productos           disable row level security;
alter table if exists public.carnicos_platos               disable row level security;
alter table if exists public.carnicos_movimientos          disable row level security;
alter table if exists public.carnicos_ventas_registradas    disable row level security;
alter table if exists public.carnicos_inventarios           disable row level security;

-- Confirmacion visual: rowsecurity debe quedar en false para estas tablas.
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'carnicos_productos',
    'carnicos_platos',
    'carnicos_movimientos',
    'carnicos_ventas_registradas',
    'carnicos_inventarios'
  )
order by tablename;
