import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';
import { fetchAllRows } from '@/lib/supabase-paginate';
import { BODEGAS_CARNICOS } from '@/lib/config-carnicos';

interface InventarioRow {
  id: string;
  fecha: string;
  [key: string]: unknown;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type DetalleInventarioPayload = {
  producto_id?: string;
  producto_nombre?: string;
  unidad_medida?: string;
  cantidad?: number | string;
};

type LoteInventarioPayload = {
  bodega?: string;
  detalle?: DetalleInventarioPayload[];
};

type FilaInventarioUpsert = {
  fecha: string;
  responsable_id: string | null;
  responsable_nombre: string;
  turno: 'AM' | 'PM' | null;
  bodega: string;
  tipo: string;
  producto_id: string;
  producto_nombre: string;
  unidad_medida: string;
  cantidad: number;
  created_by: string | null;
};

function cantidadFromPayload(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const cantidad = Number(value);
  return Number.isFinite(cantidad) ? cantidad : null;
}

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'bodega']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const fechaUnica = searchParams.get('fecha');
  const desde = searchParams.get('desde') ?? fechaUnica;
  const hasta = searchParams.get('hasta') ?? fechaUnica;
  if (!isIsoDate(desde) || !isIsoDate(hasta)) return NextResponse.json({ error: 'Debes enviar fecha (o desde/hasta) en formato YYYY-MM-DD' }, { status: 400 });

  // Un rango de fechas puede superar el limite por defecto de filas de Supabase/PostgREST
  // (tipicamente 1000), asi que se pagina con .range() para traer el total sin cortar conteos.
  const { data, error } = await fetchAllRows<InventarioRow>((from, to) =>
    supabase
      .from('carnicos_inventarios')
      .select('id,fecha,responsable_id,responsable_nombre,turno,bodega,tipo,producto_id,producto_nombre,unidad_medida,cantidad', { count: 'exact' })
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('bodega')
      .order('id')
      .range(from, to)
  );

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
  const tipo = String(body.tipo || '').trim().toUpperCase();
  const lotesBody = Array.isArray(body.lotes) ? (body.lotes as LoteInventarioPayload[]) : null;
  const bodega = String(body.bodega || '').trim().toUpperCase();
  const detalle = Array.isArray(body.detalle) ? (body.detalle as DetalleInventarioPayload[]) : [];

  if (!isIsoDate(fecha) || !responsable_nombre) {
    return NextResponse.json({ error: 'Faltan fecha o responsable' }, { status: 400 });
  }
  if (tipo !== 'INICIAL' && tipo !== 'FINAL') {
    return NextResponse.json({ error: 'Tipo invalido (INICIAL o FINAL)' }, { status: 400 });
  }

  const lotes = lotesBody?.length
    ? lotesBody.map(lote => ({ bodega: String(lote.bodega || '').trim().toUpperCase(), detalle: Array.isArray(lote.detalle) ? lote.detalle : [] }))
    : [{ bodega, detalle }];

  for (const lote of lotes) {
    if (!BODEGAS_CARNICOS.includes(lote.bodega as never)) {
      return NextResponse.json({ error: 'Bodega invalida' }, { status: 400 });
    }
    if (lote.bodega === 'BODEGAS CONSOLIDADAS') {
      return NextResponse.json({ error: 'Bodegas consolidadas es solo un modo de importacion. Guarda los conteos en Camara Congelados, Camara Mantencion o Cocina.' }, { status: 400 });
    }
  }

  const filas: FilaInventarioUpsert[] = [];
  const erroresPayload: string[] = [];
  for (const lote of lotes) {
    for (const row of lote.detalle) {
      const cantidad = cantidadFromPayload(row.cantidad);
      const producto_id = typeof row.producto_id === 'string' ? row.producto_id.trim() : '';
      const producto_nombre = String(row.producto_nombre || '').trim();
      const unidad_medida = String(row.unidad_medida || '').trim().toUpperCase();
      if (cantidad == null && !producto_id && !producto_nombre) continue;
      if (!producto_id || !producto_nombre) {
        erroresPayload.push(`${lote.bodega}: producto invalido o no encontrado (${producto_nombre || producto_id || 'sin nombre'}).`);
        continue;
      }
      if (cantidad == null || cantidad < 0) {
        erroresPayload.push(`${lote.bodega}: cantidad invalida para ${producto_nombre}.`);
        continue;
      }
      filas.push({
        fecha,
        responsable_id,
        responsable_nombre,
        turno,
        bodega: lote.bodega,
        tipo,
        producto_id,
        producto_nombre,
        unidad_medida,
        cantidad,
        created_by: s.email,
      });
    }
  }

  if (erroresPayload.length > 0) {
    return NextResponse.json({
      error: `Hay ${erroresPayload.length} registro(s) invalido(s) antes de guardar: ${erroresPayload.slice(0, 8).join('; ')}${erroresPayload.length > 8 ? '...' : ''}`,
      errores: erroresPayload,
    }, { status: 400 });
  }

  if (!filas.length) {
    return NextResponse.json({ error: 'Agrega al menos un producto con cantidad valida' }, { status: 400 });
  }

  const clavesVistas = new Set<string>();
  const duplicados = new Set<string>();
  for (const fila of filas) {
    const key = `${fila.fecha}||${fila.bodega}||${fila.tipo}||${fila.producto_id}`;
    if (clavesVistas.has(key)) {
      duplicados.add(`${fila.bodega}: ${fila.producto_nombre}`);
    } else {
      clavesVistas.add(key);
    }
  }
  if (duplicados.size > 0) {
    return NextResponse.json({
      error: `Hay productos duplicados para la misma fecha, bodega y tipo de inventario. Corrige el archivo o elimina duplicados: ${Array.from(duplicados).slice(0, 8).join('; ')}${duplicados.size > 8 ? '...' : ''}`,
    }, { status: 400 });
  }

  const supabase = await createClient();
  console.info('[control-carnicos/inventarios] upsert', filas.slice(0, 50).map(row => ({
    producto_id: row.producto_id,
    nombre_producto: row.producto_nombre,
    bodega: row.bodega,
    fecha: row.fecha,
    tipo: row.tipo,
    conteo: row.cantidad,
  })), filas.length > 50 ? { restantes: filas.length - 50 } : undefined);
  const { error } = await supabase.from('carnicos_inventarios').upsert(filas, { onConflict: 'fecha,bodega,tipo,producto_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const porBodega = filas.reduce<Record<string, number>>((acc, row) => {
    acc[row.bodega] = (acc[row.bodega] ?? 0) + 1;
    return acc;
  }, {});

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario: s.rol,
    accion: 'guardar_inventario_carnico',
    tabla: 'carnicos_inventarios',
    datos_nuevos: { fecha, tipo, filas: filas.length, porBodega, productos: filas.map(f => ({ producto_id: f.producto_id, producto_nombre: f.producto_nombre, bodega: f.bodega, cantidad: f.cantidad })) },
  });

  return NextResponse.json({ ok: true, guardados: filas.length, porBodega });
}

