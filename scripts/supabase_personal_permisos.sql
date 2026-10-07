-- Maestros > Personal: separa Rol (area laboral) de Acceso (nivel en KitchenOps) y agrega
-- permisos por modulo (Visualizacion / Editar). Cambio aditivo: no toca `rol`, `email` ni
-- relaciones historicas (produccion, mermas, colacion, frutas, inventarios, carnicos).
--
-- `permisos` NULL = la persona usa los permisos que hoy le da su email (lib/roles.ts + lib/permissions.ts).
-- Formato: {"produccion": {"ver": true, "editar": true}, "costos": {"ver": true, "editar": false}, ...}

ALTER TABLE responsables ADD COLUMN IF NOT EXISTS area         text;
ALTER TABLE responsables ADD COLUMN IF NOT EXISTS nivel_acceso text;
ALTER TABLE responsables ADD COLUMN IF NOT EXISTS permisos     jsonb;

-- Area inicial a partir del rol actual (solo donde aun no hay area).
UPDATE responsables SET area = CASE lower(rol)
    WHEN 'cocina'     THEN 'cocina'
    WHEN 'finanzas'   THEN 'finanzas'
    WHEN 'jefatura'   THEN 'jefatura'
    WHEN 'economo'    THEN 'economato'
    WHEN 'bodega'     THEN 'bodega'
    WHEN 'pasteleria' THEN 'pasteleria'
    WHEN 'gerencia'   THEN 'gerencia'
    ELSE NULL
  END
WHERE area IS NULL;

-- "Admin" es un nivel de acceso, no un area: Javiera Sepulveda es de Finanzas.
UPDATE responsables SET area = 'finanzas' WHERE area IS NULL AND email = 'jsepulveda@cerveceriakunstmann.cl';

-- Nivel de acceso inicial segun la cuenta con la que ingresa cada persona.
UPDATE responsables SET nivel_acceso = CASE
    WHEN email IN ('ycaro@cerveceriakunstmann.cl', 'jsepulveda@cerveceriakunstmann.cl') THEN 'administrador'
    WHEN email IN ('fcaro@cerveceriakunstmann.cl', 'mdelannoy@cerveceriakunstmann.cl')  THEN 'jefatura'
    WHEN email IN ('ddelgado@cerveceriakunstmann.cl', 'caravena@cerveceriakunstmann.cl') THEN 'usuario'
    ELSE 'operativo'
  END
WHERE nivel_acceso IS NULL;

-- Verificacion
SELECT nombre, rol, area, nivel_acceso, activo FROM responsables ORDER BY nombre;
