import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';

// GET /api/kpis?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'jefatura']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde') ?? '';
  const hasta = searchParams.get('hasta') ?? '';

  const [
    { data: producciones },
    { data: mermas },
    { data: colaciones },
    { data: rendimientos },
  ] = await Promise.all([
    (() => {
      let q = supabase
        .from('produccion')
        .select('id,fecha,detalle_produccion(total_producido,costo_total)');
      if (desde) q = q.gte('fecha', desde);
      if (hasta) q = q.lte('fecha', hasta);
      return q;
    })(),
    (() => {
      let q = supabase
        .from('mermas')
        .select('id,fecha,detalle_mermas(costo_total)');
      if (desde) q = q.gte('fecha', desde);
      if (hasta) q = q.lte('fecha', hasta);
      return q;
    })(),
    (() => {
      let q = supabase
        .from('colacion')
        .select('id,fecha,costo_total,n_inscritos');
      if (desde) q = q.gte('fecha', desde);
      if (hasta) q = q.lte('fecha', hasta);
      return q;
    })(),
    (() => {
      let q = supabase
        .from('rendimiento')
        .select('id,verdura,kg_utilizados,rendimiento_kg,fecha');
      if (desde) q = q.gte('fecha', desde);
      if (hasta) q = q.lte('fecha', hasta);
      return q;
    })(),
  ]);

  // ── Producción ──────────────────────────────────────────────
  const total_informes = producciones?.length ?? 0;

  type DetalleRow = { total_producido: number | null; costo_total: number | null };
  const total_produccion_clp = (producciones ?? []).flatMap(p =>
    ((p as { detalle_produccion: DetalleRow[] }).detalle_produccion ?? [])
      .map(d => d.costo_total ?? 0)
  ).reduce((s, v) => s + v, 0);

  // ── Mermas ───────────────────────────────────────────────────
  type DetalleMermaRow = { costo_total: number | null };
  const total_mermas_clp = (mermas ?? []).flatMap(m =>
    ((m as { detalle_mermas: DetalleMermaRow[] }).detalle_mermas ?? [])
      .map(d => d.costo_total ?? 0)
  ).reduce((s, v) => s + v, 0);

  // ── Colación ─────────────────────────────────────────────────
  type ColRow = { costo_total: number | null; n_inscritos: number | null };
  const total_colacion_clp  = (colaciones as ColRow[] ?? []).reduce((s, c) => s + (c.costo_total ?? 0), 0);
  const total_inscritos     = (colaciones as ColRow[] ?? []).reduce((s, c) => s + (c.n_inscritos ?? 0), 0);
  const costo_por_plato_promedio = total_inscritos > 0
    ? Math.round(total_colacion_clp / total_inscritos)
    : 0;

  // ── Rendimiento promedio ──────────────────────────────────────
  type RendRow = { kg_utilizados: number | null; rendimiento_kg: number | null };
  const rendRows = rendimientos as RendRow[] ?? [];
  const totalKgUsados  = rendRows.reduce((s, r) => s + (r.kg_utilizados ?? 0), 0);
  const totalKgMerma   = rendRows.reduce((s, r) => s + Math.max(0, (r.kg_utilizados ?? 0) - (r.rendimiento_kg ?? 0)), 0);
  const merma_pct_promedio = totalKgUsados > 0
    ? Math.round((totalKgMerma / totalKgUsados) * 1000) / 10
    : null;

  const costo_por_orden = total_informes > 0
    ? Math.round(total_produccion_clp / total_informes)
    : 0;

  const verCostos = s.rol === 'admin' || s.rol === 'finanzas';

  return NextResponse.json({
    total_informes,
    total_produccion_clp:     verCostos ? Math.round(total_produccion_clp) : null,
    costo_por_orden:          verCostos ? costo_por_orden : null,
    total_mermas_clp:         verCostos ? Math.round(total_mermas_clp) : null,
    total_colacion_clp:       verCostos ? Math.round(total_colacion_clp) : null,
    costo_por_plato_promedio: verCostos ? costo_por_plato_promedio : null,
    merma_pct_promedio,
    total_colaciones:         colaciones?.length ?? 0,
    total_mermas:             mermas?.length ?? 0,
  });
}
