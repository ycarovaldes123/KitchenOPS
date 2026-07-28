-- Normaliza motivos legacy de mermas a los nombres activos.
-- No elimina registros historicos ni fuerza un motivo cuando estaba vacio/null.

do $$
begin
  if to_regclass('public.detalle_mermas') is not null then
    update public.detalle_mermas
    set motivo = case motivo
      when 'Caida' then 'Caída'
      when 'Pelo / contaminacion' then 'Pelo / contaminación'
      when 'Cliente no recibe' then 'Devolución Cliente'
      else motivo
    end
    where motivo in ('Caida', 'Pelo / contaminacion', 'Cliente no recibe');
  end if;

  if to_regclass('public.detalle_mermas_platos') is not null then
    update public.detalle_mermas_platos
    set motivo = case motivo
      when 'Caida' then 'Caída'
      when 'Pelo / contaminacion' then 'Pelo / contaminación'
      when 'Cliente no recibe' then 'Devolución Cliente'
      else motivo
    end
    where motivo in ('Caida', 'Pelo / contaminacion', 'Cliente no recibe');
  end if;
end $$;
