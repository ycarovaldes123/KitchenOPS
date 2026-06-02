-- Soporte para mermar platos preparados.
-- Ejecutar en Supabase SQL Editor con "Run without RLS" antes de usar la nueva UI.

create table if not exists public.detalle_mermas_platos (
  id uuid primary key default gen_random_uuid(),
  merma_id uuid not null references public.mermas(id) on delete cascade,
  carta_id uuid null references public.carta(id) on delete set null,
  nombre_plato text not null,
  cantidad numeric not null check (cantidad > 0),
  motivo text null,
  costo_unitario numeric not null default 0,
  costo_total numeric not null default 0,
  observacion text null,
  created_at timestamptz not null default now()
);

create table if not exists public.detalle_mermas_platos_insumos (
  id uuid primary key default gen_random_uuid(),
  detalle_merma_plato_id uuid not null references public.detalle_mermas_platos(id) on delete cascade,
  carta_ingrediente_id uuid null,
  codigo_producto text null references public.productos(codigo) on delete set null,
  pp_id uuid null references public.pp(id) on delete set null,
  nombre text not null,
  cantidad_unitaria numeric not null default 0,
  cantidad_total numeric not null default 0,
  unidad_medida text null,
  precio_unitario numeric not null default 0,
  costo_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_detalle_mermas_platos_merma_id
  on public.detalle_mermas_platos(merma_id);

create index if not exists idx_detalle_mermas_platos_carta_id
  on public.detalle_mermas_platos(carta_id);

create index if not exists idx_detalle_mermas_platos_insumos_plato_id
  on public.detalle_mermas_platos_insumos(detalle_merma_plato_id);
