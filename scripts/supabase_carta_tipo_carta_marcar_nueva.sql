-- KitchenOPS - Costos: separar "Carta actual" (NUEVA) de "Carta antigua" (ANTIGUA)
-- Ejecutar en Supabase SQL Editor. Es idempotente: se puede correr mas de una vez.
--
-- Crea carta.tipo_carta (si no existe) y marca como NUEVA los platos cuya categoria es
-- 'CARTA NUEVA' (hoy 27 platos activos). El resto queda ANTIGUA. Despues, cada plato se
-- puede cambiar en Costos → Editar → Tipo carta.

alter table public.carta
  add column if not exists tipo_carta text;

update public.carta
set tipo_carta = case when upper(trim(categoria)) = 'CARTA NUEVA' then 'NUEVA' else 'ANTIGUA' end
where tipo_carta is null
   or (upper(trim(categoria)) = 'CARTA NUEVA' and tipo_carta <> 'NUEVA');

alter table public.carta
  alter column tipo_carta set default 'ANTIGUA';

alter table public.carta
  alter column tipo_carta set not null;

alter table public.carta
  drop constraint if exists carta_tipo_carta_check;

alter table public.carta
  add constraint carta_tipo_carta_check check (tipo_carta in ('ANTIGUA', 'NUEVA'));

create index if not exists idx_carta_tipo_carta
  on public.carta(tipo_carta);

-- Verificacion: debe mostrar NUEVA = 27 y ANTIGUA = 70 (platos activos)
select tipo_carta, count(*) as platos
from public.carta
where activo
group by tipo_carta
order by tipo_carta;
