-- Ajusta productos criticos de Bodega Cocina al Excel:
-- "05. Planilla Control Carnes Mayo 2026.xlsx"
-- Ejecutar en Supabase SQL Editor con "Run without RLS".

update public.productos_criticos_bodega
set activo = false,
    updated_at = now();

with excel_productos(codigo_producto, categoria) as (
  values
    ('0301001', 'CARNES ROJAS'),
    ('0301002', 'CARNES ROJAS'),
    ('0301003', 'CARNES ROJAS'),
    ('0301004', 'CARNES ROJAS'),
    ('0301005', 'CARNES ROJAS'),
    ('0301007', 'CARNES ROJAS'),
    ('0301008', 'CARNES ROJAS'),
    ('0301018', 'CARNES ROJAS'),
    ('0301010', 'CARNES ROJAS'),
    ('0301011', 'CARNES ROJAS'),
    ('0301012', 'CARNES ROJAS'),
    ('0301013', 'CARNES ROJAS'),
    ('0301014', 'CARNES ROJAS'),
    ('0301016', 'CARNES ROJAS'),
    ('0301009', 'CARNES ROJAS'),
    ('0301020', 'CARNES ROJAS'),
    ('0301025', 'CARNES ROJAS'),
    ('0301027', 'CARNES ROJAS'),
    ('0301029', 'CARNES ROJAS'),
    ('0301031', 'CARNES ROJAS'),
    ('0301032', 'CARNES ROJAS'),
    ('0301044', 'CARNES ROJAS'),
    ('0301046', 'CARNES ROJAS'),
    ('0301048', 'CARNES ROJAS'),
    ('0301050', 'CARNES ROJAS'),
    ('0302001', 'CARNES AVE'),
    ('0302003', 'CARNES AVE'),
    ('0303001', 'PESCADOS'),
    ('0303006', 'PESCADOS'),
    ('0303008', 'PESCADOS'),
    ('0303014', 'PESCADOS'),
    ('0303020', 'PESCADOS'),
    ('0303021', 'PESCADOS'),
    ('0304001', 'EMBUTIDOS'),
    ('0304002', 'EMBUTIDOS'),
    ('0304003', 'EMBUTIDOS'),
    ('0304007', 'EMBUTIDOS'),
    ('0304011', 'EMBUTIDOS'),
    ('0304012', 'EMBUTIDOS'),
    ('0304015', 'EMBUTIDOS'),
    ('0502023', 'PRODUCTOS PROCESADOS'),
    ('0502027', 'PRODUCTOS PROCESADOS'),
    ('0502031', 'PRODUCTOS PROCESADOS'),
    ('0502202', 'PRODUCTOS PROCESADOS'),
    ('0502207', 'PRODUCTOS PROCESADOS'),
    ('0502261', 'PRODUCTOS PROCESADOS'),
    ('0502230', 'PRODUCTOS PROCESADOS'),
    ('0502267', 'PRODUCTOS PROCESADOS'),
    ('0502279', 'PRODUCTOS PROCESADOS')
)
insert into public.productos_criticos_bodega (codigo_producto, categoria, activo)
select e.codigo_producto, e.categoria, true
from excel_productos e
join public.productos p on p.codigo = e.codigo_producto
on conflict (codigo_producto) do update
set categoria = excluded.categoria,
    activo = true,
    updated_at = now();

select
  'productos_criticos_activos' as control,
  count(*) as total
from public.productos_criticos_bodega
where activo = true;
