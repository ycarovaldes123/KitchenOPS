import type { SupabaseClient } from '@supabase/supabase-js';

type ProduccionDetalle = { total_producido: number | null; costo_total: number | null; nombre_pp: string | null };
type ProduccionRow = { id?: string; fecha: string; detalle_produccion: ProduccionDetalle[] | null };
type DetalleMerma = { motivo: string | null; costo_total: number | null; nombre_producto: string | null };
type MermaRow = { id?: string; fecha: string; detalle_mermas: DetalleMerma[] | null };
type ColacionRow = { id?: string; fecha: string; costo_total: number | null; n_inscritos: number | null; menu: string | null };
type RendimientoRow = { id?: string; fecha: string; kg_utilizados: number | null; rendimiento_kg: number | null };

export interface DashboardKpis {
  total_informes: number;
  total_produccion_clp: number | null;
  costo_por_orden: number | null;
  total_mermas_clp: number | null;
  total_colacion_clp: number | null;
  costo_por_plato_promedio: number | null;
  merma_pct_promedio: number | null;
  total_colaciones: number;
  total_mermas: number;
}

export interface DashboardDia {
  fecha: string;
  informes_count: number;
  clp_produccion: number | null;
  clp_mermas: number | null;
  clp_colacion: number | null;
  colacion_menu: string | null;
}

export interface DashboardMotivo {
  motivo: string;
  count: number;
}

export interface ColacionDestacada {
  fecha: string;
  menu: string;
  costo_total: number;
  costo_por_plato: number | null;
}

export interface MermaDestacada {
  fecha: string;
  nombre_producto: string;
  motivo: string | null;
  costo_total: number;
}

export interface ProduccionDestacada {
  fecha: string;
  nombre_pp: string;
  costo_total: number;
}

export interface DashboardDestacados {
  colacion_mas_cara: ColacionDestacada | null;
  merma_mas_cara: MermaDestacada | null;
  produccion_mas_cara: ProduccionDestacada | null;
}

export interface DashboardPayload {
  kpis: DashboardKpis;
  dias: DashboardDia[];
  top_motivos: DashboardMotivo[];
  destacados: DashboardDestacados;
}

