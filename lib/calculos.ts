// ============================================================
// KitchenOps — Lógica de negocio central
// REGLAS CRÍTICAS:
//   - total_producido = cantidad × gramos_por_pp (RECETAS no entra)
//   - precio_carta siempre incluye IVA, jamás recalcular
//   - costo_bruto = costo_neto × 1.19
// ============================================================

import type { ColorSemaforo, TipoPP } from '@/types/database';

/**
 * Semáforo de margen de plato.
 * precio_carta ya incluye IVA.
 * costo_neto × 1.19 = costo_bruto.
 */
export function semaforo(
  costoNeto: number | null | undefined,
  precioCartaConIVA: number | null | undefined
): ColorSemaforo {
  if (!costoNeto || !precioCartaConIVA) return 'gray';
  const costoBruto = costoNeto * 1.19;
  const margenPct = ((precioCartaConIVA - costoBruto) / precioCartaConIVA) * 100;
  if (margenPct >= 30) return 'green';
  if (margenPct >= 25) return 'yellow';
  return 'red';
}

/**
 * Margen porcentual de un plato.
 * Retorna null si faltan datos.
 */
export function calcMargen(
  costoNeto: number | null | undefined,
  precioCartaConIVA: number | null | undefined
): number | null {
  if (!costoNeto || !precioCartaConIVA) return null;
  const costoBruto = costoNeto * 1.19;
  return ((precioCartaConIVA - costoBruto) / precioCartaConIVA) * 100;
}

/**
 * Total producido de un PP.
 * FÓRMULA: cantidad × gramos_por_pp
 * Si producto cuesta por KG/LT y gramos_por_pp viene como 0.x, se normaliza a g/cc.
 * CC y DIRECTO retornan cantidad directamente (sin multiplicar).
 * RECETAS nunca entra en el cálculo.
 */
export function calcTotalPP(
  cantidad: number,
  pp: { tipo_pp: TipoPP | string | null | undefined; gramos_por_pp?: number | null },
  unidadProducto?: string | null
): number {
  const tipo = String(pp.tipo_pp ?? '').toUpperCase();
  if (tipo === 'CC' || tipo === 'DIRECTO') return cantidad;
  const g = pp.gramos_por_pp ?? 1;
  const um = String(unidadProducto ?? '').toUpperCase();
  if (tipo === 'PORCION' && (um === 'KG' || um === 'LT') && g > 0 && g < 10) {
    return cantidad * g * 1000;
  }
  return cantidad * g;
}

/**
 * Costo de una linea de produccion PP.
 *
 * - GR/CC: costo por unidad de total_producido.
 * - KG/LT: total_producido viene en g/cc y se convierte a kg/L.
 * - PR: costo por PP/porcion informada, no por gramo producido.
 */
export function calcCostoProduccionPP(
  cantidad: number,
  pp: { tipo_pp: TipoPP | string | null | undefined; gramos_por_pp?: number | null },
  unidadProducto: string | null | undefined,
  costoUnitario: number | null | undefined
): number {
  const cant = Number(cantidad) || 0;
  const costo = Number(costoUnitario) || 0;
  if (!cant || !costo) return 0;

  const tipo = String(pp.tipo_pp ?? '').toUpperCase();
  const um = String(unidadProducto ?? '').toUpperCase();

  if (tipo === 'DIRECTO') return Math.round(cant * costo);
  if (um === 'PR') return Math.round(cant * costo);
  if (!um && (tipo === 'PORCION' || tipo === 'UND')) return Math.round(cant * costo);

  const total = calcTotalPP(cant, pp, um);
  if (um === 'KG' || um === 'LT') return Math.round((total / 1000) * costo);
  return Math.round(total * costo);
}

/**
 * Merma de verdura.
 * merma_kg = kg_utilizados − rendimiento_kg
 * merma_pct = merma_kg / kg_utilizados × 100
 */
export function calcMerma(
  kgUtilizados: number,
  rendimientoKg: number
): {
  mermaKg: number;
  mermaPct: number;
  estado: 'ok' | 'medio' | 'alto';
} {
  const mermaKg = Math.max(0, kgUtilizados - rendimientoKg);
  const mermaPct = kgUtilizados > 0 ? (mermaKg / kgUtilizados) * 100 : 0;
  const estado = mermaPct > 25 ? 'alto' : mermaPct > 15 ? 'medio' : 'ok';
  return { mermaKg, mermaPct, estado };
}

/**
 * Costo por plato de colación.
 * Retorna 0 si n_inscritos es 0 (datos históricos anteriores a abril 2026).
 */
export function costoPorPlato(costoTotal: number, nInscritos: number): number {
  return nInscritos > 0 ? Math.round(costoTotal / nInscritos) : 0;
}

/**
 * Formatea un valor CLP a string con separador de miles.
 * Ejemplo: 12345 → "$12.345"
 */
export function formatCLP(value: number | null | undefined): string {
  if (value == null) return '—';
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}

/**
 * Formatea un porcentaje con 1 decimal.
 * Ejemplo: 32.5 → "32,5%"
 */
export function formatPct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toFixed(1).replace('.', ',')}%`;
}

/**
 * Etiqueta legible del semáforo.
 */
export function labelSemaforo(color: ColorSemaforo): string {
  const map: Record<ColorSemaforo, string> = {
    green: 'Óptimo',
    yellow: 'Medio',
    red: 'Bajo',
    gray: 'Sin datos',
  };
  return map[color];
}
