-- Integracion TOTEAT + control de bodega cocina.
-- Ejecutar en Supabase SQL Editor con "Run without RLS".

create table if not exists public.ventas_toteat (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  order_id text null,
  product_code text null,
  product_name text not null,
  category text null,
  quantity numeric not null default 0,
  gross_amount numeric null,
  net_amount numeric null,
  source_key text not null,
  raw jsonb not null default '{}'::jsonb,
  synced_by text null,
  synced_at timestamptz not null default now()
);

create unique index if not exists idx_ventas_toteat_source_key
  on public.ventas_toteat(source_key);

create index if not exists idx_ventas_toteat_fecha
  on public.ventas_toteat(fecha);

create index if not exists idx_ventas_toteat_product_code
  on public.ventas_toteat(product_code);

create table if not exists public.productos_criticos_bodega (
  codigo_producto text primary key references public.productos(codigo) on delete cascade,
  categoria text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.control_bodega_cocina (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  codigo_producto text not null references public.productos(codigo),
  producto_nombre text not null,
  unidad_medida text not null,
  categoria text not null,
  inventario_inicial numeric not null default 0,
  compras numeric not null default 0,
  producto_terminado numeric not null default 0,
  ventas numeric not null default 0,
  ajuste_produccion numeric not null default 0,
  mermas numeric not null default 0,
  colacion numeric not null default 0,
  inventario_final numeric not null default 0,
  stock_cocina numeric not null default 0,
  stock_mantencion numeric not null default 0,
  stock_congelado numeric not null default 0,
  observacion text null,
  responsable_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fecha, codigo_producto)
);

create index if not exists idx_control_bodega_fecha
  on public.control_bodega_cocina(fecha);

create index if not exists idx_control_bodega_categoria
  on public.control_bodega_cocina(categoria);

insert into public.productos_criticos_bodega (codigo_producto, categoria)
select codigo, 'CARNES ROJAS'
from public.productos
where codigo in (
  '0301001','0301002','0301003','0301004','0301005','0301007','0301008','0301011',
  '0301012','0301013','0301014','0301029','0301031','0301032','0301044','0301046',
  '0301048','0301050'
)
on conflict (codigo_producto) do update set categoria = excluded.categoria, activo = true, updated_at = now();

insert into public.productos_criticos_bodega (codigo_producto, categoria)
select codigo, 'CARNES AVE'
from public.productos
where codigo in ('0302001','0302003')
on conflict (codigo_producto) do update set categoria = excluded.categoria, activo = true, updated_at = now();

insert into public.productos_criticos_bodega (codigo_producto, categoria)
select codigo, 'PESCADOS'
from public.productos
where codigo like '0303%'
on conflict (codigo_producto) do update set categoria = excluded.categoria, activo = true, updated_at = now();

insert into public.productos_criticos_bodega (codigo_producto, categoria)
select codigo, 'EMBUTIDOS'
from public.productos
where codigo like '0304%'
on conflict (codigo_producto) do update set categoria = excluded.categoria, activo = true, updated_at = now();

insert into public.productos_criticos_bodega (codigo_producto, categoria)
select codigo, 'PRODUCTOS PROCESADOS'
from public.productos
where codigo like '0502%'
on conflict (codigo_producto) do update set categoria = excluded.categoria, activo = true, updated_at = now();
