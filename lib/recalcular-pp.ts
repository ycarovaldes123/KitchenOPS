import { SupabaseClient } from '@supabase/supabase-js';

function calcCostoIngrediente(
  cantidad: number,
  ingredientUM: string,
  productUM: string,
  costoPromedio: number,
): number {
  const iUM = ingredientUM.toUpperCase() === 'UND' ? 'UN' : ingredientUM.toUpperCase();
  const pUM = productUM.toUpperCase();
  if (iUM === pUM) return Math.round(cantidad * costoPromedio);
  if (iUM === 'GR' && pUM === 'KG') return Math.round((cantidad / 1000) * costoPromedio);
  if (iUM === 'CC' && pUM === 'LT') return Math.round((cantidad / 1000) * costoPromedio);
  return Math.round(cantidad * costoPromedio);
}

export interface RecalcularResult {
  recalculadas: number;
  errores: string[];
}

export async function recalcularCostosPP(supabase: SupabaseClient): Promise<RecalcularResult> {
  const { data: recetas, error: rErr } = await supabase
    .from('pp_recetas')
    .select(`id, codigo_pp, rendimiento, unidad_rendimiento, pp_receta_ingredientes (id, codigo_ingrediente, cantidad, unidad_medida)`)
    .eq('activo', true);

  if (rErr) return { recalculadas: 0, errores: [rErr.message] };

  const { data: productosData } = await supabase
    .from('productos')
    .select('codigo, unidad_medida, costo_promedio');

  const prodMap = new Map<string, { unidad_medida: string; costo_promedio: number }>();
  for (const p of productosData ?? []) {
    prodMap.set(p.codigo, { unidad_medida: p.unidad_medida, costo_promedio: p.costo_promedio ?? 0 });
  }

  let recalculadas = 0;
  const errores: string[] = [];

  for (const receta of recetas ?? []) {
    const ings = (receta as { pp_receta_ingredientes: { id: string; codigo_ingrediente: string | null; cantidad: number; unidad_medida: string }[] }).pp_receta_ingredientes ?? [];

    let costoTotal = 0;
    let hasSinCodigo = false;
    let hasSinCosto  = false;

    const ingUpdates: { id: string; costo_unitario_snap: number; costo_linea_calculado: number; sin_codigo: boolean; sin_costo: boolean }[] = [];

    for (const ing of ings) {
      const prod     = ing.codigo_ingrediente ? prodMap.get(ing.codigo_ingrediente) : null;
      const sinCodigo = !ing.codigo_ingrediente || !prod;
      const costoUnit = prod?.costo_promedio ?? 0;
      const sinCosto  = !sinCodigo && costoUnit === 0;
      const costoLinea = prod
        ? calcCostoIngrediente(ing.cantidad, ing.unidad_medida, prod.unidad_medida, costoUnit)
        : 0;

      if (sinCodigo) hasSinCodigo = true;
      if (sinCosto)  hasSinCosto  = true;
      costoTotal += costoLinea;

      ingUpdates.push({ id: ing.id, costo_unitario_snap: costoUnit, costo_linea_calculado: costoLinea, sin_codigo: sinCodigo, sin_costo: sinCosto });
    }

    const rendimiento    = Number(receta.rendimiento) || 1;
    const costoUnitario  = Math.round(costoTotal / rendimiento);
    const estado         = hasSinCodigo ? 'INCOMPLETO' : hasSinCosto ? 'PENDIENTE' : 'ACTIVO';

    for (const upd of ingUpdates) {
      await supabase.from('pp_receta_ingredientes').update({
        costo_unitario_snap:   upd.costo_unitario_snap,
        costo_linea_calculado: upd.costo_linea_calculado,
        sin_codigo:            upd.sin_codigo,
        sin_costo:             upd.sin_costo,
      }).eq('id', upd.id);
    }

    const { error: updErr } = await supabase.from('pp_recetas').update({
      costo_total_calculado:    costoTotal,
      costo_unitario_calculado: costoUnitario,
      estado,
      calculado_at: new Date().toISOString(),
    }).eq('id', receta.id);

    if (updErr) { errores.push(`${receta.id}: ${updErr.message}`); continue; }

    recalculadas++;

    // Sincronizar costo al 0502xxx — fuente de verdad vs Softland desactualizado
    // También actualizar prodMap en memoria para que recetas que lo usen como
    // ingrediente en esta misma pasada ya vean el costo correcto.
    const r = receta as { codigo_pp?: string | null; unidad_rendimiento?: string };
    if (r.codigo_pp && costoUnitario > 0) {
      await supabase
        .from('productos')
        .update({ costo_promedio: costoUnitario, updated_at: new Date().toISOString() })
        .eq('codigo', r.codigo_pp);

      const existing = prodMap.get(r.codigo_pp);
      prodMap.set(r.codigo_pp, {
        unidad_medida:  existing?.unidad_medida ?? r.unidad_rendimiento ?? 'GR',
        costo_promedio: costoUnitario,
      });
    }
  }

  return { recalculadas, errores };
}
