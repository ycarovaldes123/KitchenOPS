import { SupabaseClient } from '@supabase/supabase-js';
import { recalcularCostosPP } from './recalcular-pp';
import { normalizarUM } from './costo-receta-pp';

export const UNIDADES_RENDIMIENTO = ['GR', 'KG', 'CC', 'LT', 'PR', 'UN'];

export interface RecetaPPInput {
  codigo_receta: string | null;
  codigo_pp: string | null;
  nombre: string;
  rendimiento: number;
  unidad_rendimiento: string;
  activo: boolean;
  ingredientes: {
    codigo_ingrediente: string | null;
    nombre_ingrediente: string;
    cantidad: number;
    unidad_medida: string;
  }[];
}

// Valida el body del editor de recetas. Devuelve el input limpio o un mensaje de error.
export function parseRecetaPPBody(body: Record<string, unknown>): RecetaPPInput | string {
  const nombre = String(body.nombre ?? '').trim().toUpperCase();
  if (!nombre) return 'El nombre es requerido';

  const rendimiento = Number(body.rendimiento);
  if (!Number.isFinite(rendimiento) || rendimiento <= 0) return 'El rendimiento debe ser mayor a 0';

  const unidad = normalizarUM(String(body.unidad_rendimiento ?? 'GR'));
  if (!UNIDADES_RENDIMIENTO.includes(unidad)) return `Unidad de rendimiento no válida: ${unidad}`;

  const codigoPP = String(body.codigo_pp ?? '').trim() || null;
  const codigoReceta = String(body.codigo_receta ?? '').trim() || null;

  const rawIngs = Array.isArray(body.ingredientes) ? body.ingredientes as Record<string, unknown>[] : [];
  const ingredientes = rawIngs
    .map(ing => ({
      codigo_ingrediente: String(ing.codigo_ingrediente ?? '').trim() || null,
      nombre_ingrediente: String(ing.nombre_ingrediente ?? '').trim(),
      cantidad:           Number(ing.cantidad) || 0,
      unidad_medida:      normalizarUM(String(ing.unidad_medida ?? 'KG')) || 'KG',
    }))
    .filter(ing => ing.cantidad > 0 && (ing.codigo_ingrediente || ing.nombre_ingrediente));
  if (ingredientes.length === 0) return 'La receta debe tener al menos un ingrediente con cantidad';

  return {
    codigo_receta: codigoReceta,
    codigo_pp:     codigoPP,
    nombre,
    rendimiento,
    unidad_rendimiento: unidad,
    activo: body.activo !== false,
    ingredientes,
  };
}

// Otra receta activa ya vinculada al mismo código PP: el recálculo le copiaría su costo al producto.
export async function recetaConCodigoPP(supabase: SupabaseClient, codigoPP: string | null, excluirId?: string) {
  if (!codigoPP) return null;
  let query = supabase.from('pp_recetas').select('codigo_receta, nombre').eq('codigo_pp', codigoPP).eq('activo', true);
  if (excluirId) query = query.neq('id', excluirId);
  const { data } = await query.limit(1);
  return data?.[0] ?? null;
}

export function codigoRecetaDesdePP(codigoPP: string | null): string | null {
  return codigoPP && /^0502\d+$/.test(codigoPP) ? '0501' + codigoPP.slice(4) : null;
}

// Código interno de la receta: 0502xxx → 0501xxx (misma convención del Excel);
// sin código PP se numera como NUEVA-001, NUEVA-002, ...
export async function generarCodigoReceta(supabase: SupabaseClient, codigoPP: string | null): Promise<string> {
  const desdePP = codigoRecetaDesdePP(codigoPP);
  if (desdePP) return desdePP;

  const { data } = await supabase.from('pp_recetas').select('codigo_receta').like('codigo_receta', 'NUEVA-%');
  const max = (data ?? []).reduce((m, r) => {
    const n = Number(String(r.codigo_receta).slice(6));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `NUEVA-${String(max + 1).padStart(3, '0')}`;
}

export async function reemplazarIngredientes(supabase: SupabaseClient, recetaId: string, input: RecetaPPInput): Promise<string | null> {
  const { error: delErr } = await supabase.from('pp_receta_ingredientes').delete().eq('pp_receta_id', recetaId);
  if (delErr) return delErr.message;

  const { error } = await supabase.from('pp_receta_ingredientes').insert(
    input.ingredientes.map((ing, i) => ({
      pp_receta_id:       recetaId,
      orden:              i + 1,
      codigo_ingrediente: ing.codigo_ingrediente,
      nombre_ingrediente: ing.nombre_ingrediente || ing.codigo_ingrediente || '',
      cantidad:           ing.cantidad,
      unidad_medida:      ing.unidad_medida,
      sin_codigo:         !ing.codigo_ingrediente,
    })),
  );
  return error?.message ?? null;
}

// Recalcula el costo de la receta y, si tiene código PP que aún no existe en productos,
// lo crea para que pueda usarse como ingrediente en platos y otras recetas.
export async function recalcularRecetaYProducto(supabase: SupabaseClient, recetaId: string, input: RecetaPPInput): Promise<string[]> {
  const result = await recalcularCostosPP(supabase, [recetaId]);
  const errores = [...result.errores];

  if (input.codigo_pp) {
    const { data: prod } = await supabase.from('productos').select('codigo').eq('codigo', input.codigo_pp).maybeSingle();
    if (!prod) {
      const { data: rec } = await supabase.from('pp_recetas').select('costo_unitario_calculado').eq('id', recetaId).single();
      const { error } = await supabase.from('productos').insert({
        codigo:         input.codigo_pp,
        nombre:         input.nombre,
        unidad_medida:  input.unidad_rendimiento,
        costo_promedio: Number(rec?.costo_unitario_calculado) || 0,
        activo:         true,
      });
      if (error) errores.push(`${input.codigo_pp} producto: ${error.message}`);
    }
  }
  return errores;
}
