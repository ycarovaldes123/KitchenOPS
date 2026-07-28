-- Control Carnicos -- esquema dedicado (NO toca productos/pp/carta/inventarios)
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.carnicos_productos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('CARNES ROJAS','CARNES AVE','PESCADOS','EMBUTIDOS','PRODUCTOS PROCESADOS')),
  codigo text not null,
  nombre text not null unique,
  unidad_medida text not null check (unidad_medida in ('KG','GR','UN','PQ','PR')),
  es_pp boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_carnicos_productos_codigo on public.carnicos_productos(codigo);
create index if not exists idx_carnicos_productos_tipo   on public.carnicos_productos(tipo);

create table if not exists public.carnicos_platos (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  codigo_toteat text not null,
  plato_nombre text not null,
  producto_id uuid null references public.carnicos_productos(id),
  codigo_producto text null,
  producto_nombre text not null,
  unidad_medida text not null,
  cantidad numeric(14,4) not null check (cantidad > 0),
  advertencia text null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (codigo_toteat, producto_nombre)
);
create index if not exists idx_carnicos_platos_codigo_toteat on public.carnicos_platos(codigo_toteat);
create index if not exists idx_carnicos_platos_producto_id   on public.carnicos_platos(producto_id);

create table if not exists public.carnicos_movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  responsable_id uuid null references public.responsables(id),
  responsable_nombre text not null,
  turno text null check (turno in ('AM','PM')),
  observacion text null default '',
  bodega text not null check (bodega in ('CAMARA CONGELADOS','CAMARA MANTENCION','COCINA','CAMARA FRIO')),
  movimiento text not null check (movimiento in ('INGRESO','SALIDA')),
  subtipo text not null check (subtipo in ('RECEPCION_BODEGA','INGRESO_PP','PRODUCCION','MERMAS','COLACION','VENTAS')),
  producto_id uuid not null references public.carnicos_productos(id),
  producto_nombre text not null,
  unidad_medida text not null,
  cantidad numeric(14,4) not null check (cantidad > 0),
  origen text not null default 'manual' check (origen in ('manual','venta_toteat')),
  created_at timestamptz not null default now(),
  created_by text null,
  constraint chk_subtipo_movimiento check (
    (movimiento = 'INGRESO' and subtipo in ('RECEPCION_BODEGA','INGRESO_PP')) or
    (movimiento = 'SALIDA'  and subtipo in ('PRODUCCION','MERMAS','COLACION','VENTAS'))
  )
);
create index if not exists idx_carnicos_mov_fecha           on public.carnicos_movimientos(fecha);
create index if not exists idx_carnicos_mov_fecha_producto  on public.carnicos_movimientos(fecha, producto_id);
create index if not exists idx_carnicos_mov_subtipo         on public.carnicos_movimientos(subtipo);

create table if not exists public.carnicos_ventas_registradas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  codigo_toteat text not null,
  plato_nombre text not null,
  cantidad_vendida numeric(14,4) not null,
  producto_id uuid not null references public.carnicos_productos(id),
  cantidad_por_plato numeric(14,4) not null,
  unidad_medida text not null,
  consumo_total numeric(14,4) not null,
  movimiento_id uuid null references public.carnicos_movimientos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (fecha, codigo_toteat, producto_id)
);
create index if not exists idx_carnicos_ventasreg_fecha on public.carnicos_ventas_registradas(fecha);

create table if not exists public.carnicos_inventarios (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  responsable_id uuid null references public.responsables(id),
  responsable_nombre text not null,
  turno text null check (turno in ('AM','PM')),
  bodega text not null check (bodega in ('CAMARA CONGELADOS','CAMARA MANTENCION','COCINA','CAMARA FRIO')),
  tipo text not null check (tipo in ('INICIAL','FINAL')),
  producto_id uuid not null references public.carnicos_productos(id),
  producto_nombre text not null,
  unidad_medida text not null,
  cantidad numeric(14,4) not null check (cantidad >= 0),
  created_at timestamptz not null default now(),
  created_by text null,
  unique (fecha, bodega, tipo, producto_id)
);
create index if not exists idx_carnicos_inv_fecha_tipo on public.carnicos_inventarios(fecha, tipo);

alter table public.carnicos_productos          enable row level security;
alter table public.carnicos_platos             enable row level security;
alter table public.carnicos_movimientos        enable row level security;
alter table public.carnicos_ventas_registradas enable row level security;
alter table public.carnicos_inventarios        enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='carnicos_productos' and policyname='Acceso autenticado') then
    create policy "Acceso autenticado" on public.carnicos_productos for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='carnicos_platos' and policyname='Acceso autenticado') then
    create policy "Acceso autenticado" on public.carnicos_platos for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='carnicos_movimientos' and policyname='Acceso autenticado') then
    create policy "Acceso autenticado" on public.carnicos_movimientos for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='carnicos_ventas_registradas' and policyname='Acceso autenticado') then
    create policy "Acceso autenticado" on public.carnicos_ventas_registradas for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='carnicos_inventarios' and policyname='Acceso autenticado') then
    create policy "Acceso autenticado" on public.carnicos_inventarios for all using (auth.role() = 'authenticated');
  end if;
end $$;

notify pgrst, 'reload schema';
