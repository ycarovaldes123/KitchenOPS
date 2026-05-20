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
    .from('colacion')
    .select('id,fecha,responsable_nombre,menu,n_inscritos,costo_total,created_at,detalle_colacion(id,nombre_producto,cantidad,unidad_medida,costo_unitario,costo_total)')
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
  const { fecha, responsable_id, responsable_nombre, menu, n_inscritos, detalle } = body;

  if (!fecha || !responsable_id || !menu?.trim())
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  if (n_inscritos == null || n_inscritos <= 0)
    return NextResponse.json({ error: 'N° inscritos debe ser mayor que 0' }, { status: 400 });
  if (!detalle?.length)
    return NextResponse.json({ error: 'Ingresa al menos un ingrediente' }, { status: 400 });

  const costo_total = detalle.reduce((s: number, d: { costo_total?: number }) => s + (d.costo_total ?? 0), 0);

  const { data: col, error: cErr } = await supabase
    .from('colacion')
    .insert({ fecha, responsable_id, responsable_nombre, menu: menu.trim(), n_inscritos, costo_total })
    .select('id').single();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const { error: dErr } = await supabase
    .from('detalle_colacion')
    .insert(detalle.map((d: Record<string, unknown>) => ({ ...d, colacion_id: col.id })));
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  return NextResponse.json({ id: col.id }, { status: 201 });
}
