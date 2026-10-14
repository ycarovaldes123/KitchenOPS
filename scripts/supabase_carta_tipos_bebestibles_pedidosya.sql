-- KitchenOPS - Costos: agregar las cartas BEBESTIBLES y PEDIDOSYA a carta.tipo_carta
-- Ejecutar en Supabase SQL Editor. Es idempotente: se puede correr mas de una vez.
-- No modifica ningun plato: solo amplia los valores permitidos.

alter table public.carta
  drop constraint if exists carta_tipo_carta_check;

alter table public.carta
  add constraint carta_tipo_carta_check
  check (tipo_carta in ('ANTIGUA', 'NUEVA', 'BEBESTIBLES', 'PEDIDOSYA'));

-- Verificacion: platos por carta (no deberia cambiar ningun conteo)
select tipo_carta, activo, count(*) as platos
from public.carta
group by tipo_carta, activo
order by tipo_carta, activo;
