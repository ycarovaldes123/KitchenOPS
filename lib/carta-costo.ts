import type { SupabaseClient } from '@supabase/supabase-js';

export function normalizarUMCarta(um: string | null | undefined) {
  const val = (um ?? '').trim().toUpperCase();
  return val === 'UND' ? 'UN' : val;
}

/** Precio por unidad de la receta a partir del costo promedio del maestro (misma regla de siempre). */
export function precioUnitarioPorUnidad(unidadIngrediente: string, unidadProducto: string, costoPromedio: number) {
  const iUM = normalizarUMCarta(unidadIngrediente);
  const pUM = normalizarUMCarta(unidadProducto);
  if (iUM === pUM) return costoPromedio;
  if (iUM === 'GR' && pUM === 'KG') return costoPromedio / 1000;
  if (iUM === 'CC' && pUM === 'LT') return costoPromedio / 1000;
  if (iUM === 'KG' && pUM === 'GR') return costoPromedio * 1000;
  if (iUM === 'LT' && pUM === 'CC') return costoPromedio * 1000;
  return costoPromedio;
}

type LineaCarta = {
  id: string;
  codigo_producto: string | null;
  cantidad: number | null;
  unidad_medida: string | null;
  precio_unitario: number | null;
  costo_total: number | null;
  precio_manual?: boolean | null;
};

const iguales = (a: number | null | undefined, b: number) => Math.abs((Number(a) || 0) - b) < 1e-6;

/**
 * Lleva el costo actual del maestro (productos.costo_promedio) a las recetas de los platos
 * (carta_ingredientes). Se llama cada vez que cambia el costo de un producto o de un PP.
 * No toca las lineas con precio manual. Solo escribe las lineas que cambiaron.
 */
export async function sincronizarCostosCarta(supabase: SupabaseClient): Promise<{ actualizadas: number; errores: string[] }> {
  let lineas: LineaCarta[];
  const conManual = await supabase.from('carta_ingredientes')
    .select('id,codigo_producto,cantidad,unidad_medida,precio_unitario,costo_total,precio_manual')
    .not('codigo_producto', 'is', null);
  if (conManual.error) {
    // Sin la columna precio_manual (script no ejecutado) todas las lineas usan el maestro.
    const sinManual = await supabase.from('carta_ingredientes')
      .select('id,codigo_producto,cantidad,unidad_medida,precio_unitario,costo_total')
      .not('codigo_producto', 'is', null);
    if (sinManual.error) return { actualizadas: 0, errores: [sinManual.error.message] };
    lineas = (sinManual.data ?? []) as LineaCarta[];
  } else {
    lineas = (conManual.data ?? []) as LineaCarta[];
  }
  lineas = lineas.filter(l => !l.precio_manual);

  const codigos = [...new Set(lineas.map(l => l.codigo_producto).filter(Boolean))] as string[];
  const productos = new Map<string, { unidad_medida: string | null; costo_promedio: number | null }>();
  for (let i = 0; i < codigos.length; i += 200) {
    const { data, error } = await supabase.from('productos').select('codigo,unidad_medida,costo_promedio').in('codigo', codigos.slice(i, i + 200));
    if (error) return { actualizadas: 0, errores: [error.message] };
    for (const p of data ?? []) productos.set(p.codigo, p);
  }

  const cambios: { id: string; precio_unitario: number; costo_total: number }[] = [];
  for (const l of lineas) {
    const prod = productos.get(l.codigo_producto!);
    if (!prod) continue;
    const precio = precioUnitarioPorUnidad(l.unidad_medida ?? prod.unidad_medida ?? '', prod.unidad_medida ?? '', Number(prod.costo_promedio) || 0);
    const costo = (Number(l.cantidad) || 0) * precio;
    if (!iguales(l.precio_unitario, precio) || !iguales(l.costo_total, costo)) cambios.push({ id: l.id, precio_unitario: precio, costo_total: costo });
  }

  const errores: string[] = [];
  for (let i = 0; i < cambios.length; i += 20) {
    const res = await Promise.all(cambios.slice(i, i + 20).map(c =>
      supabase.from('carta_ingredientes').update({ precio_unitario: c.precio_unitario, costo_total: c.costo_total }).eq('id', c.id)));
    for (const r of res) if (r.error) errores.push(r.error.message);
  }
  return { actualizadas: cambios.length - errores.length, errores };
}
