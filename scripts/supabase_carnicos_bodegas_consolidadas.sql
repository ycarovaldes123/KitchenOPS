-- Agrega la opcion BODEGAS CONSOLIDADAS a las restricciones de bodega de Control Carnicos.
-- Ejecutar en Supabase SQL Editor.

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.carnicos_movimientos'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%bodega%'
    and pg_get_constraintdef(oid) like '%CAMARA CONGELADOS%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.carnicos_movimientos drop constraint %I', constraint_name);
  end if;

  alter table public.carnicos_movimientos
    add constraint carnicos_movimientos_bodega_check
    check (bodega in ('CAMARA CONGELADOS','CAMARA MANTENCION','COCINA','CAMARA FRIO','BODEGAS CONSOLIDADAS'));

  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.carnicos_inventarios'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%bodega%'
    and pg_get_constraintdef(oid) like '%CAMARA CONGELADOS%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.carnicos_inventarios drop constraint %I', constraint_name);
  end if;

  alter table public.carnicos_inventarios
    add constraint carnicos_inventarios_bodega_check
    check (bodega in ('CAMARA CONGELADOS','CAMARA MANTENCION','COCINA','CAMARA FRIO','BODEGAS CONSOLIDADAS'));
end $$;

notify pgrst, 'reload schema';
