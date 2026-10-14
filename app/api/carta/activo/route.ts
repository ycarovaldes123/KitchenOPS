import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';

// POST /api/carta/activo { id, activo } — activa o desactiva un plato desde la ficha (boton Activo/Inactivo).
// Solo cambia carta.activo: no toca la receta, los costos, el inventario ni Toteat/Defontana.
export async function POST(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id || typeof body.activo !== 'boolean') {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  const activo: boolean = body.activo;

  const supabase = await createClient();
  const { data: actual, error: getErr } = await supabase
    .from('carta')
    .select('id,nombre,activo')
    .eq('id', id)
    .maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!actual) return NextResponse.json({ error: 'Plato no encontrado' }, { status: 404 });
  if (actual.activo === activo) return NextResponse.json({ ok: true, activo });

  const { error } = await supabase
    .from('carta')
    .update({ activo, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario: s.rol,
    accion: activo ? 'activar_plato_carta' : 'desactivar_plato_carta',
    tabla: 'carta',
    registro_id: id,
    datos_anteriores: { nombre: actual.nombre, activo: actual.activo },
    datos_nuevos: { activo },
  });

  return NextResponse.json({ ok: true, activo });
}
