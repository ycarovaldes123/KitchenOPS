-- KitchenOPS - agregar codigo_toteat a carta sin alterar datos existentes.

alter table public.carta
  add column if not exists codigo_toteat text;

create index if not exists idx_carta_codigo_toteat
  on public.carta(codigo_toteat);
