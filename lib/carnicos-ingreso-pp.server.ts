import type { SupabaseClient } from '@supabase/supabase-js';

// Ingreso PP automático de Control Cárnicos.
// Cada línea de Producción cuyo PP se controla en Cárnicos genera un movimiento INGRESO_PP con la
// fecha de la producción (así cae en el mes que corresponde) y la misma cantidad de PP.
// El vínculo es created_by = `auto-produccion:<produccion_id>` (sin cambios de esquema), y la
// sincronización es idempotente: borra los movimientos automáticos de esa producción y los recrea.

export const MARCA_AUTO_PRODUCCION = 'auto-produccion:';
const BODEGA_INGRESO_PP = 'CAMARA CONGELADOS';

// Nombre del PP en Producción (detalle_produccion.nombre_pp) → nombre en carnicos_productos.
export const PP_PRODUCCION_A_CARNICOS: Record<string, string> = {
  'PP. BABY RIBS (UN)': 'PP BABY RIBS (UND)',
  'PP BASTONES DE POLLO (PP)': 'PP BASTONES DE POLLO GRS (200 GR)',
  'PP BASTONES MENU DE NIÑO (PP)': 'PP BASTONES MENU DE NIÑO GRS (50 GRS)',
  'PP CARNE TABLA (PP)': 'PP CARNE TABLA (UND) - Asiento',
  'PP CHUPE CENTOLLA (UND)': 'PP CHUPE CENTOLLA',
  'PP. CIERVO CAZADORA (UN)': 'PP CIERVO CAZADORA (UN)',
  'PP. CIERVO S/ PEPINILLOS (PR)': 'PP CIERVO S/ PEPINILLOS (PR)',
  'PP ENTRAÑA (KG)': 'PP ENTRAÑA EN KG',
  'PP ENTRAÑA (UNIDAD - PACEL)': 'PP ENTRAÑA (UNIDAD - PACEL)',
  'PP FILETE DE POLLO (PP)': 'PP FILETE DE POLLO (PR)',
  'PP. GOULASH (PR=250GR) (PR)': 'PP GOULASH (PR)',
  'PP JAMON SERRANO 25GR (PP)': 'PP JAMON SERRANO 25GR (PR)',
  'PP JAMON SERRANO 80GR (PP)': 'PP JAMON SERRANO 80GR (PR)',
  'PP LOMO LISO (PP)': 'PP LOMO LISO (PR) (400 x PP)',
  'PP MIX TABLA CRIOLLA (MALAYA) (PP)': 'PP MALAYA CRIOLLA GR (200 gr)',
  'PP MALAYA (PP)': 'PP MALAYA GR (400 gr)',
  'PP MECHADA 100GR (PP)': 'PP MECHADA 100 GR RENDIMIENTO = 0.5 PP PLATEADA',
  'PP MECHADA 150GR (PP)': 'PP MECHADA 150 GR RENDIMIENTO = 0.75 PP PLATEADA',
  'PP. OSOBUCO (PR)': 'PP OSOBUCO (UND)',
  'PP PLATEADAS (UND)': 'PP PLATEADA (UN)',
  'PP POLLO TABLA (PP)': 'PP POLLO TABLA GR (200GR)',
  'PP SALAME (PP)': 'PP SALAME GR (80 GR)',
  'PP SALMON CEVICHE (PP)': 'PP SALMON CEVICHE (GR)',
  'PP SALMON TROZO (PP)': 'PP SALMON TROZO GR (250)',
  'PP. SORRENTINOS (PR)': 'PP SORRENTINOS',
  'PP. VALDIVIANO (PR)': 'PP VALDIVIANO',
  'PP. ASADO DE TIRA (PR)': 'PP ASADO DE TIRA  PR',
  'PP. SCHNITZEL DE POLLO (150GR) (UN)': 'PP. SCHNITZEL DE POLLO (150GR) (UN)',
  'PP. SCHNITZEL DE VACUNO (150GR) (UN)': 'PP. SCHNITZEL DE VACUNO (150GR) (UN)',
};

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase();
const MAPA_NORM = new Map(Object.entries(PP_PRODUCCION_A_CARNICOS).map(([k, v]) => [norm(k), norm(v)]));

export function marcaProduccion(produccionId: string) {
  return `${MARCA_AUTO_PRODUCCION}${produccionId}`;
}

/** Quita los movimientos automáticos de una producción (al eliminarla). */
export async function eliminarIngresoPPDeProduccion(supabase: SupabaseClient, produccionId: string) {
  const { error } = await supabase.from('carnicos_movimientos').delete().eq('created_by', marcaProduccion(produccionId));
  if (error) console.error('[carnicos-ingreso-pp] eliminar:', error.message);
}

/**
 * Deja los INGRESO_PP automáticos de una producción iguales a su detalle actual.
 * Nunca lanza: un fallo aquí no debe impedir guardar la producción (se registra en consola).
 */
export async function sincronizarIngresoPPDeProduccion(supabase: SupabaseClient, produccionId: string) {
  try {
    const { data: prod, error: pErr } = await supabase
      .from('produccion')
      .select('id,fecha,responsable_id,responsable_nombre,turno,detalle_produccion(nombre_pp,cantidad)')
      .eq('id', produccionId)
      .maybeSingle();
    if (pErr) throw pErr;

    const marca = marcaProduccion(produccionId);
    const { error: dErr } = await supabase.from('carnicos_movimientos').delete().eq('created_by', marca);
    if (dErr) throw dErr;
    if (!prod) return;

    const detalle = (prod.detalle_produccion ?? []) as Array<{ nombre_pp: string; cantidad: number }>;
    // Suma líneas del mismo PP dentro de la misma producción.
    const porProducto = new Map<string, number>();
    for (const d of detalle) {
      const destino = MAPA_NORM.get(norm(d.nombre_pp ?? ''));
      const cantidad = Number(d.cantidad);
      if (!destino || !Number.isFinite(cantidad) || cantidad <= 0) continue;
      porProducto.set(destino, (porProducto.get(destino) ?? 0) + cantidad);
    }
    if (!porProducto.size) return;

    const { data: productos, error: cErr } = await supabase
      .from('carnicos_productos')
      .select('id,nombre,unidad_medida')
      .eq('es_pp', true);
    if (cErr) throw cErr;
    const productoPorNombre = new Map((productos ?? []).map(p => [norm(p.nombre as string), p]));

    const filas = [];
    for (const [nombreNorm, cantidad] of porProducto) {
      const p = productoPorNombre.get(nombreNorm);
      if (!p) { console.error('[carnicos-ingreso-pp] PP sin producto en Cárnicos:', nombreNorm); continue; }
      filas.push({
        fecha: prod.fecha,
        responsable_id: prod.responsable_id ?? null,
        responsable_nombre: prod.responsable_nombre,
        turno: prod.turno === 'AM' || prod.turno === 'PM' ? prod.turno : null,
        observacion: 'Ingreso automático desde Producción',
        bodega: BODEGA_INGRESO_PP,
        movimiento: 'INGRESO',
        subtipo: 'INGRESO_PP',
        producto_id: p.id,
        producto_nombre: p.nombre,
        unidad_medida: p.unidad_medida,
        cantidad,
        origen: 'manual',
        created_by: marca,
      });
    }
    if (filas.length) {
      const { error: iErr } = await supabase.from('carnicos_movimientos').insert(filas);
      if (iErr) throw iErr;
    }
  } catch (e) {
    console.error('[carnicos-ingreso-pp] sincronizar:', e instanceof Error ? e.message : e);
  }
}
