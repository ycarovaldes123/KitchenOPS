import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';

// GET/PATCH restringidos a admin/jefatura (roles con verCostos en controlCarnicos): mantiene
// el costo unitario fuera del /maestros general que tambien usa bodega (sin permiso de ver $).
export async function GET() {
  const s = await requireRol(['admin', 'jefatura']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('carnicos_productos')
    .select('id,tipo,codigo,nombre,unidad_medida,costo_unitario')
    .eq('activo', true)
    .order('nombre');

  if (error) return NextResponse.json({ error: `${error.message}. Ejecuta scripts/supabase_carnicos_costo_unitario.sql en Supabase.` }, { status: 500 });
  return NextResponse.json({ productos: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  // Solo admin: mantener costos es una decision financiera, no una tarea de bodega/jefatura.
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  const costo_unitario = Number(body.costo_unitario);
  if (!id) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  if (!Number.isFinite(costo_unitario) || costo_unitario < 0) {
    return NextResponse.json({ error: 'El costo unitario debe ser un numero mayor o igual a 0' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('carnicos_productos')
    .update({ costo_unitario })
    .eq('id', id)
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
