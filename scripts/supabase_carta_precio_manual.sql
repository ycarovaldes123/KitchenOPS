-- KitchenOPS - Costos: precio unitario manual en la receta de un plato
-- Ejecutar en Supabase SQL Editor. Es idempotente: se puede correr mas de una vez.
--
-- precio_manual = true: la linea usa el precio_unitario escrito a mano en Costos → Editar →
-- "Editar P. unitario", en vez del costo promedio del maestro de productos.
-- Todas las lineas existentes quedan en false (siguen usando el maestro, como hoy).

alter table public.carta_ingredientes
  add column if not exists precio_manual boolean not null default false;

-- Verificacion: debe mostrar 0 lineas manuales
select count(*) filter (where precio_manual) as lineas_manuales, count(*) as lineas_total
from public.carta_ingredientes;
