import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { BODEGAS_CARNICOS, SUBTIPOS_POR_MOVIMIENTO } from '@/lib/config-carnicos';

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin']); // TODO: agregar 'bodega' cuando se habilite el rol
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha');

  let query = supabase
    .from('carnicos_movimientos')
    .select('id,fecha,responsable_nombre,turno,observacion,bodega,movimiento,subtipo,producto_nombre,unidad_medida,cantidad,origen,created_at')
    .order('created_at', { ascending: false });

  if (fecha) query = query.eq('fecha', fecha);
  else query = query.limit(50);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: `${error.message}. Ejecuta scripts/supabase_control_carnicos.sql en Supabase.` }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin']); // TODO: agregar 'bodega' cuando se habilite el rol
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const fecha = body.fecha;
  const responsable_id = typeof body.responsable_id === 'string' ? body.responsable_id : null;
  const responsable_nombre = String(body.responsable_nombre || '').trim();
  const turno = body.turno === 'AM' || body.turno === 'PM' ? body.turno : null;
  const observacion = typeof body.observacion === 'string' ? body.observacion.trim() : '';
  const bodega = String(body.bodega || '').trim().toUpperCase();
  const movimiento = String(body.movimiento || '').trim().toUpperCase();
  const subtipo = String(body.subtipo || '').trim().toUpperCase();
  const producto_id = typeof body.producto_id === 'string' ? body.producto_id : '';
  const producto_nombre = String(body.producto_nombre || '').trim();
  const unidad_medida = String(body.unidad_medida || '').trim().toUpperCase();
  const cantidad = Number(body.cantidad);

  if (!isIsoDate(fecha) || !responsable_nombre) {
    return NextResponse.json({ error: 'Faltan fecha o responsable' }, { status: 400 });
  }
  if (!BODEGAS_CARNICOS.includes(bodega as never)) {
    return NextResponse.json({ error: 'Bodega invalida' }, { status: 400 });
  }
  if (movimiento !== 'INGRESO' && movimiento !== 'SALIDA') {
    return NextResponse.json({ error: 'Movimiento invalido' }, { status: 400 });
  }
  if (subtipo === 'VENTAS') {
    return NextResponse.json({ error: 'El subtipo Ventas se registra desde la pestaña Ventas, no manualmente' }, { status: 400 });
  }
  const subtiposValidos = SUBTIPOS_POR_MOVIMIENTO[movimiento as 'INGRESO' | 'SALIDA'].map(s2 => s2.value);
  if (!subtiposValidos.includes(subtipo as never)) {
    return NextResponse.json({ error: 'Subtipo no corresponde al movimiento seleccionado' }, { status: 400 });
  }
  if (!producto_id || !producto_nombre) {
    return NextResponse.json({ error: 'Selecciona un producto' }, { status: 400 });
  }
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: 'La cantidad debe ser mayor a 0' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('carnicos_movimientos')
    .insert({
      fecha,
      responsable_id,
      responsable_nombre,
      turno,
      observacion,
      bodega,
      movimiento,
      subtipo,
      producto_id,
      producto_nombre,
      unidad_medida,
      cantidad,
      origen: 'manual',
      created_by: s.email,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  const supabase = await createClient();
  const { data: movimiento, error: fetchError } = await supabase.from('carnicos_movimientos').select('origen').eq('id', id).single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (movimiento?.origen === 'venta_toteat') {
    return NextResponse.json({ error: 'Las salidas por venta se revierten desde la pestaña Ventas, no se borran directamente.' }, { status: 400 });
  }

  const { error } = await supabase.from('carnicos_movimientos').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
