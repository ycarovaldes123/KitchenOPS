import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';

// GET /api/tendencia?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Returns daily aggregated data for trend charts
export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'jefatura']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde') ?? '';
  const hasta = searchParams.get('hasta') ?? '';

  const [
    { data: producciones },
    { data: colaciones },
    { data: mermasDetalle },
  ] = await Promise.all([
    (() => {
      let q = supabase
        .from('produccion')
        .select('fecha,detalle_produccion(total_producido,costo_total)');
      if (desde) q = q.gte('fecha', desde);
      if (hasta) q = q.lte('fecha', hasta);
      return q.order('fecha');
    })(),
    (() => {
      let q = supabase
        .from('colacion')
        .select('fecha,costo_total');
      if (desde) q = q.gte('fecha', desde);
      if (hasta) q = q.lte('fecha', hasta);
      return q;
    })(),
    (() => {
      let q = supabase
        .from('mermas')
        .select('fecha,detalle_mermas(motivo,costo_total)');
      if (desde) q = q.gte('fecha', desde);
      if (hasta) q = q.lte('fecha', hasta);
      return q;
    })(),
  ]);

  // Build date map
  const byDate = new Map<string, { informes_count: number; clp_prod: number; clp_mermas: number; clp_colacion: number }>();

  type DetalleRow = { total_producido: number | null; costo_total: number | null };
  for (const p of producciones ?? []) {
    const fecha = (p as { fecha: string }).fecha;
    const detalles = ((p as { detalle_produccion: DetalleRow[] }).detalle_produccion ?? []);
    const clp = detalles.reduce((s, d) => s + (d.costo_total ?? 0), 0);
    const prev = byDate.get(fecha) ?? { informes_count: 0, clp_prod: 0, clp_mermas: 0, clp_colacion: 0 };
    byDate.set(fecha, { ...prev, informes_count: prev.informes_count + 1, clp_prod: prev.clp_prod + clp });
  }

  type DetalleMermaRow = { motivo: string | null; costo_total: number | null };
  for (const m of mermasDetalle ?? []) {
    const fecha = (m as { fecha: string }).fecha;
    const clp = ((m as { detalle_mermas: DetalleMermaRow[] }).detalle_mermas ?? [])
      .reduce((s, d) => s + (d.costo_total ?? 0), 0);
    const prev = byDate.get(fecha) ?? { informes_count: 0, clp_prod: 0, clp_mermas: 0, clp_colacion: 0 };
    byDate.set(fecha, { ...prev, clp_mermas: prev.clp_mermas + clp });
  }

  for (const c of colaciones ?? []) {
    const fecha = (c as { fecha: string; costo_total: number | null }).fecha;
    const clp = (c as { costo_total: number | null }).costo_total ?? 0;
    const prev = byDate.get(fecha) ?? { informes_count: 0, clp_prod: 0, clp_mermas: 0, clp_colacion: 0 };
    byDate.set(fecha, { ...prev, clp_colacion: prev.clp_colacion + clp });
  }

  // Motivos de merma — aggregated from detalle_mermas
  const motivoCount = new Map<string, number>();
  for (const m of mermasDetalle ?? []) {
    for (const d of ((m as { detalle_mermas: DetalleMermaRow[] }).detalle_mermas ?? [])) {
      const motivo = d.motivo ?? 'Sin motivo';
      motivoCount.set(motivo, (motivoCount.get(motivo) ?? 0) + 1);
    }
  }
  const top_motivos = Array.from(motivoCount.entries())
    .map(([motivo, count]) => ({ motivo, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const verCostos = s.rol === 'admin' || s.rol === 'finanzas';

  const dias = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({
      fecha,
      informes_count:  v.informes_count,
      clp_produccion: verCostos ? Math.round(v.clp_prod)     : null,
      clp_mermas:     verCostos ? Math.round(v.clp_mermas)   : null,
      clp_colacion:   verCostos ? Math.round(v.clp_colacion) : null,
    }));

  return NextResponse.json({ dias, top_motivos });
}
