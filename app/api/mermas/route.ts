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
    .from('mermas')
    .select('id,fecha,responsable_nombre,observacion,estado,created_at,detalle_mermas(id,nombre_producto,cantidad,unidad_medida,motivo,costo_unitario,costo_total)')
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
  const { fecha, responsable_id, responsable_nombre, observacion, detalle } = body;

  if (!fecha || !responsable_id || !observacion?.trim())
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  if (!detalle?.length)
    return NextResponse.json({ error: 'Ingresa al menos un producto' }, { status: 400 });

  const { data: mer, error: mErr } = await supabase
    .from('mermas')
    .insert({ fecha, responsable_id, responsable_nombre, observacion: observacion.trim(), estado: 'REGISTRADO' })
    .select('id').single();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const { error: dErr } = await supabase
    .from('detalle_mermas')
    .insert(detalle.map((d: Record<string, unknown>) => ({ ...d, merma_id: mer.id })));
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  return NextResponse.json({ id: mer.id }, { status: 201 });
}
