import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';

// POST /api/carta/precio { id, precio_carta } — cambia o elimina (null) SOLO el precio carta (con IVA) de un plato.
// Lo usa el rol Operaciones, que no puede editar la receta, crear, copiar ni eliminar platos.
export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'operaciones']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  const eliminar = body.precio_carta === null;
  const precio = eliminar ? null : Number(body.precio_carta);
  if (!id) return NextResponse.json({ error: 'Plato requerido' }, { status: 400 });
  if (!eliminar && (body.precio_carta === '' || body.precio_carta === undefined || !Number.isFinite(precio) || precio! <= 0 || !Number.isInteger(precio))) {
    return NextResponse.json({ error: 'Ingresa un precio válido (número entero mayor a 0)' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: actual, error: getErr } = await supabase
    .from('carta')
    .select('id,nombre,precio_carta')
    .eq('id', id)
    .maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!actual) return NextResponse.json({ error: 'Plato no encontrado' }, { status: 404 });
  if (actual.precio_carta === precio) return NextResponse.json({ ok: true, precio_carta: precio });

  const { error } = await supabase
    .from('carta')
    .update({ precio_carta: precio, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario: s.rol,
    accion: eliminar ? 'eliminar_precio_carta' : 'editar_precio_carta',
    tabla: 'carta',
    registro_id: id,
    datos_anteriores: { nombre: actual.nombre, precio_carta: actual.precio_carta },
    datos_nuevos: { precio_carta: precio },
  });

  return NextResponse.json({ ok: true, precio_carta: precio });
}
