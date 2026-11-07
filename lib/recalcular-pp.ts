import { SupabaseClient } from '@supabase/supabase-js';
import { costoLineaPP } from './costo-receta-pp';
import { sincronizarCostosCarta } from '@/lib/carta-costo';

// Redondeo a 6 decimales = precisión de las columnas numeric(14,6).
// No redondear a entero: un PP por GR/CC cuesta fracciones de peso (ej. 0.856 CLP/GR).
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function igual(a: unknown, b: number): boolean {
  return Math.abs((Number(a) || 0) - b) < 1e-6;
}

// Ejecuta tareas con un máximo de `limite` en paralelo (cada escritura es un round-trip a Supabase).
async function enParalelo<T>(tareas: (() => PromiseLike<T>)[], limite = 12): Promise<T[]> {
  const resultados: T[] = new Array(tareas.length);
  let siguiente = 0;
  async function worker() {
    while (siguiente < tareas.length) {
      const i = siguiente++;
      resultados[i] = await tareas[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, tareas.length) }, worker));
  return resultados;
}

// PostgREST limita el tamaño de la URL: filtros .in() en bloques
async function enBloques<T>(valores: string[], tam: number, fn: (bloque: string[]) => PromiseLike<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < valores.length; i += tam) out.push(...await fn(valores.slice(i, i + tam)));
  return out;
}

export interface RecalcularResult {
  recalculadas: number;
  errores: string[];
}

interface IngredienteRow {
  id: string;
  codigo_ingrediente: string | null;
  nombre_ingrediente: string | null;
  cantidad: number;
  unidad_medida: string;
  costo_unitario_snap: number | null;
  costo_linea_calculado: number | null;
  sin_codigo: boolean | null;
  sin_costo: boolean | null;
}

interface RecetaRow {
  id: string;
  codigo_pp: string | null;
  rendimiento: number;
  unidad_rendimiento: string | null;
  costo_total_calculado: number | null;
  costo_unitario_calculado: number | null;
  estado: string | null;
  pp_receta_ingredientes: IngredienteRow[];
}

/**
 * Recetas activas cuyo costo depende de los productos indicados: las que los usan como
 * ingrediente y, en cadena, las que usan el PP (0502xxx) de esas recetas.
 */
export async function recetasAfectadasPorProductos(supabase: SupabaseClient, codigos: string[]): Promise<string[]> {
  const afectadas = new Set<string>();
  let pendientes = [...new Set(codigos.filter(Boolean))];
  const vistos = new Set(pendientes);

  while (pendientes.length) {
    const ings = await enBloques(pendientes, 200, async bloque => {
      const { data } = await supabase.from('pp_receta_ingredientes').select('pp_receta_id').in('codigo_ingrediente', bloque);
      return (data ?? []) as { pp_receta_id: string }[];
    });
    const nuevas = [...new Set(ings.map(i => i.pp_receta_id))].filter(id => !afectadas.has(id));
    if (!nuevas.length) break;

    const recetas = await enBloques(nuevas, 200, async bloque => {
      const { data } = await supabase.from('pp_recetas').select('id, codigo_pp').eq('activo', true).in('id', bloque);
      return (data ?? []) as { id: string; codigo_pp: string | null }[];
    });
    pendientes = [];
    for (const r of recetas) {
      afectadas.add(r.id);
      if (r.codigo_pp && !vistos.has(r.codigo_pp)) { vistos.add(r.codigo_pp); pendientes.push(r.codigo_pp); }
    }
  }
  return [...afectadas];
}

