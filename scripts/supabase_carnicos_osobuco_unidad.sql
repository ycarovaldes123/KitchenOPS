-- Control Carnicos -- reemplaza OSOBUCO VACUNO KG (0301049) por OSOBUCO VACUNO UNID. (0301042).
-- Ya aplicado directamente en Supabase el 2026-09-03. Este script deja el cambio versionado
-- por si se necesita reproducir en otro entorno.

delete from public.carnicos_productos where codigo = '0301049';

insert into public.carnicos_productos (tipo, codigo, nombre, unidad_medida, es_pp, activo, costo_unitario)
values ('CARNES ROJAS', '0301042', 'OSOBUCO VACUNO UNID.', 'UN', false, true, 2056.20)
on conflict (nombre) do update set
  tipo = excluded.tipo,
  codigo = excluded.codigo,
  unidad_medida = excluded.unidad_medida,
  es_pp = excluded.es_pp,
  activo = excluded.activo,
  costo_unitario = excluded.costo_unitario,
  updated_at = now();

notify pgrst, 'reload schema';
