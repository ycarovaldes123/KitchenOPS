import type { RolType } from '@/lib/roles';

export type Modulo =
  | 'dashboard'
  | 'produccion'
  | 'colacion'
  | 'frutas'
  | 'inventario'
  | 'controlCarnicos'
  | 'mermas'
  | 'historial'
  | 'ventas'
  | 'kpis'
  | 'costos'
  | 'export'
  | 'maestros';

export interface PermisoModulo {
  ver:       boolean;
  registrar: boolean;
  editar:    boolean;
  eliminar:  boolean;
  aprobar:   boolean;
  exportar:  boolean;
  verCostos: boolean;
  soloHoy:   boolean;
}

const NADA: PermisoModulo      = { ver: false, registrar: false, editar: false, eliminar: false, aprobar: false, exportar: false, verCostos: false, soloHoy: false };
const FINANCIERO: PermisoModulo = { ...NADA, ver: true, verCostos: true };
const LECTURA_COSTOS: PermisoModulo = { ...NADA, ver: true, verCostos: true };
const OPERATIVO: PermisoModulo = { ...NADA, ver: true, registrar: true };
const BODEGA_CONTROL: PermisoModulo = { ...NADA, ver: true, registrar: true, editar: true, exportar: true };
const COMPLETO: PermisoModulo  = { ver: true, registrar: true, editar: true, eliminar: true, aprobar: true, exportar: true, verCostos: true, soloHoy: false };

export const PERMISOS: Record<RolType, Record<Modulo, PermisoModulo>> = {
  admin: {
    dashboard: COMPLETO,
    produccion: COMPLETO,
    colacion:   COMPLETO,
    frutas:     COMPLETO,
    inventario: COMPLETO,
    controlCarnicos: COMPLETO,
    mermas:     COMPLETO,
    historial:  COMPLETO,
    ventas:     COMPLETO,
    kpis:       COMPLETO,
    costos:     COMPLETO,
    export:     COMPLETO,
    maestros:   COMPLETO,
  },

  finanzas: {
    dashboard:  FINANCIERO,
    produccion: FINANCIERO,
    colacion:   FINANCIERO,
    frutas:     FINANCIERO,
    inventario: FINANCIERO,
    controlCarnicos: NADA,
    mermas:     FINANCIERO,
    historial:  FINANCIERO,
    ventas:     FINANCIERO,
    kpis:       FINANCIERO,
    costos:     FINANCIERO,
    export:     { ...NADA, ver: true, exportar: true, verCostos: true },
    maestros:   FINANCIERO,
  },

  jefatura: {
    dashboard:  NADA,
    produccion: NADA,
    colacion:   NADA,
    frutas:     NADA,
    inventario: NADA,
    controlCarnicos: NADA,
    mermas:     NADA,
    historial:  LECTURA_COSTOS,
    ventas:     LECTURA_COSTOS,
    kpis:       LECTURA_COSTOS,
    costos:     LECTURA_COSTOS,
    export:     NADA,
    maestros:   NADA,
  },

  bodega: {
    dashboard:  NADA,
    produccion: NADA,
    colacion:   NADA,
    frutas:     NADA,
    inventario: NADA,
    controlCarnicos: NADA, // TODO: restaurar a BODEGA_CONTROL cuando se habilite el rol
    mermas:     { ...OPERATIVO, verCostos: true },
    historial:  LECTURA_COSTOS,
    ventas:     OPERATIVO,
    kpis:       NADA,
    costos:     NADA,
    export:     NADA,
    maestros:   NADA,
  },

  economo: {
    dashboard:  NADA,
    produccion: NADA,
    colacion:   OPERATIVO,
    frutas:     OPERATIVO,
    inventario: OPERATIVO,
    controlCarnicos: NADA,
    mermas:     OPERATIVO,
    historial:  { ...NADA, ver: true, verCostos: true },
    ventas:     { ...NADA, ver: true, registrar: true, verCostos: true },
    kpis:       NADA,
    costos:     NADA,
    export:     NADA,
    maestros:   NADA,
  },

  cocina: {
    dashboard:  NADA,
    produccion: { ...OPERATIVO, verCostos: true },
    colacion:   NADA,
    frutas:     NADA,
    inventario: NADA,
    controlCarnicos: NADA,
    mermas:     { ...OPERATIVO, verCostos: true },
    historial:  LECTURA_COSTOS,
    ventas:     OPERATIVO,
    kpis:       { ...NADA, ver: true, verCostos: true },
    costos:     NADA,
    export:     NADA,
    maestros:   NADA,
  },
};

export function puedeAcceder(rol: RolType, modulo: Modulo): boolean {
  return PERMISOS[rol][modulo].ver;
}

export function puedeHacer(rol: RolType, modulo: Modulo, accion: keyof PermisoModulo): boolean {
  return !!PERMISOS[rol][modulo][accion];
}