// ids: si se indica, recalcula solo esas recetas (ej. tras crear/editar una receta o un producto).
export async function recalcularCostosPP(supabase: SupabaseClient, ids?: string[]): Promise<RecalcularResult> {
  if (ids && ids.length === 0) return { recalculadas: 0, errores: [] };

  const select = `id, codigo_pp, rendimiento, unidad_rendimiento, costo_total_calculado, costo_unitario_calculado, estado,
    pp_receta_ingredientes (id, codigo_ingrediente, nombre_ingrediente, cantidad, unidad_medida, costo_unitario_snap, costo_linea_calculado, sin_codigo, sin_costo)`;
  let recetas: RecetaRow[];
  try {
    recetas = ids?.length
      ? await enBloques(ids, 200, async bloque => {
          const { data, error } = await supabase.from('pp_recetas').select(select).eq('activo', true).in('id', bloque);
          if (error) throw new Error(error.message);
          return (data ?? []) as unknown as RecetaRow[];
        })
      : await (async () => {
          const { data, error } = await supabase.from('pp_recetas').select(select).eq('activo', true);
          if (error) throw new Error(error.message);
          return (data ?? []) as unknown as RecetaRow[];
        })();
  } catch (e) {
    return { recalculadas: 0, errores: [e instanceof Error ? e.message : String(e)] };
  }

  // Solo los productos que intervienen (ingredientes + PP de cada receta)
  const codigos = [...new Set(recetas.flatMap(r => [r.codigo_pp, ...r.pp_receta_ingredientes.map(i => i.codigo_ingrediente)]).filter(Boolean))] as string[];
  const productos = await enBloques(codigos, 200, async bloque => {
    const { data } = await supabase.from('productos').select('codigo, unidad_medida, costo_promedio').in('codigo', bloque);
    return (data ?? []) as { codigo: string; unidad_medida: string; costo_promedio: number | null }[];
  });
  const prodMap = new Map<string, { unidad_medida: string; costo_promedio: number }>();
  for (const p of productos) prodMap.set(p.codigo, { unidad_medida: p.unidad_medida, costo_promedio: Number(p.costo_promedio) || 0 });
  const costoOriginal = new Map([...prodMap].map(([k, v]) => [k, v.costo_promedio]));

  // Orden en cadena: una receta que usa el PP de otra receta se calcula después de esa
  const porCodigoPP = new Map(recetas.filter(r => r.codigo_pp).map(r => [r.codigo_pp as string, r.id]));
  const dependeDe = new Map(recetas.map(r => [r.id, new Set(
    r.pp_receta_ingredientes.map(i => i.codigo_ingrediente && porCodigoPP.get(i.codigo_ingrediente)).filter((x): x is string => !!x && x !== r.id),
  )]));
  const ordenadas: RecetaRow[] = [];
  const hechas = new Set<string>();
  let restantes = [...recetas];
  while (restantes.length) {
    const listas = restantes.filter(r => [...dependeDe.get(r.id)!].every(d => hechas.has(d)));
    const lote = listas.length ? listas : restantes; // ciclo: se procesa en el orden recibido
    for (const r of lote) { ordenadas.push(r); hechas.add(r.id); }
    restantes = restantes.filter(r => !hechas.has(r.id));
  }

  // 1) Calcular todo en memoria
  const escrituras: (() => PromiseLike<string | null>)[] = [];
  const ahora = new Date().toISOString();
  let recalculadas = 0;

  for (const receta of ordenadas) {
    let costoTotal = 0;
    let hasSinCodigo = false;
    let hasSinCosto = false;

    for (const ing of receta.pp_receta_ingredientes ?? []) {
      const prod = ing.codigo_ingrediente ? prodMap.get(ing.codigo_ingrediente) : null;
      // El agua de la llave no es un producto inventariado: costo 0 sin dejar la receta INCOMPLETA.
      const sinCodigo = (!ing.codigo_ingrediente || !prod) && !esAguaSinCosto(ing);
      const costoUnit = prod?.costo_promedio ?? 0;
      const sinCosto = !sinCodigo && costoUnit === 0;
      const costoLinea = prod ? round6(costoLineaPP(ing.cantidad, ing.unidad_medida, prod.unidad_medida, costoUnit)) : 0;

      if (sinCodigo) hasSinCodigo = true;
      if (sinCosto) hasSinCosto = true;
      costoTotal += costoLinea;

      // Solo se escribe la línea si algo cambió
      if (!igual(ing.costo_unitario_snap, costoUnit) || !igual(ing.costo_linea_calculado, costoLinea)
          || !!ing.sin_codigo !== sinCodigo || !!ing.sin_costo !== sinCosto) {
        escrituras.push(async () => {
          const { error } = await supabase.from('pp_receta_ingredientes').update({
            costo_unitario_snap: costoUnit, costo_linea_calculado: costoLinea, sin_codigo: sinCodigo, sin_costo: sinCosto,
          }).eq('id', ing.id);
          return error ? `ingrediente ${ing.id}: ${error.message}` : null;
        });
      }
    }

    const rendimiento = Number(receta.rendimiento) || 1;
    costoTotal = round6(costoTotal);
    const costoUnitario = round6(costoTotal / rendimiento);
    const estado = hasSinCodigo ? 'INCOMPLETO' : hasSinCosto ? 'PENDIENTE' : 'ACTIVO';
    recalculadas++;

    if (!igual(receta.costo_total_calculado, costoTotal) || !igual(receta.costo_unitario_calculado, costoUnitario) || receta.estado !== estado) {
      escrituras.push(async () => {
        const { error } = await supabase.from('pp_recetas').update({
          costo_total_calculado: costoTotal, costo_unitario_calculado: costoUnitario, estado, calculado_at: ahora,
        }).eq('id', receta.id);
        return error ? `${receta.id}: ${error.message}` : null;
      });
    }

    // Sincronizar costo al 0502xxx — fuente de verdad vs Softland desactualizado.
    // prodMap se actualiza en memoria para que las recetas siguientes de la cadena vean el costo nuevo.
    if (receta.codigo_pp && costoUnitario > 0) {
      const existing = prodMap.get(receta.codigo_pp);
      prodMap.set(receta.codigo_pp, {
        unidad_medida: existing?.unidad_medida ?? receta.unidad_rendimiento ?? 'GR',
        costo_promedio: costoUnitario,
      });
    }
  }

  // Productos PP cuyo costo cambió respecto de lo que había en la base
  for (const [codigo, original] of costoOriginal) {
    const nuevo = prodMap.get(codigo)!.costo_promedio;
    if (porCodigoPP.has(codigo) && !igual(original, nuevo)) {
      escrituras.push(async () => {
        const { error } = await supabase.from('productos').update({ costo_promedio: nuevo, updated_at: ahora }).eq('codigo', codigo);
        return error ? `producto ${codigo}: ${error.message}` : null;
      });
    }
  }

  // 2) Escribir solo lo que cambió, en paralelo
  const errores = (await enParalelo(escrituras)).filter((e): e is string => !!e);

  // 3) Llevar los costos nuevos (productos y PP) a las recetas de los platos de Costos
  const carta = await sincronizarCostosCarta(supabase);
  errores.push(...carta.errores.map(e => `carta: ${e}`));
  return { recalculadas, errores };
}

const AGUA_SIN_COSTO = new Set(['AGUA', 'AGUA POTABLE', 'AGUA FRIA', 'AGUA CALIENTE', 'AGUA HERVIDA']);

function esAguaSinCosto(ing: { codigo_ingrediente: string | null; nombre_ingrediente: string | null }): boolean {
  if (ing.codigo_ingrediente) return false;
  const nombre = (ing.nombre_ingrediente ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/\(.*?\)/g, '').trim().toUpperCase();
  return AGUA_SIN_COSTO.has(nombre);
}
