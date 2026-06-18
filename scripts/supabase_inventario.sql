-- KitchenOPS - modulo toma de inventario
-- Ejecutar en Supabase SQL Editor con "Run without RLS" si la tabla no existe aun.

create table if not exists public.inventarios (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  responsable_id uuid references public.responsables(id),
  responsable_nombre text not null,
  observacion text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.detalle_inventario (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid references public.inventarios(id) on delete cascade,
  ubicacion text not null,
  codigo_producto text references public.productos(codigo),
  nombre_producto text,
  cantidad numeric not null,
  unidad_medida text,
  updated_at timestamptz,
  updated_by text,
  updated_by_rol text
);

create index if not exists idx_inventarios_fecha
  on public.inventarios(fecha);

create index if not exists idx_detalle_inventario_inventario
  on public.detalle_inventario(inventario_id);

create index if not exists idx_detalle_inventario_ubicacion
  on public.detalle_inventario(ubicacion);

alter table public.inventarios enable row level security;
alter table public.detalle_inventario enable row level security;

create policy "Acceso autenticado" on public.inventarios
  for all using (auth.role() = 'authenticated');

create policy "Acceso autenticado" on public.detalle_inventario
  for all using (auth.role() = 'authenticated');
