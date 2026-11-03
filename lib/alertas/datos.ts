// Carga de datos para el analizador de Alertas. SOLO SELECT: no hay insert/update/delete en este archivo.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DatosSistema {
  produccion: { id: string; fecha: string; responsable_nombre: string | null; observacion: string | null; created_at: string }[];
  detalleProduccion: { id: string; produccion_id: string; pp_id: string | null; nombre_pp: string | null; tipo_pp: string | null; cantidad: number; gramos_por_pp: number | null; total_producido: number | null; codigo_producto: string | null; costo_unitario: number | null; costo_total: number | null }[];
  rendimiento: { id: string; produccion_id: string | null; fecha: string; verdura: string; kg_utilizados: number; rendimiento_kg: number; responsable_nombre: string | null }[];
  mermas: { id: string; fecha: string; responsable_nombre: string | null; observacion: string | null; created_at: string }[];
  detalleMermas: { id: string; merma_id: string; codigo_producto: string | null; nombre_producto: string | null; cantidad: number; unidad_medida: string | null; motivo: string | null; costo_unitario: number | null }[];
  colacion: { id: string; fecha: string; responsable_nombre: string | null; menu: string | null; n_inscritos: number | null; created_at: string }[];
  detalleColacion: { id: string; colacion_id: string; codigo_producto: string | null; nombre_producto: string | null; cantidad: number; unidad_medida: string | null; costo_unitario: number | null }[];
  carnicos: { id: string; fecha: string; responsable_nombre: string | null; origen: string | null; movimiento: string | null; subtipo: string | null; producto_id: string | null; producto_nombre: string | null; unidad_medida: string | null; cantidad: number; observacion: string | null; created_at: string }[];
  productos: { codigo: string; nombre: string; unidad_medida: string | null; costo_promedio: number | null; activo: boolean | null }[];
  pp: { id: string; nombre: string; tipo_pp: string | null; gramos_por_pp: number | null; codigo_producto: string | null; activo: boolean | null }[];
  recetas: { id: string; codigo_receta: string; codigo_pp: string | null; nombre: string; rendimiento: number; unidad_rendimiento: string | null; activo: boolean | null }[];
}

const PAGINA = 1000;

async function todas<T>(supabase: SupabaseClient, tabla: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase.from(tabla).select(select).order('id', { ascending: true }).range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...(data as T[]));
    if (!data || data.length < PAGINA) return out;
  }
}

async function productos(supabase: SupabaseClient): Promise<DatosSistema['productos']> {
  const out: DatosSistema['productos'] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase.from('productos').select('codigo,nombre,unidad_medida,costo_promedio,activo').order('codigo').range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`productos: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGINA) return out;
  }
}

export async function cargarDatosSistema(supabase: SupabaseClient): Promise<DatosSistema> {
  const [produccion, detalleProduccion, rendimiento, mermas, detalleMermas, colacion, detalleColacion, carnicos, prods, pp, recetas] = await Promise.all([
    todas<DatosSistema['produccion'][number]>(supabase, 'produccion', 'id,fecha,responsable_nombre,observacion,created_at'),
    todas<DatosSistema['detalleProduccion'][number]>(supabase, 'detalle_produccion', 'id,produccion_id,pp_id,nombre_pp,tipo_pp,cantidad,gramos_por_pp,total_producido,codigo_producto,costo_unitario,costo_total'),
    todas<DatosSistema['rendimiento'][number]>(supabase, 'rendimiento', 'id,produccion_id,fecha,verdura,kg_utilizados,rendimiento_kg,responsable_nombre'),
    todas<DatosSistema['mermas'][number]>(supabase, 'mermas', 'id,fecha,responsable_nombre,observacion,created_at'),
    todas<DatosSistema['detalleMermas'][number]>(supabase, 'detalle_mermas', 'id,merma_id,codigo_producto,nombre_producto,cantidad,unidad_medida,motivo,costo_unitario'),
    todas<DatosSistema['colacion'][number]>(supabase, 'colacion', 'id,fecha,responsable_nombre,menu,n_inscritos,created_at'),
    todas<DatosSistema['detalleColacion'][number]>(supabase, 'detalle_colacion', 'id,colacion_id,codigo_producto,nombre_producto,cantidad,unidad_medida,costo_unitario'),
    todas<DatosSistema['carnicos'][number]>(supabase, 'carnicos_movimientos', 'id,fecha,responsable_nombre,origen,movimiento,subtipo,producto_id,producto_nombre,unidad_medida,cantidad,observacion,created_at'),
    productos(supabase),
    todas<DatosSistema['pp'][number]>(supabase, 'pp', 'id,nombre,tipo_pp,gramos_por_pp,codigo_producto,activo'),
    todas<DatosSistema['recetas'][number]>(supabase, 'pp_recetas', 'id,codigo_receta,codigo_pp,nombre,rendimiento,unidad_rendimiento,activo'),
  ]);
  return { produccion, detalleProduccion, rendimiento, mermas, detalleMermas, colacion, detalleColacion, carnicos, productos: prods, pp, recetas };
}
