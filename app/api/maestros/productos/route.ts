import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';

export async function GET() {
  const s = await requireRol(['admin', 'finanzas', 'jefatura']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('productos')
    .select('codigo,nombre,unidad_medida,costo_promedio,activo,updated_at')
    .order('nombre');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const body = await req.json();
  const { codigo, nombre, unidad_medida, costo_promedio } = body;

  if (!codigo?.trim() || !nombre?.trim() || !unidad_medida) {
    return NextResponse.json({ error: 'codigo, nombre y unidad_medida son requeridos' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('productos')
    .insert({ codigo: codigo.trim(), nombre: nombre.trim().toUpperCase(), unidad_medida, costo_promedio: costo_promedio ?? 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'crear_producto',
    tabla:         'productos',
    registro_id:   data.codigo,
    datos_nuevos:  { codigo: data.codigo, nombre: data.nombre, costo_promedio: data.costo_promedio },
  });

  return NextResponse.json(data, { status: 201 });
}
