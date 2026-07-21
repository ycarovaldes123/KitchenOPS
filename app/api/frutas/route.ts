import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol, getSessionRol } from '@/lib/auth-server';

type DetalleFrutaPayload = {
  id?: string;
  codigo_producto?: string | null;
  nombre_producto?: string | null;
  cantidad?: number | string | null;
  unidad_medida?: string | null;
  costo_unitario?: number | null;
  costo_total?: number | null;
};

export async function GET(req: NextRequest) {
  const s = await getSessionRol();
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha');

  const verCostos = s.rol !== 'cocina';
  const detalleSelect = verCostos
    ? 'id,nombre_producto,cantidad,unidad_medida,costo_unitario,costo_total'
    : 'id,nombre_producto,cantidad,unidad_medida';
  const parentSelect = verCostos
    ? `id,fecha,responsable_nombre,observacion,costo_total,created_at,detalle_frutas(${detalleSelect})`
    : `id,fecha,responsable_nombre,observacion,created_at,detalle_frutas(${detalleSelect})`;

  let query = supabase
    .from('frutas')
    .select(parentSelect)
    .order('created_at', { ascending: false });

  if (fecha) query = query.eq('fecha', fecha);
  else query = query.limit(20);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: `${error.message}. Ejecuta scripts/supabase_frutas.sql en Supabase.` }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'cocina', 'economo']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const body = await req.json();
  const { fecha, responsable_id, responsable_nombre, observacion, detalle } = body;

  if (!fecha || !responsable_id)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  if (!detalle?.length)
    return NextResponse.json({ error: 'Ingresa al menos una fruta' }, { status: 400 });

  const detalleFinal = (detalle as DetalleFrutaPayload[])
    .map(d => {
      const cantidad = Number(d.cantidad);
      const costoUnitario = Number(d.costo_unitario) || 0;
      return {
        codigo_producto: d.codigo_producto ?? null,
        nombre_producto: d.nombre_producto ?? null,
        cantidad,
        unidad_medida: d.unidad_medida ?? null,
        costo_unitario: costoUnitario,
        costo_total: Number.isFinite(Number(d.costo_total)) ? Number(d.costo_total) : Math.round(cantidad * costoUnitario),
      };
    })
    .filter(d => d.codigo_producto && Number.isFinite(d.cantidad) && d.cantidad > 0);

  if (!detalleFinal.length)
    return NextResponse.json({ error: 'Ingresa al menos una fruta con cantidad valida' }, { status: 400 });

  const costo_total = detalleFinal.reduce((sum, d) => sum + (d.costo_total ?? 0), 0);

  const { data: fruta, error: fErr } = await supabase
    .from('frutas')
    .insert({
      fecha,
      responsable_id,
      responsable_nombre,
      observacion: observacion?.trim() ?? '',
      costo_total,
    })
    .select('id')
    .single();
  if (fErr) return NextResponse.json({ error: `${fErr.message}. Ejecuta scripts/supabase_frutas.sql en Supabase.` }, { status: 500 });

  const { error: dErr } = await supabase
    .from('detalle_frutas')
    .insert(detalleFinal.map(d => ({ ...d, fruta_id: fruta.id })));
  if (dErr) {
    await supabase.from('frutas').delete().eq('id', fruta.id);
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: fruta.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { fruta_id, fecha, detalle, delete_ids } = await req.json();

  const hasDetalle = Array.isArray(detalle) && detalle.length > 0;
  const hasDeletes = Array.isArray(delete_ids) && delete_ids.length > 0;
  const hasFecha = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha);

  if (!fruta_id || (!hasDetalle && !hasDeletes && !hasFecha))
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  if (hasFecha) {
    const { error } = await supabase
      .from('frutas')
      .update({ fecha })
      .eq('id', fruta_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (hasDeletes) {
    const ids = (delete_ids as string[]).filter(Boolean);
    if (ids.length) {
      const { error } = await supabase
        .from('detalle_frutas')
        .delete()
        .eq('fruta_id', fruta_id)
        .in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (hasDetalle) {
    const rows = detalle as DetalleFrutaPayload[];
    const ids = rows.filter(d => d.id).map(d => d.id as string);
    const { data: actuales, error: fetchErr } = ids.length
      ? await supabase
          .from('detalle_frutas')
          .select('id,costo_unitario')
          .in('id', ids)
          .eq('fruta_id', fruta_id)
      : { data: [], error: null };
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const cuMap = new Map((actuales ?? []).map(r => [r.id as string, Number(r.costo_unitario) || 0]));

    for (const d of rows) {
      if (!d.id) continue;
      const cantidad = Number(d.cantidad);
      if (!Number.isFinite(cantidad) || cantidad < 0)
        return NextResponse.json({ error: 'Cantidad invalida' }, { status: 400 });

      const cu = cuMap.get(d.id) ?? 0;
      const { error } = await supabase
        .from('detalle_frutas')
        .update({
          cantidad,
          costo_total: Math.round(cantidad * cu),
          updated_at: new Date().toISOString(),
          updated_by: s.email,
          updated_by_rol: s.rol,
        })
        .eq('id', d.id)
        .eq('fruta_id', fruta_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const nuevos = rows.filter(d => !d.id);
    if (nuevos.length) {
      const insertRows = nuevos.map(d => {
        const cantidad = Number(d.cantidad);
        if (!Number.isFinite(cantidad) || cantidad < 0) throw new Error('Cantidad invalida');
        const costoUnitario = Number(d.costo_unitario) || 0;
        return {
          fruta_id,
          codigo_producto: d.codigo_producto ?? null,
          nombre_producto: d.nombre_producto ?? null,
          cantidad,
          unidad_medida: d.unidad_medida ?? null,
          costo_unitario: costoUnitario,
          costo_total: Number.isFinite(Number(d.costo_total)) ? Number(d.costo_total) : Math.round(cantidad * costoUnitario),
        };
      });
      try {
        const { error } = await supabase.from('detalle_frutas').insert(insertRows);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Error insertando nuevas lineas' }, { status: 500 });
      }
    }
  }

  const { data: allDet, error: allErr } = await supabase
    .from('detalle_frutas')
    .select('costo_total')
    .eq('fruta_id', fruta_id);
  if (allErr) return NextResponse.json({ error: allErr.message }, { status: 500 });
  const total = (allDet ?? []).reduce((sum, row) => sum + (Number(row.costo_total) || 0), 0);
  const { error: parentErr } = await supabase
    .from('frutas')
    .update({ costo_total: total })
    .eq('id', fruta_id);
  if (parentErr) return NextResponse.json({ error: parentErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { fruta_id } = await req.json();
  if (!fruta_id) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  const { error } = await supabase.from('frutas').delete().eq('id', fruta_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
