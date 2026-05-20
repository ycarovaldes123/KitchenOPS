import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase    = await createClient();
  const { codigo }  = await params;
  const body        = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.nombre        !== undefined) updates.nombre        = body.nombre.trim().toUpperCase();
  if (body.unidad_medida !== undefined) updates.unidad_medida = body.unidad_medida;
  if (body.costo_promedio !== undefined) updates.costo_promedio = body.costo_promedio;
  if (body.activo        !== undefined) updates.activo        = body.activo;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('productos').update(updates).eq('codigo', codigo).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'editar_producto',
    tabla:         'productos',
    registro_id:   codigo,
    datos_nuevos:  updates,
  });

  return NextResponse.json(data);
}
