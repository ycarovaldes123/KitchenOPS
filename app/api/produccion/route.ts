import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol, getSessionRol } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  const s = await getSessionRol();
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha');

  let query = supabase
    .from('produccion')
    .select('id,fecha,responsable_nombre,turno,observacion,estado,created_at,detalle_produccion(id,nombre_pp,tipo_pp,cantidad,gramos_por_pp,total_producido,costo_unitario,costo_total),rendimiento(id,verdura,kg_utilizados,rendimiento_kg)')
    .order('created_at', { ascending: false });

  if (fecha) query = query.eq('fecha', fecha);
  else        query = query.limit(20);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'jefatura', 'cocina']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const body = await req.json();
  const { fecha, responsable_id, responsable_nombre, turno, observacion, detalle, rendimiento } = body;

  if (!fecha || !responsable_id || !turno || !observacion?.trim())
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  if (!detalle?.length)
    return NextResponse.json({ error: 'Ingresa al menos un PP' }, { status: 400 });

  const { data: prod, error: pErr } = await supabase
    .from('produccion')
    .insert({ fecha, responsable_id, responsable_nombre, turno, observacion: observacion.trim(), estado: 'REGISTRADO' })
    .select('id').single();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { error: dErr } = await supabase
    .from('detalle_produccion')
    .insert(detalle.map((d: Record<string, unknown>) => ({ ...d, produccion_id: prod.id })));
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  if (rendimiento?.length) {
    const { error: rErr } = await supabase
      .from('rendimiento')
      .insert(rendimiento.map((r: Record<string, unknown>) => ({ ...r, produccion_id: prod.id })));
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: prod.id }, { status: 201 });
}
