import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';
import { fetchAllRows } from '@/lib/supabase-paginate';
import { BODEGAS_CARNICOS, SUBTIPOS_POR_MOVIMIENTO } from '@/lib/config-carnicos';

const SELECT_MOVIMIENTO = 'id,fecha,responsable_id,responsable_nombre,turno,observacion,bodega,movimiento,subtipo,producto_id,producto_nombre,unidad_medida,cantidad,origen,created_at';

interface MovimientoRow {
  id: string;
  fecha: string;
  created_at: string;
  [key: string]: unknown;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'bodega']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const fechaUnica = searchParams.get('fecha');
  const desde = searchParams.get('desde') ?? fechaUnica;
  const hasta = searchParams.get('hasta') ?? fechaUnica;

  if (desde && hasta) {
    if (!isIsoDate(desde) || !isIsoDate(hasta)) return NextResponse.json({ error: 'Fechas invalidas' }, { status: 400 });
    // Un rango de fechas puede superar el limite por defecto de filas de Supabase/PostgREST
    // (tipicamente 1000, ej. un mes con ventas Toteat), asi que se pagina con .range() para
    // traer el total sin cortar movimientos silenciosamente.
    const { data, error } = await fetchAllRows<MovimientoRow>((from, to) =>
      supabase
        .from('carnicos_movimientos')
        .select(SELECT_MOVIMIENTO, { count: 'exact' })
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    );
    if (error) return NextResponse.json({ error: `${error.message}. Ejecuta scripts/supabase_control_carnicos.sql en Supabase.` }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  const { data, error } = await supabase
    .from('carnicos_movimientos')
    .select(SELECT_MOVIMIENTO)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);
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
  const nuevaFila = {
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
    origen: 'manual' as const,
    created_by: s.email,
  };
  const { data, error } = await supabase
    .from('carnicos_movimientos')
    .insert(nuevaFila)
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario: s.rol,
    accion: 'crear_movimiento_carnico',
    tabla: 'carnicos_movimientos',
    registro_id: data.id,
    datos_nuevos: nuevaFila,
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  // Solo admin: editar movimientos ya guardados queda restringido (bodega solo registra/ve).
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  const supabase = await createClient();
  const { data: existente, error: fetchError } = await supabase.from('carnicos_movimientos').select('*').eq('id', id).single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (existente?.origen === 'venta_toteat') {
    return NextResponse.json({ error: 'Las salidas por venta se revierten desde la pestaña Ventas, no se editan directamente.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.cantidad !== undefined) {
    const cantidad = Number(body.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return NextResponse.json({ error: 'La cantidad debe ser mayor a 0' }, { status: 400 });
    }
    updates.cantidad = cantidad;
  }

  if (body.fecha !== undefined) {
    if (!isIsoDate(body.fecha)) return NextResponse.json({ error: 'Fecha invalida' }, { status: 400 });
    updates.fecha = body.fecha;
  }

  if (body.subtipo !== undefined) {
    const subtipo = String(body.subtipo || '').trim().toUpperCase();
    const movimientoActual = existente.movimiento as 'INGRESO' | 'SALIDA';
    const subtiposValidos = SUBTIPOS_POR_MOVIMIENTO[movimientoActual].map(s2 => s2.value);
    if (!subtiposValidos.includes(subtipo as never)) {
      return NextResponse.json({ error: 'Subtipo no corresponde al movimiento del registro' }, { status: 400 });
    }
    updates.subtipo = subtipo;
  }

  if (body.observacion !== undefined) {
    updates.observacion = String(body.observacion ?? '').trim();
  }

  if (body.responsable_id !== undefined) {
    const responsable_id = typeof body.responsable_id === 'string' ? body.responsable_id : null;
    if (!responsable_id) return NextResponse.json({ error: 'Responsable invalido' }, { status: 400 });
    // Se resuelve el nombre canonico desde el maestro de responsables (evita duplicados por texto libre).
    const { data: resp, error: respError } = await supabase.from('responsables').select('id,nombre').eq('id', responsable_id).single();
    if (respError || !resp) return NextResponse.json({ error: 'Responsable no encontrado en el maestro' }, { status: 400 });
    updates.responsable_id = resp.id;
    updates.responsable_nombre = resp.nombre;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
  }

  const { data: actualizado, error } = await supabase.from('carnicos_movimientos').update(updates).eq('id', id).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!actualizado || actualizado.length === 0) {
    return NextResponse.json({ error: 'No se pudo actualizar: la fila no existe o falta permiso de UPDATE (revisa la politica RLS de carnicos_movimientos en Supabase).' }, { status: 403 });
  }

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario: s.rol,
    accion: 'editar_movimiento_carnico',
    tabla: 'carnicos_movimientos',
    registro_id: id,
    datos_anteriores: existente,
    datos_nuevos: updates,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  // Solo admin: eliminar movimientos ya guardados queda restringido (bodega solo registra/ve).
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  // Acepta { id } o { ids: [...] }: un conteo/movimiento completo se borra en una sola llamada.
  const ids: string[] = Array.isArray(body.ids)
    ? [...new Set((body.ids as unknown[]).filter((v): v is string => typeof v === 'string' && v !== ''))]
    : typeof body.id === 'string' && body.id ? [body.id] : [];
  if (!ids.length) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  const supabase = await createClient();
  const { data: movimientos, error: fetchError } = await supabase.from('carnicos_movimientos').select('*').in('id', ids);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if ((movimientos ?? []).some(m => m.origen === 'venta_toteat')) {
    return NextResponse.json({ error: 'Las salidas por venta se revierten desde la pestaña Ventas, no se borran directamente.' }, { status: 400 });
  }

  const { data: borrado, error } = await supabase.from('carnicos_movimientos').delete().in('id', ids).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!borrado || borrado.length === 0) {
    return NextResponse.json({ error: 'No se pudo eliminar: la fila no existe o falta permiso de DELETE (revisa la politica RLS de carnicos_movimientos en Supabase).' }, { status: 403 });
  }

  // Una fila de auditoria por producto, en un solo insert
  const borrados = new Set(borrado.map(r => r.id as string));
  const { error: auditError } = await supabase.from('audit_log').insert((movimientos ?? []).filter(m => borrados.has(m.id)).map(m => ({
    usuario_email: s.email,
    rol_usuario: s.rol,
    accion: 'eliminar_movimiento_carnico',
    tabla: 'carnicos_movimientos',
    registro_id: m.id,
    datos_anteriores: m,
  })));
  if (auditError) console.error('[audit] error registrando:', auditError.message);

  return NextResponse.json({ ok: true, eliminados: borrado.length });
}
