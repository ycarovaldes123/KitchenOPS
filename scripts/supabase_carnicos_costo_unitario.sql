-- Control Carnicos -- agrega costo unitario por producto, para valorizar en $ las diferencias
-- de cuadre en Tabla Resumen / Valorizacion. Ejecutar en Supabase SQL Editor.

alter table public.carnicos_productos
  add column if not exists costo_unitario numeric(14,2) not null default 0;

notify pgrst, 'reload schema';
