import type { BodegaCarnico, SubtipoCarnico, TipoMovimientoCarnico } from '@/types/carnicos';

export const BODEGAS_CARNICOS: BodegaCarnico[] = ['CAMARA CONGELADOS', 'CAMARA MANTENCION', 'COCINA', 'CAMARA FRIO'];

export const BODEGA_LABEL: Record<BodegaCarnico, string> = {
  'CAMARA CONGELADOS': 'Camara Congelados',
  'CAMARA MANTENCION': 'Camara Mantencion',
  COCINA: 'Cocina',
  'CAMARA FRIO': 'Camara Frio',
};

export const SUBTIPOS_POR_MOVIMIENTO: Record<TipoMovimientoCarnico, { value: SubtipoCarnico; label: string }[]> = {
  INGRESO: [
    { value: 'RECEPCION_BODEGA', label: 'Recepcion Bodega' },
    { value: 'INGRESO_PP', label: 'Ingreso PP' },
  ],
  SALIDA: [
    { value: 'PRODUCCION', label: 'Produccion' },
    { value: 'MERMAS', label: 'Mermas' },
    { value: 'COLACION', label: 'Colacion' },
  ],
};

export const SUBTIPO_LABEL: Record<SubtipoCarnico, string> = {
  RECEPCION_BODEGA: 'Recepcion Bodega',
  INGRESO_PP: 'Ingreso PP',
  PRODUCCION: 'Produccion',
  MERMAS: 'Mermas',
  COLACION: 'Colacion',
  VENTAS: 'Ventas',
};

// Tolerancia de redondeo para el Estado (verde/rojo) de la Tabla Resumen.
// Un solo lugar para ajustar -- si en el futuro se vuelve configurable por DB,
// esta funcion es el unico punto de reemplazo.
export const TOLERANCIA_CARNICOS = {
  PESO_KG: 0.05, // productos en KG o GR: tolera +/- 50 g (normalizado)
  UNIDAD: 1, // productos en UN, PQ o PR: tolera +/- 1 unidad discreta
} as const;

export function dentroDeTolerancia(diferencia: number | null, unidadMedida: string): boolean {
  if (diferencia === null) return true;
  const abs = Math.abs(diferencia);
  if (unidadMedida === 'KG') return abs <= TOLERANCIA_CARNICOS.PESO_KG;
  if (unidadMedida === 'GR') return abs <= TOLERANCIA_CARNICOS.PESO_KG * 1000;
  return abs <= TOLERANCIA_CARNICOS.UNIDAD;
}

export function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}
