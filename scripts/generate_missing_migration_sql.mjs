import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const repoDir = path.resolve(process.cwd());
const rootDir = path.resolve(repoDir, '..');
const workbookPath = path.join(rootDir, 'PEDIDOS PRODUCCION EN PROCESO 2026  actualizar.xlsx');
const outputPath = path.join(rootDir, 'Analisis del sistema', 'migracion_faltantes_mayo_2026.sql');
const envPath = path.join(repoDir, '.env.local');

const missingProduccionIds = [
  '2f6f5d7a', '804a2e56', '125f3588', 'efe3555b', '214f9e63',
  '121cfd59', 'a8d5377b', '03b2c198', '94706dc5', 'c2d1ed3b',
  'e627d35d', 'ac2a2fb3', '7e04cf08', '4acdcb72', '92d0619b',
  '78fa4715', '810250ec', '00d62a4e', '1009cd96', '5d702bd4',
];

const missingMermaIds = [
  '543cda6c', '5bb4c1fb', '503abf16', '5fab449e', '4d553834',
  '9cc214d9', 'abcb958d', '1d98bef3', 'b2ce4e0b', '252176d5',
  'bdb64b94', '69e6f4b8', 'cade8e97', 'b290f64e', '013d6b0b',
  'c92682c0', '2dbc4f3f',
];

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
}

