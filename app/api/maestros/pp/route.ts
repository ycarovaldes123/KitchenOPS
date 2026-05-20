import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';

export async function GET() {
  const s = await requireRol(['admin', 'finanzas', 'jefatura']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('pp')
    .select('id,nombre,tipo_pp,gramos_por_pp,codigo_producto,activo')
    .order('nombre');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const body = await req.json();
  const { nombre, tipo_pp, codigo_producto, gramos_por_pp } = body;

  if (!nombre?.trim() || !tipo_pp) {
    return NextResponse.json({ error: 'nombre y tipo_pp son requeridos' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('pp')
    .insert({ nombre: nombre.trim().toUpperCase(), tipo_pp, codigo_producto: codigo_producto || null, gramos_por_pp: gramos_por_pp || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'crear_pp',
    tabla:         'pp',
    registro_id:   data.id,
    datos_nuevos:  { nombre: data.nombre, tipo_pp: data.tipo_pp },
  });

  return NextResponse.json(data, { status: 201 });
}
