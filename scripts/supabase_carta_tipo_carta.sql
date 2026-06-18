-- KitchenOPS - agregar tipo_carta a carta
-- Ejecutar en Supabase SQL Editor.

alter table public.carta
  add column if not exists tipo_carta text;

update public.carta
set tipo_carta = 'ANTIGUA'
where tipo_carta is null;

alter table public.carta
  alter column tipo_carta set default 'ANTIGUA';

alter table public.carta
  alter column tipo_carta set not null;

create index if not exists idx_carta_tipo_carta
  on public.carta(tipo_carta);
