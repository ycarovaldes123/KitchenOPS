import type { BodegaCarnico, SubtipoCarnico, TipoMovimientoCarnico } from '@/types/carnicos';

export const BODEGAS_CARNICOS: BodegaCarnico[] = ['CAMARA CONGELADOS', 'CAMARA MANTENCION', 'COCINA', 'CAMARA FRIO', 'BODEGAS CONSOLIDADAS'];

export const BODEGA_LABEL: Record<BodegaCarnico, string> = {
  'CAMARA CONGELADOS': 'Camara Congelados',
  'CAMARA MANTENCION': 'Camara Mantencion',
  COCINA: 'Cocina',
  'CAMARA FRIO': 'Camara Frio',
  'BODEGAS CONSOLIDADAS': 'Bodegas consolidadas',
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

// Categorias de carnicos.carnicos_productos.tipo (viene de la columna TIPO del Excel de origen),
// en el orden pedido para la planilla de Conteo y su etiqueta visible.
export const ORDEN_CATEGORIAS_CARNICOS = ['CARNES ROJAS', 'CARNES AVE', 'PESCADOS', 'EMBUTIDOS', 'PRODUCTOS PROCESADOS'] as const;

export const CATEGORIA_CARNICO_LABEL: Record<string, string> = {
  'CARNES ROJAS': 'CARNES ROJAS',
  'CARNES AVE': 'AVES',
  PESCADOS: 'PESCADOS',
  EMBUTIDOS: 'EMBUTIDOS',
  'PRODUCTOS PROCESADOS': 'P.P',
};

export function ordenCategoriaCarnico(tipo: string): number {
  const idx = ORDEN_CATEGORIAS_CARNICOS.indexOf(tipo as (typeof ORDEN_CATEGORIAS_CARNICOS)[number]);
  return idx === -1 ? ORDEN_CATEGORIAS_CARNICOS.length : idx;
}

// ── Utilidades de rango de fechas (YYYY-MM-DD), usadas por los filtros Dia/Semana/Mes/
// Rango personalizado de Tabla Resumen e Historial. Se hace la aritmetica en UTC para
// evitar corrimientos de dia por la zona horaria del navegador.
export type ModoRangoFecha = 'dia' | 'semana' | 'mes' | 'personalizado';

function parseISO(fechaStr: string): Date {
  const [y, m, d] = fechaStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function formatISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}
export function sumarDiasISO(fechaStr: string, dias: number): string {
  const d = parseISO(fechaStr);
  d.setUTCDate(d.getUTCDate() + dias);
  return formatISO(d);
}
export function inicioSemanaISO(fechaStr: string): string {
  const d = parseISO(fechaStr);
  const diaSemana = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - diaSemana);
  return formatISO(d);
}
export function inicioMesISO(fechaStr: string): string {
  const [y, m] = fechaStr.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}
export function finMesISO(fechaStr: string): string {
  const [y, m] = fechaStr.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
}
export function formatFechaCorta(fechaStr: string): string {
  const [, m, d] = fechaStr.split('-');
  return `${d}/${m}`;
}
/** DDMMYYYY sin separadores, para nombres de archivo (ej. "01082026"). */
export function formatFechaCompacta(fechaStr: string): string {
  const [y, m, d] = fechaStr.split('-');
  return `${d}${m}${y}`;
}
/** DD-MM-YYYY, para mostrar en encabezados/celdas (ej. "01-08-2026"). */
export function formatFechaGuion(fechaStr: string): string {
  const [y, m, d] = fechaStr.split('-');
  return `${d}-${m}-${y}`;
}
/** Calcula desde/hasta para un modo Dia/Semana/Mes anclado a `hoy` (YYYY-MM-DD). */
export function rangoParaModo(modo: Exclude<ModoRangoFecha, 'personalizado'>, hoy: string): { desde: string; hasta: string } {
  if (modo === 'semana') {
    const desde = inicioSemanaISO(hoy);
    return { desde, hasta: sumarDiasISO(desde, 6) };
  }
  if (modo === 'mes') {
    return { desde: inicioMesISO(hoy), hasta: finMesISO(hoy) };
  }
  return { desde: hoy, hasta: hoy };
}