export async function getDashboardPayload(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
  verCostos: boolean,
): Promise<DashboardPayload> {
  const [
    { data: producciones, error: prodErr },
    { data: mermas, error: merErr },
    { data: colaciones, error: colErr },
    { data: rendimientos, error: rendErr },
  ] = await Promise.all([
    queryProducciones(supabase, desde, hasta),
    queryMermas(supabase, desde, hasta),
    queryColaciones(supabase, desde, hasta),
    queryRendimientos(supabase, desde, hasta),
  ]);

  const firstError = prodErr ?? merErr ?? colErr ?? rendErr;
  if (firstError) throw new Error(firstError.message);

  const prodRows = (producciones ?? []) as ProduccionRow[];
  const merRows = (mermas ?? []) as MermaRow[];
  const colRows = (colaciones ?? []) as ColacionRow[];
  const rendRows = (rendimientos ?? []) as RendimientoRow[];

  const total_informes = prodRows.length;
  const total_produccion_clp = prodRows.reduce((sum, p) =>
    sum + (p.detalle_produccion ?? []).reduce((acc, d) => acc + (d.costo_total ?? 0), 0)
  , 0);

  const total_mermas_clp = merRows.reduce((sum, m) =>
    sum + (m.detalle_mermas ?? []).reduce((acc, d) => acc + (d.costo_total ?? 0), 0)
  , 0);

  const total_colacion_clp = colRows.reduce((sum, c) => sum + (c.costo_total ?? 0), 0);
  const total_inscritos = colRows.reduce((sum, c) => sum + (c.n_inscritos ?? 0), 0);
  const costo_por_plato_promedio = total_inscritos > 0
    ? Math.round(total_colacion_clp / total_inscritos)
    : 0;

  const totalKgUsados = rendRows.reduce((sum, r) => sum + (r.kg_utilizados ?? 0), 0);
  const totalKgMerma = rendRows.reduce((sum, r) =>
    sum + Math.max(0, (r.kg_utilizados ?? 0) - (r.rendimiento_kg ?? 0))
  , 0);
  const merma_pct_promedio = totalKgUsados > 0
    ? Math.round((totalKgMerma / totalKgUsados) * 1000) / 10
    : null;

  const costo_por_orden = total_informes > 0
    ? Math.round(total_produccion_clp / total_informes)
    : 0;

  const byDate = new Map<string, { informes_count: number; clp_prod: number; clp_mermas: number; clp_colacion: number; menus: string[] }>();

  for (const p of prodRows) {
    const clp = (p.detalle_produccion ?? []).reduce((sum, d) => sum + (d.costo_total ?? 0), 0);
    const prev = byDate.get(p.fecha) ?? { informes_count: 0, clp_prod: 0, clp_mermas: 0, clp_colacion: 0, menus: [] };
    byDate.set(p.fecha, {
      ...prev,
      informes_count: prev.informes_count + 1,
      clp_prod: prev.clp_prod + clp,
    });
  }

  const motivoCount = new Map<string, number>();
  for (const m of merRows) {
    const clp = (m.detalle_mermas ?? []).reduce((sum, d) => sum + (d.costo_total ?? 0), 0);
    const prev = byDate.get(m.fecha) ?? { informes_count: 0, clp_prod: 0, clp_mermas: 0, clp_colacion: 0, menus: [] };
    byDate.set(m.fecha, { ...prev, clp_mermas: prev.clp_mermas + clp });

    for (const d of m.detalle_mermas ?? []) {
      const motivo = d.motivo ?? 'Sin motivo';
      motivoCount.set(motivo, (motivoCount.get(motivo) ?? 0) + 1);
    }
  }

  for (const c of colRows) {
    const prev = byDate.get(c.fecha) ?? { informes_count: 0, clp_prod: 0, clp_mermas: 0, clp_colacion: 0, menus: [] };
    byDate.set(c.fecha, {
      ...prev,
      clp_colacion: prev.clp_colacion + (c.costo_total ?? 0),
      menus: c.menu ? [...prev.menus, c.menu] : prev.menus,
    });
  }

  const dias = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({
      fecha,
      informes_count: v.informes_count,
      clp_produccion: verCostos ? Math.round(v.clp_prod) : null,
      clp_mermas: verCostos ? Math.round(v.clp_mermas) : null,
      clp_colacion: verCostos ? Math.round(v.clp_colacion) : null,
      colacion_menu: verCostos && v.menus.length > 0 ? v.menus.join(' / ') : null,
    }));

  const top_motivos = Array.from(motivoCount.entries())
    .map(([motivo, count]) => ({ motivo, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Registros destacados: siempre visibles para todos los roles, sin filtrar por verCostos.
  let colacion_mas_cara: ColacionDestacada | null = null;
  for (const c of colRows) {
    if (c.costo_total != null && (colacion_mas_cara == null || c.costo_total > colacion_mas_cara.costo_total)) {
      colacion_mas_cara = {
        fecha: c.fecha,
        menu: c.menu ?? 'Sin menu registrado',
        costo_total: c.costo_total,
        costo_por_plato: c.n_inscritos && c.n_inscritos > 0 ? Math.round(c.costo_total / c.n_inscritos) : null,
      };
    }
  }

  let merma_mas_cara: MermaDestacada | null = null;
  for (const m of merRows) {
    for (const d of m.detalle_mermas ?? []) {
      if (d.costo_total != null && (merma_mas_cara == null || d.costo_total > merma_mas_cara.costo_total)) {
        merma_mas_cara = {
          fecha: m.fecha,
          nombre_producto: d.nombre_producto ?? 'Sin producto',
          motivo: d.motivo,
          costo_total: d.costo_total,
        };
      }
    }
  }

  let produccion_mas_cara: ProduccionDestacada | null = null;
  for (const p of prodRows) {
    for (const d of p.detalle_produccion ?? []) {
      if (d.costo_total != null && (produccion_mas_cara == null || d.costo_total > produccion_mas_cara.costo_total)) {
        produccion_mas_cara = {
          fecha: p.fecha,
          nombre_pp: d.nombre_pp ?? 'Sin producto',
          costo_total: d.costo_total,
        };
      }
    }
  }

  return {
    kpis: {
      total_informes,
      total_produccion_clp: verCostos ? Math.round(total_produccion_clp) : null,
      costo_por_orden: verCostos ? costo_por_orden : null,
      total_mermas_clp: verCostos ? Math.round(total_mermas_clp) : null,
      total_colacion_clp: verCostos ? Math.round(total_colacion_clp) : null,
      costo_por_plato_promedio: verCostos ? costo_por_plato_promedio : null,
      merma_pct_promedio,
      total_colaciones: colRows.length,
      total_mermas: merRows.length,
    },
    dias,
    top_motivos,
    destacados: { colacion_mas_cara, merma_mas_cara, produccion_mas_cara },
  };
}

function queryProducciones(supabase: SupabaseClient, desde: string, hasta: string) {
  let q = supabase
    .from('produccion')
    .select('id,fecha,detalle_produccion(total_producido,costo_total,nombre_pp)');
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  return q.order('fecha');
}

function queryMermas(supabase: SupabaseClient, desde: string, hasta: string) {
  let q = supabase
    .from('mermas')
    .select('id,fecha,detalle_mermas(motivo,costo_total,nombre_producto)');
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  return q.order('fecha');
}

function queryColaciones(supabase: SupabaseClient, desde: string, hasta: string) {
  let q = supabase
    .from('colacion')
    .select('id,fecha,costo_total,n_inscritos,menu');
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  return q.order('fecha');
}

function queryRendimientos(supabase: SupabaseClient, desde: string, hasta: string) {
  let q = supabase
    .from('rendimiento')
    .select('id,fecha,kg_utilizados,rendimiento_kg');
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  return q;
}