function dmyToIso(value) {
  const match = String(value ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new Error(`Fecha invalida: ${value}`);
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error(`Numero invalido: ${value}`);
  return number;
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sqlString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function sqlNullableString(value) {
  return value === null || value === undefined ? 'null' : sqlString(value);
}

function sqlNullableNumber(value) {
  return value === null || value === undefined ? 'null' : String(value);
}

function rowsToValues(rows, columns) {
  return rows
    .map((row) => `  (${columns.map((col) => row[col]).join(', ')})`)
    .join(',\n');
}

async function main() {
  const env = parseEnv(await fs.readFile(envPath, 'utf8'));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const workbook = XLSX.readFile(workbookPath, { cellDates: true, cellStyles: true });

  const produccionRows = XLSX.utils
    .sheet_to_json(workbook.Sheets.PRODUCCION, { defval: null, raw: false })
    .filter((row) => missingProduccionIds.includes(row.IDPRODUCCION))
    .map((row) => ({
      legacy_id: sqlString(row.IDPRODUCCION),
      fecha: sqlString(dmyToIso(row.FECHA)),
      responsable_nombre: sqlString(row.RESPONSABLE),
      turno: sqlString(row.TURNO),
      observacion: sqlString(row.OBSERVACION ?? ''),
    }));

  const detalleRows = XLSX.utils
    .sheet_to_json(workbook.Sheets.DETALLE, { defval: null, raw: false })
    .filter((row) => missingProduccionIds.includes(row.IDPRODUCCION))
    .map((row) => ({
      legacy_detalle_id: sqlString(row.IDDETALLE),
      legacy_prod_id: sqlString(row.IDPRODUCCION),
      fecha: sqlString(dmyToIso(row.FECHA)),
      nombre_pp: sqlString(row['P.P']),
      recetas_ref: sqlNullableNumber(toNumber(row.RECETAS)),
      cantidad: sqlNullableNumber(toNumber(row['CANTIDAD PRODUCIDA'])),
      total_legado: sqlNullableNumber(toNumber(row['TOTAL PRODUCIDO'])),
    }));

  const rendimientoRows = XLSX.utils
    .sheet_to_json(workbook.Sheets.RENDIMIENTO, { defval: null, raw: false })
    .filter((row) => missingProduccionIds.includes(row.IDPRODUCCION))
    .map((row) => ({
      legacy_rend_id: sqlString(row.IDRENDIMIENTO),
      legacy_prod_id: sqlString(row.IDPRODUCCION),
      fecha: sqlString(dmyToIso(row.FECHA)),
      verdura: sqlString(row.VERDURA),
      kg_utilizados: sqlNullableNumber(toNumber(row['KG UTILIZADOS'])),
      rendimiento_kg: sqlNullableNumber(toNumber(row.RENDIMIENTO)),
      responsable_nombre: sqlString(row.RESPONSABLE ?? ''),
    }));

  const mermaRows = XLSX.utils
    .sheet_to_json(workbook.Sheets.MERMAS, { defval: null, raw: false })
    .filter((row) => missingMermaIds.includes(row.ID_MERMAS))
    .map((row) => ({
      legacy_id: sqlString(row.ID_MERMAS),
      fecha: sqlString(dmyToIso(row.FECHA)),
      responsable_nombre: sqlString(row.IDRESPONSABLE),
      observacion: sqlString(row.OBSERVACION ?? ''),
    }));

  const detalleMermaRows = XLSX.utils
    .sheet_to_json(workbook.Sheets.Detalle_Mermas, { defval: null, raw: false })
    .filter((row) => missingMermaIds.includes(row.ID_MERMAS))
    .map((row) => ({
      legacy_detalle_id: sqlString(row.ID_DETALLE_MERMAS),
      legacy_merma_id: sqlString(row.ID_MERMAS),
      codigo_producto: sqlString(String(row.PRODUCTO)),
      cantidad: sqlNullableNumber(toNumber(row.Cantidad)),
      nombre_producto: sqlString(row.NOMBRE_PRODUCTO ?? ''),
    }));

  const [responsablesRes, ppRes, productosRes] = await Promise.all([
    supabase.from('responsables').select('nombre').limit(1000),
    supabase.from('pp').select('nombre,codigo_producto').limit(5000),
    supabase.from('productos').select('codigo').limit(10000),
  ]);

  if (responsablesRes.error) throw responsablesRes.error;
  if (ppRes.error) throw ppRes.error;
  if (productosRes.error) throw productosRes.error;

  const responsableNames = new Set((responsablesRes.data ?? []).map((row) => normalizeText(row.nombre)));
  const ppNames = new Set((ppRes.data ?? []).map((row) => normalizeText(row.nombre)));
  const productoCodes = new Set((productosRes.data ?? []).map((row) => String(row.codigo)));

  const missingResponsables = [
    ...new Set(
      [
        ...produccionRows.map((row) => row.responsable_nombre),
        ...mermaRows.map((row) => row.responsable_nombre),
      ]
        .map((value) => String(value).slice(1, -1).replace(/''/g, "'"))
        .filter((value) => !responsableNames.has(normalizeText(value))),
    ),
  ];

  const missingPps = [
    ...new Set(
      detalleRows
        .map((row) => String(row.nombre_pp).slice(1, -1).replace(/''/g, "'"))
        .filter((value) => !ppNames.has(normalizeText(value))),
    ),
  ];

  const missingProductos = [
    ...new Set(
      detalleMermaRows
        .map((row) => String(row.codigo_producto).slice(1, -1))
        .filter((value) => !productoCodes.has(value)),
    ),
  ];

  if (missingResponsables.length) {
    throw new Error(`Responsables faltantes en maestros: ${missingResponsables.join(', ')}`);
  }
  if (missingPps.length) {
    throw new Error(`PP faltantes en maestros: ${missingPps.join(', ')}`);
  }
  if (missingProductos.length) {
    throw new Error(`Productos faltantes en maestros: ${missingProductos.join(', ')}`);
  }

  const ppNormalizationSql = "regexp_replace(upper(p.nombre), '[^A-Z0-9]+', '', 'g') = regexp_replace(upper(d.nombre_pp), '[^A-Z0-9]+', '', 'g')";

  const sql = `-- Migracion faltantes mayo 2026
-- Fuente: PEDIDOS PRODUCCION EN PROCESO 2026  actualizar.xlsx
-- Generado: ${new Date().toISOString()}
-- Nota: PP ENTRAÑA PR existe en maestros sin codigo_producto, por lo que esas lineas quedaran con costo_unitario = 0.

begin;

set local search_path = public, pg_temp;

create temp table tmp_prod (
  legacy_id text primary key,
  fecha date not null,
  responsable_nombre text not null,
  turno text not null,
  observacion text not null
) on commit drop;

insert into tmp_prod (legacy_id, fecha, responsable_nombre, turno, observacion) values
${rowsToValues(produccionRows, ['legacy_id', 'fecha', 'responsable_nombre', 'turno', 'observacion'])};

create temp table tmp_prod_det (
  legacy_detalle_id text primary key,
  legacy_prod_id text not null,
  fecha date not null,
  nombre_pp text not null,
  recetas_ref numeric null,
  cantidad numeric not null,
  total_legado numeric null
) on commit drop;

insert into tmp_prod_det (legacy_detalle_id, legacy_prod_id, fecha, nombre_pp, recetas_ref, cantidad, total_legado) values
${rowsToValues(detalleRows, ['legacy_detalle_id', 'legacy_prod_id', 'fecha', 'nombre_pp', 'recetas_ref', 'cantidad', 'total_legado'])};

create temp table tmp_rend (
  legacy_rend_id text primary key,
  legacy_prod_id text not null,
  fecha date not null,
  verdura text not null,
  kg_utilizados numeric not null,
  rendimiento_kg numeric not null,
  responsable_nombre text not null
) on commit drop;

insert into tmp_rend (legacy_rend_id, legacy_prod_id, fecha, verdura, kg_utilizados, rendimiento_kg, responsable_nombre) values
${rowsToValues(rendimientoRows, ['legacy_rend_id', 'legacy_prod_id', 'fecha', 'verdura', 'kg_utilizados', 'rendimiento_kg', 'responsable_nombre'])};

create temp table tmp_merma (
  legacy_id text primary key,
  fecha date not null,
  responsable_nombre text not null,
  observacion text not null
) on commit drop;

insert into tmp_merma (legacy_id, fecha, responsable_nombre, observacion) values
${rowsToValues(mermaRows, ['legacy_id', 'fecha', 'responsable_nombre', 'observacion'])};

create temp table tmp_merma_det (
  legacy_detalle_id text primary key,
  legacy_merma_id text not null,
  codigo_producto text not null,
  cantidad numeric not null,
  nombre_producto text not null
) on commit drop;

insert into tmp_merma_det (legacy_detalle_id, legacy_merma_id, codigo_producto, cantidad, nombre_producto) values
${rowsToValues(detalleMermaRows, ['legacy_detalle_id', 'legacy_merma_id', 'codigo_producto', 'cantidad', 'nombre_producto'])};

do $$
begin
  if exists (
    select 1
    from tmp_prod p
    left join public.responsables r on upper(r.nombre) = upper(p.responsable_nombre)
    where r.id is null
  ) then
    raise exception 'Hay responsables de produccion que no existen en maestros';
  end if;

  if exists (
    select 1
    from tmp_merma m
    left join public.responsables r on upper(r.nombre) = upper(m.responsable_nombre)
    where r.id is null
  ) then
    raise exception 'Hay responsables de merma que no existen en maestros';
  end if;

  if exists (
    select 1
    from (
      select distinct nombre_pp from tmp_prod_det
    ) d
    left join lateral (
      select p.id
      from public.pp p
      where ${ppNormalizationSql}
      limit 1
    ) p on true
    where p.id is null
  ) then
    raise exception 'Hay PP de legado que no existen en maestros';
  end if;

  if exists (
    select 1
    from tmp_merma_det d
    left join public.productos p on p.codigo = d.codigo_producto
    where p.codigo is null
  ) then
    raise exception 'Hay productos de merma que no existen en maestros';
  end if;
end $$;

create temp table ins_prod on commit drop as
with inserted as (
  insert into public.produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado, correo_enviado)
  select
    gen_random_uuid(),
    p.fecha,
    r.id,
    p.responsable_nombre,
    p.turno,
    p.observacion,
    'REGISTRADO',
    false
  from tmp_prod p
  join public.responsables r on upper(r.nombre) = upper(p.responsable_nombre)
  where not exists (
    select 1
    from public.produccion x
    where x.fecha = p.fecha
      and upper(x.responsable_nombre) = upper(p.responsable_nombre)
      and x.turno = p.turno
      and coalesce(trim(x.observacion), '') = coalesce(trim(p.observacion), '')
  )
  returning id, fecha, responsable_nombre, turno, observacion
)
select * from inserted;

create temp table prod_map on commit drop as
select
  p.legacy_id,
  x.id as produccion_id
from tmp_prod p
join public.produccion x
  on x.fecha = p.fecha
 and upper(x.responsable_nombre) = upper(p.responsable_nombre)
 and x.turno = p.turno
 and coalesce(trim(x.observacion), '') = coalesce(trim(p.observacion), '');

create temp table pp_map on commit drop as
select
  d.nombre_pp,
  p.id as pp_id,
  p.tipo_pp,
  p.gramos_por_pp,
  p.codigo_producto
from (
  select distinct nombre_pp
  from tmp_prod_det
) d
join lateral (
  select p.*
  from public.pp p
  where ${ppNormalizationSql}
  order by p.nombre
  limit 1
) p on true;

create temp table ins_prod_det on commit drop as
with resolved as (
  select
    gen_random_uuid() as id,
    pm.produccion_id,
    pp.pp_id,
    d.nombre_pp,
    pp.tipo_pp,
    d.cantidad,
    case
      when pp.tipo_pp in ('CC', 'DIRECTO') then pp.gramos_por_pp
      when d.total_legado is not null and d.cantidad <> 0 then round((d.total_legado / d.cantidad)::numeric, 3)
      else pp.gramos_por_pp
    end as gramos_por_pp,
    coalesce(
      d.total_legado,
      case
        when pp.tipo_pp in ('CC', 'DIRECTO') then d.cantidad
        when pp.gramos_por_pp is not null then d.cantidad * pp.gramos_por_pp
        else null
      end
    ) as total_producido,
    d.recetas_ref,
    pp.codigo_producto,
    coalesce(prod.costo_promedio, 0) as costo_unitario,
    case
      when pp.tipo_pp = 'DIRECTO' then round(d.cantidad * coalesce(prod.costo_promedio, 0))
      when prod.unidad_medida in ('KG', 'LT') then round((coalesce(d.total_legado, 0) / 1000.0) * coalesce(prod.costo_promedio, 0))
      when prod.unidad_medida = 'GR' then round(coalesce(d.total_legado, 0) * coalesce(prod.costo_promedio, 0))
      else round(coalesce(d.total_legado, d.cantidad) * coalesce(prod.costo_promedio, 0))
    end as costo_total
  from tmp_prod_det d
  join prod_map pm on pm.legacy_id = d.legacy_prod_id
  join pp_map pp on pp.nombre_pp = d.nombre_pp
  left join public.productos prod on prod.codigo = pp.codigo_producto
),
inserted as (
insert into public.detalle_produccion (
  id,
  produccion_id,
  pp_id,
  nombre_pp,
  tipo_pp,
  cantidad,
  gramos_por_pp,
  total_producido,
  recetas_ref,
  codigo_producto,
  costo_unitario,
  costo_total
)
select
  r.id,
  r.produccion_id,
  r.pp_id,
  r.nombre_pp,
  r.tipo_pp,
  r.cantidad,
  r.gramos_por_pp,
  r.total_producido,
  r.recetas_ref,
  r.codigo_producto,
  r.costo_unitario,
  r.costo_total
from resolved r
where not exists (
  select 1
  from public.detalle_produccion x
  where x.produccion_id = r.produccion_id
    and upper(x.nombre_pp) = upper(r.nombre_pp)
    and x.cantidad = r.cantidad
    and coalesce(x.recetas_ref, -1) = coalesce(r.recetas_ref, -1)
    and coalesce(x.total_producido, -1) = coalesce(r.total_producido, -1)
)
returning id, produccion_id, nombre_pp, cantidad
)
select * from inserted;

create temp table ins_rend on commit drop as
with inserted as (
insert into public.rendimiento (
  id,
  produccion_id,
  fecha,
  verdura,
  kg_utilizados,
  rendimiento_kg,
  responsable_nombre
)
select
  gen_random_uuid(),
  pm.produccion_id,
  r.fecha,
  r.verdura,
  r.kg_utilizados,
  r.rendimiento_kg,
  r.responsable_nombre
from tmp_rend r
join prod_map pm on pm.legacy_id = r.legacy_prod_id
where not exists (
  select 1
  from public.rendimiento x
  where x.produccion_id = pm.produccion_id
    and upper(x.verdura) = upper(r.verdura)
    and x.kg_utilizados = r.kg_utilizados
    and x.rendimiento_kg = r.rendimiento_kg
)
returning id, produccion_id, verdura
)
select * from inserted;

create temp table ins_merma on commit drop as
with inserted as (
  insert into public.mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  select
    gen_random_uuid(),
    m.fecha,
    r.id,
    m.responsable_nombre,
    m.observacion,
    'REGISTRADO'
  from tmp_merma m
  join public.responsables r on upper(r.nombre) = upper(m.responsable_nombre)
  where not exists (
    select 1
    from public.mermas x
    where x.fecha = m.fecha
      and upper(x.responsable_nombre) = upper(m.responsable_nombre)
      and coalesce(trim(x.observacion), '') = coalesce(trim(m.observacion), '')
  )
  returning id, fecha, responsable_nombre, observacion
)
select * from inserted;

create temp table merma_map on commit drop as
select
  m.legacy_id,
  x.id as merma_id
from tmp_merma m
join public.mermas x
  on x.fecha = m.fecha
 and upper(x.responsable_nombre) = upper(m.responsable_nombre)
 and coalesce(trim(x.observacion), '') = coalesce(trim(m.observacion), '');

create temp table ins_merma_det on commit drop as
with inserted as (
insert into public.detalle_mermas (
  id,
  merma_id,
  codigo_producto,
  nombre_producto,
  cantidad,
  unidad_medida,
  motivo,
  costo_unitario,
  costo_total
)
select
  gen_random_uuid(),
  mm.merma_id,
  d.codigo_producto,
  d.nombre_producto,
  d.cantidad,
  p.unidad_medida,
  null,
  coalesce(p.costo_promedio, 0),
  round(d.cantidad * coalesce(p.costo_promedio, 0))
from tmp_merma_det d
join merma_map mm on mm.legacy_id = d.legacy_merma_id
join public.productos p on p.codigo = d.codigo_producto
where not exists (
  select 1
  from public.detalle_mermas x
  where x.merma_id = mm.merma_id
    and x.codigo_producto = d.codigo_producto
    and upper(coalesce(x.nombre_producto, '')) = upper(coalesce(d.nombre_producto, ''))
    and x.cantidad = d.cantidad
)
returning id, merma_id, codigo_producto, cantidad
)
select * from inserted;

select
  (select count(*) from tmp_prod) as staged_produccion,
  (select count(*) from ins_prod) as inserted_produccion,
  (select count(*) from tmp_prod_det) as staged_detalle_produccion,
  (select count(*) from ins_prod_det) as inserted_detalle_produccion,
  (select count(*) from tmp_rend) as staged_rendimiento,
  (select count(*) from ins_rend) as inserted_rendimiento,
  (select count(*) from tmp_merma) as staged_mermas,
  (select count(*) from ins_merma) as inserted_mermas,
  (select count(*) from tmp_merma_det) as staged_detalle_mermas,
  (select count(*) from ins_merma_det) as inserted_detalle_mermas;

commit;
`;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, sql, 'utf8');

  console.log(`SQL generado en ${outputPath}`);
  console.log(`Produccion: ${produccionRows.length}`);
  console.log(`Detalle produccion: ${detalleRows.length}`);
  console.log(`Rendimiento: ${rendimientoRows.length}`);
  console.log(`Mermas: ${mermaRows.length}`);
  console.log(`Detalle mermas: ${detalleMermaRows.length}`);
}

await main();
