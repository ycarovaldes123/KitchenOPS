-- Soporte para informe diario de frutas/snacks del personal.
-- Ejecutar en Supabase SQL Editor con "Run without RLS" antes de usar /frutas.

create table if not exists public.frutas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  responsable_id uuid null references public.responsables(id),
  responsable_nombre text not null,
  observacion text not null default '',
  costo_total integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.detalle_frutas (
  id uuid primary key default gen_random_uuid(),
  fruta_id uuid not null references public.frutas(id) on delete cascade,
  codigo_producto text null references public.productos(codigo),
  nombre_producto text null,
  cantidad numeric not null check (cantidad >= 0),
  unidad_medida text null,
  costo_unitario numeric not null default 0,
  costo_total integer not null default 0,
  updated_at timestamptz null,
  updated_by text null,
  updated_by_rol text null
);

alter table public.frutas
  add column if not exists observacion text not null default '',
  add column if not exists costo_total integer not null default 0,
  add column if not exists created_at timestamptz not null default now();

alter table public.detalle_frutas
  add column if not exists updated_at timestamptz null,
  add column if not exists updated_by text null,
  add column if not exists updated_by_rol text null;

create index if not exists idx_frutas_fecha
  on public.frutas(fecha);

create index if not exists idx_detalle_frutas_fruta_id
  on public.detalle_frutas(fruta_id);

alter table public.frutas enable row level security;
alter table public.detalle_frutas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'frutas'
      and policyname = 'Acceso autenticado'
  ) then
    create policy "Acceso autenticado" on public.frutas
      for all using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'detalle_frutas'
      and policyname = 'Acceso autenticado'
  ) then
    create policy "Acceso autenticado" on public.detalle_frutas
      for all using (auth.role() = 'authenticated');
  end if;
end
$$;
