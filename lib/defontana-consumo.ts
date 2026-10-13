// Homologacion Toteat → receta KitchenOps → codigos Defontana, y consumo calculado por ventas.
// Reutiliza las recetas existentes (carta_ingredientes y pp_recetas): no guarda nada propio.
// Solo calcula para revision; no genera movimientos de stock.

import { normalizarUM } from './costo-receta-pp.ts';

export type EstadoDefontana = 'vinculado' | 'pendiente' | 'incompleto' | 'sin_codigo';

export interface IngredienteDefontana {
  codigo_producto: string | null;
  pp_id?: string | null;
  nombre: string | null;
  cantidad: number | string | null;
  unidad_medida: string | null;
}

export interface RecetaPPDefontana {
  codigo_pp: string;
  nombre: string;
  rendimiento: number;
  unidad_rendimiento: string;
  ingredientes: { codigo_ingrediente: string | null; nombre_ingrediente: string; cantidad: number; unidad_medida: string }[];
}

export interface LineaConsumo {
  tipo: 'pp' | 'directo';
  codigo_producto: string | null;
  codigo_defontana: string | null;
  nombre: string;
  unidad_medida: string | null;
  cantidad_por_plato: number;
  total: number;
}

export interface MateriaPrimaPP {
  codigo_producto: string | null;
  codigo_defontana: string | null;
  nombre: string;
  unidad_medida: string;
  total: number;
}

// Los PP terminados usan codigos Softland 0502xxx (sus recetas internas son 0501xxx).
export function esPP(ing: Pick<IngredienteDefontana, 'codigo_producto' | 'pp_id'>, codigosConRecetaPP?: Set<string>) {
  const codigo = (ing.codigo_producto ?? '').trim();
  return !!ing.pp_id || /^0502\d+$/.test(codigo) || (!!codigo && !!codigosConRecetaPP?.has(codigo));
}

export function normalizarCodigoToteat(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

/**
 * - sin_codigo: el plato no tiene Codigo TOTEAT (sus ventas no se pueden cruzar).
 * - incompleto: sin receta o con lineas sin codigo de producto / cantidad.
 * - pendiente:  receta completa, pero algun producto/PP aun no tiene codigo Defontana,
 *               o el Codigo TOTEAT esta repetido en otro plato.
 * - vinculado:  listo para calcular y descontar.
 */
export function estadoHomologacion(
  codigoToteat: string | null | undefined,
  ingredientes: IngredienteDefontana[],
  defontana: Map<string, string>,
  codigoDuplicado = false,
): EstadoDefontana {
  if (!normalizarCodigoToteat(codigoToteat)) return 'sin_codigo';
  if (!ingredientes.length) return 'incompleto';
  const lineaIncompleta = ingredientes.some(i => !(i.codigo_producto ?? '').trim() || !(Number(i.cantidad) > 0));
  if (lineaIncompleta) return 'incompleto';
  if (codigoDuplicado) return 'pendiente';
  const sinDefontana = ingredientes.some(i => !defontana.has((i.codigo_producto ?? '').trim()));
  return sinDefontana ? 'pendiente' : 'vinculado';
}

export function lineasConsumo(
  ingredientes: IngredienteDefontana[],
  vendidos: number,
  defontana: Map<string, string>,
  codigosConRecetaPP?: Set<string>,
): LineaConsumo[] {
  return ingredientes
    .filter(i => Number(i.cantidad) > 0)
    .map(i => {
      const codigo = (i.codigo_producto ?? '').trim() || null;
      const cantidad = Number(i.cantidad);
      return {
        tipo: esPP(i, codigosConRecetaPP) ? 'pp' as const : 'directo' as const,
        codigo_producto: codigo,
        codigo_defontana: codigo ? defontana.get(codigo) ?? null : null,
        nombre: i.nombre ?? codigo ?? 'Sin nombre',
        unidad_medida: normalizarUM(i.unidad_medida) || null,
        cantidad_por_plato: cantidad,
        total: redondear(cantidad * vendidos),
      };
    });
}

// Pares de unidades que se pueden convertir entre si (misma magnitud).
const FACTOR_A_BASE: Record<string, { base: string; factor: number }> = {
  GR: { base: 'GR', factor: 1 },
  KG: { base: 'GR', factor: 1000 },
  CC: { base: 'CC', factor: 1 },
  LT: { base: 'CC', factor: 1000 },
};

/** Convierte `cantidad` de `desde` a `hasta`; null si las unidades no son compatibles. */
export function convertirUnidad(cantidad: number, desde: string | null, hasta: string | null): number | null {
  const d = normalizarUM(desde);
  const h = normalizarUM(hasta);
  if (d === h) return cantidad;
  const fd = FACTOR_A_BASE[d];
  const fh = FACTOR_A_BASE[h];
  if (!fd || !fh || fd.base !== fh.base) return null;
  return (cantidad * fd.factor) / fh.factor;
}

/**
 * Materias primas que implica consumir `total` (en `unidad`) de un PP, segun su receta.
 * Es referencial: hoy el PP se descuenta como producto terminado (0502xxx) y sus materias
 * primas ya se consumen al registrar la produccion. Devuelve null si la unidad no calza.
 */
export function explotarPP(total: number, unidad: string | null, receta: RecetaPPDefontana, defontana: Map<string, string>): MateriaPrimaPP[] | null {
  const enUnidadReceta = convertirUnidad(total, unidad, receta.unidad_rendimiento);
  if (enUnidadReceta == null || !(receta.rendimiento > 0)) return null;
  const proporcion = enUnidadReceta / receta.rendimiento;
  return receta.ingredientes.map(ing => {
    const codigo = (ing.codigo_ingrediente ?? '').trim() || null;
    return {
      codigo_producto: codigo,
      codigo_defontana: codigo ? defontana.get(codigo) ?? null : null,
      nombre: ing.nombre_ingrediente,
      unidad_medida: normalizarUM(ing.unidad_medida),
      total: redondear(Number(ing.cantidad) * proporcion),
    };
  });
}

function redondear(n: number) {
  return Number(n.toFixed(6));
}

// Ventas Toteat que entran a Defontana: toda la jerarquia Alimentos (AB.700…), toda Cafeteria
// y, de Jugos y limonadas, solo los extras de jugo natural (el resto de bebidas no se descuenta).
export type GrupoVentaDefontana = 'alimentos' | 'cafeteria' | 'jugos';
export const JUGOS_DEFONTANA = new Set(['E5000', 'E5001', 'E5002', 'E5500', 'E5501', 'E5502']);

export function grupoVentaDefontana(venta: { product_code: string | null; category: string | null; hierarchyId?: string | null }): GrupoVentaDefontana | null {
  const code = normalizarCodigoToteat(venta.product_code);
  if (JUGOS_DEFONTANA.has(code)) return 'jugos';
  const categoria = String(venta.category ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (categoria.includes('CAFETERIA')) return 'cafeteria';
  if (String(venta.hierarchyId ?? '').startsWith('AB.700')) return 'alimentos';
  return null;
}
