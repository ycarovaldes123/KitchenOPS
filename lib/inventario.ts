export const UBICACIONES_INVENTARIO = [
  'CAMARA CONGELADOS',
  'CAMARA MANTENCION',
  'BODEGA SECA',
  'SALAD BAR',
  'DESPACHO',
  'COCINA',
  'MUEBLE DE ASEO',
  'VITRINA',
  'BODEGA CENTRAL',
  'BODEGA PASTELERIA',
] as const;

export type UbicacionInventario = typeof UBICACIONES_INVENTARIO[number];

// Normaliza el nombre de ubicación; "CAMARA BRYAN" (nombre antiguo) se guarda como "BODEGA CENTRAL".
export function normalizarUbicacion(valor: unknown): string {
  const u = String(valor ?? '').trim().toUpperCase();
  return /^C[AÁ]MARA\s+BRYAN$/.test(u) ? 'BODEGA CENTRAL' : u;
}
