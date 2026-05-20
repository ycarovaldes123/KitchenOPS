import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { id }  = await params;
  const body    = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.nombre      !== undefined) updates.nombre       = body.nombre.trim().toUpperCase();
  if (body.tipo_pp     !== undefined) updates.tipo_pp      = body.tipo_pp;
  if (body.codigo_producto !== undefined) updates.codigo_producto = body.codigo_producto || null;
  if (body.gramos_por_pp   !== undefined) updates.gramos_por_pp   = body.gramos_por_pp   || null;
  if (body.activo      !== undefined) updates.activo       = body.activo;

  const { data, error } = await supabase.from('pp').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'editar_pp',
    tabla:         'pp',
    registro_id:   id,
    datos_nuevos:  updates,
  });

  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { id }  = await params;
  const { error } = await supabase.from('pp').update({ activo: false }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'desactivar_pp',
    tabla:         'pp',
    registro_id:   id,
  });

  return NextResponse.json({ ok: true });
}
