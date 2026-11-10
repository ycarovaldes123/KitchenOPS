-- Maestros → Recetas PP: nueva sección Pastelería (2026-11-10)
ALTER TABLE pp_recetas DROP CONSTRAINT IF EXISTS pp_recetas_area_check;
ALTER TABLE pp_recetas ADD CONSTRAINT pp_recetas_area_check CHECK (area IN ('COCINA', 'SALON', 'PASTELERIA'));
NOTIFY pgrst, 'reload schema';
