// Color con el que se distingue el nombre de cada persona en los registros (Historial, avatares de ingreso).
// Se guarda como hex en responsables.color_hex; solo estos 4 se eligen desde Maestros → Personal.

export type ColorNombre = 'verde' | 'azul' | 'rosado' | 'morado';

export type EstiloChip = { bg: string; border: string; color: string };

export const COLORES_NOMBRE: { value: ColorNombre; label: string; hex: string; chip: EstiloChip }[] = [
  { value: 'verde',  label: 'Verde',  hex: '#16A34A', chip: { bg: '#F0FDF4', border: '#86EFAC', color: '#15803D' } },
  { value: 'azul',   label: 'Azul',   hex: '#2563EB', chip: { bg: '#EFF6FF', border: '#93C5FD', color: '#2563EB' } },
  { value: 'rosado', label: 'Rosado', hex: '#DB2777', chip: { bg: '#FDF2F8', border: '#F9A8D4', color: '#DB2777' } },
  { value: 'morado', label: 'Morado', hex: '#7C3AED', chip: { bg: '#F5F3FF', border: '#C4B5FD', color: '#6D28D9' } },
];

export const HEX_NOMBRE_VALIDOS = new Set(COLORES_NOMBRE.map(c => c.hex));

/** Color elegido a partir del hex guardado (null si es uno antiguo/automático). */
export function colorDesdeHex(hex: string | null | undefined) {
  const h = String(hex ?? '').toUpperCase();
  return COLORES_NOMBRE.find(c => c.hex === h) ?? null;
}

/** Clave para cruzar responsable_nombre de los registros con responsables.nombre. */
export function claveNombre(nombre: string | null | undefined) {
  return String(nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}
