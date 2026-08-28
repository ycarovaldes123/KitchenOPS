-- Agrega el producto LONGANIZA (KG) a la categoria EMBUTIDOS en Control Carnicos.
-- Ejecutar en Supabase SQL Editor (o via scripts/import-carnicos-excel.mjs si ya esta en el Excel fuente).

insert into public.carnicos_productos (tipo, codigo, nombre, unidad_medida, es_pp, activo)
values ('EMBUTIDOS', '0304009', 'LONGANIZA (KG)', 'KG', false, true)
on conflict (nombre) do update set
  tipo = excluded.tipo,
  codigo = excluded.codigo,
  unidad_medida = excluded.unidad_medida,
  activo = true,
  updated_at = now();

notify pgrst, 'reload schema';
