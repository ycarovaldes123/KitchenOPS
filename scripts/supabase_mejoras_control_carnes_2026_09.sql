-- Mejoras Control de Carnes (2026-09). Aplicado en Supabase Cloud vía
-- scripts/mejoras-control-carnes-2026-09.mjs (idempotente). Este archivo deja el cambio
-- versionado para reproducirlo en otro entorno. Ejecutar en el SQL Editor.

begin;

-- 1. Salmón trozo: agregar paréntesis de cierre faltante.
update public.carnicos_productos set nombre = 'PP SALMON TROZO GR (250)', updated_at = now()
  where nombre = 'PP SALMON TROZO GR (250';
update public.carnicos_platos       set producto_nombre = 'PP SALMON TROZO GR (250)' where producto_nombre = 'PP SALMON TROZO GR (250';
update public.carnicos_movimientos  set producto_nombre = 'PP SALMON TROZO GR (250)' where producto_nombre = 'PP SALMON TROZO GR (250';
update public.carnicos_inventarios  set producto_nombre = 'PP SALMON TROZO GR (250)' where producto_nombre = 'PP SALMON TROZO GR (250';

-- 2. Salmón ceviche: PP SALMON CEVICHE GR -> PP SALMON CEVICHE (GR).
update public.carnicos_productos set nombre = 'PP SALMON CEVICHE (GR)', updated_at = now()
  where nombre = 'PP SALMON CEVICHE GR';
update public.carnicos_platos       set producto_nombre = 'PP SALMON CEVICHE (GR)' where producto_nombre = 'PP SALMON CEVICHE GR';
update public.carnicos_movimientos  set producto_nombre = 'PP SALMON CEVICHE (GR)' where producto_nombre = 'PP SALMON CEVICHE GR';
update public.carnicos_inventarios  set producto_nombre = 'PP SALMON CEVICHE (GR)' where producto_nombre = 'PP SALMON CEVICHE GR';

-- 3. MECHADA: "PP MECHADA NIDO GR (100 GR)" deja de usarse; sus movimientos/relaciones pasan a
--    "PP MECHADA 100 GR RENDIMIENTO = 0.5 PP PLATEADA".
do $$
declare
  nido uuid := (select id from public.carnicos_productos where nombre = 'PP MECHADA NIDO GR (100 GR)');
  cien uuid := (select id from public.carnicos_productos where nombre = 'PP MECHADA 100 GR RENDIMIENTO = 0.5 PP PLATEADA');
  r record;
begin
  if nido is null then raise notice 'MECHADA NIDO ya no existe, nada que hacer'; return; end if;
  if cien is null then raise exception 'No existe el producto destino MECHADA 100 GR'; end if;

  -- inventarios: en colisión (misma fecha/bodega/tipo) se suma la cantidad NIDO al conteo 100GR.
  for r in
    select n.id as nido_id, c.id as cien_id, n.cantidad as cant
    from public.carnicos_inventarios n
    join public.carnicos_inventarios c
      on c.producto_id = cien and c.fecha = n.fecha and c.bodega = n.bodega and c.tipo = n.tipo
    where n.producto_id = nido
  loop
    update public.carnicos_inventarios set cantidad = cantidad + r.cant where id = r.cien_id;
    delete from public.carnicos_inventarios where id = r.nido_id;
  end loop;
  update public.carnicos_inventarios
    set producto_id = cien, producto_nombre = 'PP MECHADA 100 GR RENDIMIENTO = 0.5 PP PLATEADA'
    where producto_id = nido;

  -- ventas_registradas: en colisión (misma fecha/codigo_toteat) se elimina la de NIDO.
  delete from public.carnicos_ventas_registradas n
    where n.producto_id = nido
      and exists (select 1 from public.carnicos_ventas_registradas c
                  where c.producto_id = cien and c.fecha = n.fecha and c.codigo_toteat = n.codigo_toteat);
  update public.carnicos_ventas_registradas set producto_id = cien where producto_id = nido;

  update public.carnicos_movimientos
    set producto_id = cien, producto_nombre = 'PP MECHADA 100 GR RENDIMIENTO = 0.5 PP PLATEADA'
    where producto_id = nido;
  update public.carnicos_platos
    set producto_id = cien, producto_nombre = 'PP MECHADA 100 GR RENDIMIENTO = 0.5 PP PLATEADA', codigo_producto = '0502031'
    where producto_id = nido;

  update public.carnicos_productos set activo = false, updated_at = now() where id = nido;
end $$;

-- 4. OSOBUCO PP + relación con el código de venta K15041 (OSOBUCO CON PASTELERA DE CHOCLO).
insert into public.carnicos_productos (tipo, codigo, nombre, unidad_medida, es_pp, activo, costo_unitario)
values ('PRODUCTOS PROCESADOS', '0301042', 'PP OSOBUCO (UND)', 'UN', true, true, 3214)
on conflict (nombre) do update set
  tipo = excluded.tipo, codigo = excluded.codigo, unidad_medida = excluded.unidad_medida,
  es_pp = excluded.es_pp, activo = excluded.activo, costo_unitario = excluded.costo_unitario, updated_at = now();

insert into public.carnicos_platos (categoria, codigo_toteat, plato_nombre, producto_id, codigo_producto, producto_nombre, unidad_medida, cantidad, activo)
select 'PLATOS', 'K15041', 'OSOBUCO CON PASTELERA DE CHOCLO', p.id, '0301042', 'PP OSOBUCO (UND)', 'UN', 1, true
from public.carnicos_productos p where p.nombre = 'PP OSOBUCO (UND)'
on conflict (codigo_toteat, producto_nombre) do update set
  categoria = excluded.categoria, plato_nombre = excluded.plato_nombre, producto_id = excluded.producto_id,
  codigo_producto = excluded.codigo_producto, unidad_medida = excluded.unidad_medida,
  cantidad = excluded.cantidad, activo = excluded.activo, updated_at = now();

commit;

notify pgrst, 'reload schema';