export async function PATCH(req: NextRequest) {
  // Solo admin: editar conteos de inventario ya guardados (cantidad y/o fecha) queda restringido (bodega solo registra/ve).
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  const supabase = await createClient();
  const { data: existente, error: fetchError } = await supabase.from('carnicos_inventarios').select('*').eq('id', id).single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

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
  if (body.responsable_id !== undefined) {
    const responsable_id = typeof body.responsable_id === 'string' ? body.responsable_id : null;
    if (!responsable_id) return NextResponse.json({ error: 'Responsable invalido' }, { status: 400 });
    const { data: resp, error: respError } = await supabase.from('responsables').select('id,nombre').eq('id', responsable_id).single();
    if (respError || !resp) return NextResponse.json({ error: 'Responsable no encontrado en el maestro' }, { status: 400 });
    updates.responsable_id = resp.id;
    updates.responsable_nombre = resp.nombre;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
  }

  const { data, error } = await supabase.from('carnicos_inventarios').update(updates).eq('id', id).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No se pudo actualizar: la fila no existe o falta permiso de UPDATE (revisa la politica RLS de carnicos_inventarios en Supabase).' }, { status: 403 });
  }

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario: s.rol,
    accion: 'editar_inventario_carnico',
    tabla: 'carnicos_inventarios',
    registro_id: id,
    datos_anteriores: existente,
    datos_nuevos: updates,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  // Solo admin: eliminar conteos de inventario ya guardados queda restringido (bodega solo registra/ve).
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  // Acepta { id } o { ids: [...] }: un conteo/movimiento completo se borra en una sola llamada.
  const ids: string[] = Array.isArray(body.ids)
    ? [...new Set((body.ids as unknown[]).filter((v): v is string => typeof v === 'string' && v !== ''))]
    : typeof body.id === 'string' && body.id ? [body.id] : [];
  if (!ids.length) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  const supabase = await createClient();
  const { data: existentes, error: fetchError } = await supabase.from('carnicos_inventarios').select('*').in('id', ids);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const { data, error } = await supabase.from('carnicos_inventarios').delete().in('id', ids).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No se pudo eliminar: la fila no existe o falta permiso de DELETE (revisa la politica RLS de carnicos_inventarios en Supabase).' }, { status: 403 });
  }

  // Una fila de auditoria por producto, en un solo insert
  const borrados = new Set(data.map(r => r.id as string));
  const { error: auditError } = await supabase.from('audit_log').insert((existentes ?? []).filter(r => borrados.has(r.id)).map(r => ({
    usuario_email: s.email,
    rol_usuario: s.rol,
    accion: 'eliminar_inventario_carnico',
    tabla: 'carnicos_inventarios',
    registro_id: r.id,
    datos_anteriores: r,
  })));
  if (auditError) console.error('[audit] error registrando:', auditError.message);
  return NextResponse.json({ ok: true, eliminados: data.length });
}
