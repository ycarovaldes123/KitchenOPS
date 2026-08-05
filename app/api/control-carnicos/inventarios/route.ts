import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { BODEGAS_CARNICOS } from '@/lib/config-carnicos';

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type DetalleInventarioPayload = {
  producto_id?: string;
  producto_nombre?: string;
  unidad_medida?: string;
  cantidad?: number | string;
};

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'bodega']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const fechaUnica = searchParams.get('fecha');
  const desde = searchParams.get('desde') ?? fechaUnica;
  const hasta = searchParams.get('hasta') ?? fechaUnica;
  if (!isIsoDate(desde) || !isIsoDate(hasta)) return NextResponse.json({ error: 'Debes enviar fecha (o desde/hasta) en formato YYYY-MM-DD' }, { status: 400 });

  const { data, error } = await supabase
    .from('carnicos_inventarios')
    .select('id,fecha,responsable_nombre,turno,bodega,tipo,producto_id,producto_nombre,unidad_medida,cantidad')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .order('bodega');

  if (error) return NextResponse.json({ error: `${error.message}. Ejecuta scripts/supabase_control_carnicos.sql en Supabase.` }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'bodega']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const fecha = body.fecha;
  const responsable_id = typeof body.responsable_id === 'string' ? body.responsable_id : null;
  const responsable_nombre = String(body.responsable_nombre || '').trim();
  const turno = body.turno === 'AM' || body.turno === 'PM' ? body.turno : null;
  const bodega = String(body.bodega || '').trim().toUpperCase();
  const tipo = String(body.tipo || '').trim().toUpperCase();
  const detalle = Array.isArray(body.detalle) ? (body.detalle as DetalleInventarioPayload[]) : [];

  if (!isIsoDate(fecha) || !responsable_nombre) {
    return NextResponse.json({ error: 'Faltan fecha o responsable' }, { status: 400 });
  }
  if (!BODEGAS_CARNICOS.includes(bodega as never)) {
    return NextResponse.json({ error: 'Bodega invalida' }, { status: 400 });
  }
  if (tipo !== 'INICIAL' && tipo !== 'FINAL') {
    return NextResponse.json({ error: 'Tipo invalido (INICIAL o FINAL)' }, { status: 400 });
  }

  const filas = detalle
    .map(row => ({
      fecha,
      responsable_id,
      responsable_nombre,
      turno,
      bodega,
      tipo,
      producto_id: row.producto_id,
      producto_nombre: String(row.producto_nombre || '').trim(),
      unidad_medida: String(row.unidad_medida || '').trim().toUpperCase(),
      cantidad: Number(row.cantidad),
      created_by: s.email,
    }))
    .filter(row => row.producto_id && row.producto_nombre && Number.isFinite(row.cantidad) && row.cantidad >= 0);

  if (!filas.length) {
    return NextResponse.json({ error: 'Agrega al menos un producto con cantidad valida' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from('carnicos_inventarios').upsert(filas, { onConflict: 'fecha,bodega,tipo,producto_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, guardados: filas.length });
}

export async function PATCH(req: NextRequest) {
  // Solo admin: editar conteos de inventario ya guardados (cantidad y/o fecha) queda restringido (bodega solo registra/ve).
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.cantidad !== undefined) {
    const cantidad = Number(body.cantidad);
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      return NextResponse.json({ error: 'La cantidad debe ser un numero valido (0 o mayor)' }, { status: 400 });
    }
    updates.cantidad = cantidad;
  }
  if (body.fecha !== undefined) {
    if (!isIsoDate(body.fecha)) return NextResponse.json({ error: 'Fecha invalida' }, { status: 400 });
    updates.fecha = body.fecha;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from('carnicos_inventarios').update(updates).eq('id', id).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No se pudo actualizar: la fila no existe o falta permiso de UPDATE (revisa la politica RLS de carnicos_inventarios en Supabase).' }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  // Solo admin: eliminar conteos de inventario ya guardados queda restringido (bodega solo registra/ve).
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.from('carnicos_inventarios').delete().eq('id', id).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No se pudo eliminar: la fila no existe o falta permiso de DELETE (revisa la politica RLS de carnicos_inventarios en Supabase).' }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
