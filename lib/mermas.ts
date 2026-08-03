import type { MotivoMerma } from '@/types/database';

export const MOTIVOS_MERMA_PRODUCTO: MotivoMerma[] = [
  'Vencimiento',
  'Mala manipulación',
  'Sobreproducción',
  'Devolución',
  'Corte / limpieza',
  'Error de producción',
  'Hongos',
  'Mal estado',
  'Roto',
  'Sellado al vacio',
  'Prueba de plato',
  'Caída',
  'Crudo',
];

export const MOTIVOS_MERMA_PLATO: MotivoMerma[] = [
  'Error Garzón',
  'Devolución Cliente',
  'Quemado',
  'Prueba de plato',
  'Crudo',
  'Devolución',
  'Caída',
  'Pelo / contaminación',
  'Mal preparado',
];

export const MOTIVO_MERMA_COLOR: Record<string, string> = {
  Vencimiento: '#DC2626',
  'Mala manipulación': '#D97706',
  Sobreproducción: '#6366F1',
  Devolución: '#0EA5E9',
  'Corte / limpieza': '#0D9373',
  'Error de producción': '#7C3AED',
  Hongos: '#65A30D',
  'Mal estado': '#B91C1C',
  Roto: '#DC2626',
  'Sellado al vacio': '#0F766E',
  'Prueba de plato': '#D97706',
  Caída: '#B45309',
  Crudo: '#0891B2',
  'Error Garzón': '#BE123C',
  'Devolución Cliente': '#0284C7',
  Quemado: '#991B1B',
  'Pelo / contaminación': '#BE123C',
  'Mal preparado': '#9333EA',
  Otro: '#6B7280',
  'Cliente no recibe': '#0284C7',
};

export function normalizeMotivoMerma(motivo: unknown): MotivoMerma | null {
  if (typeof motivo !== 'string') return null;
  const value = motivo.trim();
  if (!value) return null;
  if (value === 'Cliente no recibe') return 'Devolución Cliente';
  if (value === 'Caida') return 'Caída';
  if (value === 'Pelo / contaminacion') return 'Pelo / contaminación';
  return value as MotivoMerma;
}

export function isMotivoMermaProductoActivo(motivo: unknown): boolean {
  const normalizado = normalizeMotivoMerma(motivo);
  return normalizado == null || MOTIVOS_MERMA_PRODUCTO.includes(normalizado);
}

export function isMotivoMermaPlatoActivo(motivo: unknown): boolean {
  const normalizado = normalizeMotivoMerma(motivo);
  return normalizado == null || MOTIVOS_MERMA_PLATO.includes(normalizado);
}
