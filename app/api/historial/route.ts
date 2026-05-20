import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getSessionRol } from '@/lib/auth-server';

function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

// GET /api/historial?tipo=produccion|colacion|mermas&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const s = await getSessionRol();
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const tipo  = searchParams.get('tipo')  ?? 'produccion';
  let desde = searchParams.get('desde') ?? '';
  let hasta  = searchParams.get('hasta') ?? '';

  // Cocina solo puede ver el historial de hoy
  if (s.rol === 'cocina') {
    const hoy = hoyChile();
    desde = hoy;
    hasta  = hoy;
  }

  if (tipo === 'produccion') {
    let q = supabase
      .from('produccion')
      .select('id,fecha,responsable_nombre,turno,observacion,estado,created_at,detalle_produccion(id,nombre_pp,tipo_pp,cantidad,gramos_por_pp,total_producido,costo_unitario,costo_total),rendimiento(id,verdura,kg_utilizados,rendimiento_kg)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    const { data, error } = await q.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (tipo === 'colacion') {
    let q = supabase
      .from('colacion')
      .select('id,fecha,responsable_nombre,menu,n_inscritos,costo_total,created_at,detalle_colacion(id,nombre_producto,cantidad,unidad_medida,costo_unitario,costo_total)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    const { data, error } = await q.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (tipo === 'mermas') {
    let q = supabase
      .from('mermas')
      .select('id,fecha,responsable_nombre,observacion,estado,created_at,detalle_mermas(id,nombre_producto,cantidad,unidad_medida,motivo,costo_unitario,costo_total)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    const { data, error } = await q.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
}
