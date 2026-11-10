-- Maestros → Recetas PP: sección Cocina / Salón (2026-11-07)
-- Todas las recetas existentes quedan en COCINA; los syrups de barra pasan a SALON.
ALTER TABLE pp_recetas ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT 'COCINA';
ALTER TABLE pp_recetas DROP CONSTRAINT IF EXISTS pp_recetas_area_check;
ALTER TABLE pp_recetas ADD CONSTRAINT pp_recetas_area_check CHECK (area IN ('COCINA', 'SALON', 'PASTELERIA'));
CREATE INDEX IF NOT EXISTS idx_pp_recetas_area ON pp_recetas(area);

UPDATE pp_recetas SET area = 'SALON' WHERE nombre IN ('SYRUP ARANDANO', 'SYRUP FRAMBUESA');

NOTIFY pgrst, 'reload schema';
