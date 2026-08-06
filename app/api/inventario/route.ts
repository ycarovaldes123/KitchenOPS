import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol, getSessionRol } from '@/lib/auth-server';

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type DetallePayload = {
  id?: string;
  ubicacion?: string | null;
  codigo_producto?: string | null;
  nombre_producto?: string | null;
  cantidad?: number | string | null;
  unidad_medida?: string | null;
};

export async function GET(req: NextRequest) {
  const s = await getSessionRol();
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha');

  let query = supabase
    .from('inventarios')
    .select('id,fecha,responsable_nombre,observacion,created_at,detalle_inventario(id,ubicacion,codigo_producto,nombre_producto,cantidad,unidad_medida)')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });

  if (fecha) query = query.eq('fecha', fecha);
  else query = query.limit(20);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'cocina', 'economo']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const fecha = body.fecha;
  const responsable_id = body.responsable_id;
  const responsable_nombre = body.responsable_nombre;
  const observacion = typeof body.observacion === 'string' ? body.observacion.trim() : '';
  const detalle = Array.isArray(body.detalle) ? body.detalle as DetallePayload[] : [];

  if (!isIsoDate(fecha) || !responsable_id || !String(responsable_nombre || '').trim()) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }

  const detalleValidado = detalle
    .map(row => ({
      ubicacion: String(row.ubicacion || '').trim().toUpperCase(),
      codigo_producto: String(row.codigo_producto || '').trim() || null,
      nombre_producto: String(row.nombre_producto || '').trim() || null,
      cantidad: Number(row.cantidad),
      unidad_medida: String(row.unidad_medida || '').trim().toUpperCase() || null,
    }))
    .filter(row => row.ubicacion && row.codigo_producto && Number.isFinite(row.cantidad) && row.cantidad >= 0);

  if (!detalleValidado.length) {
    return NextResponse.json({ error: 'Agrega al menos un producto con cantidad válida' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: inventario, error: invErr } = await supabase
    .from('inventarios')
    .insert({
      fecha,
      responsable_id,
      responsable_nombre: String(responsable_nombre).trim(),
      observacion,
    })
    .select('id')
    .single();

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

  const { error: detErr } = await supabase
    .from('detalle_inventario')
    .insert(detalleValidado.map(row => ({ ...row, inventario_id: inventario.id })));

  if (detErr) return NextResponse.json({ error: detErr.message }, { status: 500 });
  return NextResponse.json({ id: inventario.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const inventario_id = typeof body.inventario_id === 'string' ? body.inventario_id : '';
  const fecha = body.fecha;
  const observacion = typeof body.observacion === 'string' ? body.observacion.trim() : undefined;
  const detalle = Array.isArray(body.detalle) ? body.detalle as DetallePayload[] : [];
  const delete_ids = Array.isArray(body.delete_ids) ? body.delete_ids.filter((id: unknown) => typeof id === 'string' && id) : [];

  if (!inventario_id) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const supabase = await createClient();

  if (isIsoDate(fecha) || observacion !== undefined) {
    const updatePayload: Record<string, string> = {};
    if (isIsoDate(fecha)) updatePayload.fecha = fecha;
    if (observacion !== undefined) updatePayload.observacion = observacion;
    const { error } = await supabase.from('inventarios').update(updatePayload).eq('id', inventario_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (delete_ids.length) {
    const { error } = await supabase
      .from('detalle_inventario')
      .delete()
      .eq('inventario_id', inventario_id)
      .in('id', delete_ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const row of detalle.filter(item => item.id)) {
    const cantidad = Number(row.cantidad);
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
    }
    const { error } = await supabase
      .from('detalle_inventario')
      .update({
        ubicacion: String(row.ubicacion || '').trim().toUpperCase(),
        cantidad,
        updated_at: new Date().toISOString(),
        updated_by: s.email,
        updated_by_rol: s.rol,
      })
      .eq('id', row.id!)
      .eq('inventario_id', inventario_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nuevos = detalle.filter(item => !item.id);
  if (nuevos.length) {
    const rows = nuevos
      .map(row => ({
        inventario_id,
        ubicacion: String(row.ubicacion || '').trim().toUpperCase(),
        codigo_producto: String(row.codigo_producto || '').trim() || null,
        nombre_producto: String(row.nombre_producto || '').trim() || null,
        cantidad: Number(row.cantidad),
        unidad_medida: String(row.unidad_medida || '').trim().toUpperCase() || null,
      }))
      .filter(row => row.ubicacion && row.codigo_producto && Number.isFinite(row.cantidad) && row.cantidad >= 0);

    if (rows.length) {
      const { error } = await supabase.from('detalle_inventario').insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const inventario_id = typeof body.inventario_id === 'string' ? body.inventario_id : '';
  if (!inventario_id) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from('inventarios').delete().eq('id', inventario_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
