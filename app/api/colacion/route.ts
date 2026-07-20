import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol, getSessionRol } from '@/lib/auth-server';

function toFiniteNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toCLP(value: unknown) {
  return Math.round(toFiniteNumber(value));
}

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
    ? `id,fecha,responsable_nombre,menu,n_inscritos,costo_total,created_at,detalle_colacion(${detalleSelect})`
    : `id,fecha,responsable_nombre,menu,n_inscritos,created_at,detalle_colacion(${detalleSelect})`;

  let query = supabase
    .from('colacion')
    .select(parentSelect)
    .order('created_at', { ascending: false });

  if (fecha) query = query.eq('fecha', fecha);
  else        query = query.limit(20);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'jefatura', 'cocina', 'economo']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const body = await req.json();
  const { fecha, responsable_id, responsable_nombre, menu, n_inscritos, detalle } = body;

  if (!fecha || !responsable_id || !menu?.trim())
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  if (n_inscritos == null || n_inscritos <= 0)
    return NextResponse.json({ error: 'N° inscritos debe ser mayor que 0' }, { status: 400 });
  if (!detalle?.length)
    return NextResponse.json({ error: 'Ingresa al menos un ingrediente' }, { status: 400 });

  const detalleRows = detalle.map((d: Record<string, unknown>) => {
    const cantidad = toFiniteNumber(d.cantidad);
    const costoUnitario = toCLP(d.costo_unitario);
    return {
      ...d,
      cantidad,
      costo_unitario: costoUnitario,
      costo_total: Number.isFinite(Number(d.costo_total)) ? toCLP(d.costo_total) : toCLP(cantidad * costoUnitario),
    };
  });
  const costo_total = detalleRows.reduce((s: number, d: { costo_total?: number }) => s + (d.costo_total ?? 0), 0);

  const { data: col, error: cErr } = await supabase
    .from('colacion')
    .insert({ fecha, responsable_id, responsable_nombre, menu: menu.trim(), n_inscritos, costo_total })
    .select('id').single();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const { error: dErr } = await supabase
    .from('detalle_colacion')
    .insert(detalleRows.map((d: Record<string, unknown>) => ({ ...d, colacion_id: col.id })));
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  return NextResponse.json({ id: col.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { colacion_id, fecha, detalle, n_inscritos, delete_ids } = await req.json();

  const hasDetalle = Array.isArray(detalle) && detalle.length > 0;
  const hasInscritos = n_inscritos !== undefined && n_inscritos !== null;
  const hasDeletes = Array.isArray(delete_ids) && delete_ids.length > 0;
  const hasFecha = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha);

  if (!colacion_id || (!hasDetalle && !hasInscritos && !hasDeletes && !hasFecha))
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  if (hasInscritos && (!Number.isFinite(Number(n_inscritos)) || Number(n_inscritos) <= 0))
    return NextResponse.json({ error: 'Nro. inscritos debe ser mayor que 0' }, { status: 400 });

  if (hasFecha) {
    const { error } = await supabase
      .from('colacion')
      .update({ fecha })
      .eq('id', colacion_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (hasDeletes) {
    const ids = (delete_ids as string[]).filter(Boolean);
    if (ids.length) {
      const { error } = await supabase
        .from('detalle_colacion')
        .delete()
        .eq('colacion_id', colacion_id)
        .in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (hasDetalle) {
    const ids = detalle.filter((d: { id?: string }) => d.id).map((d: { id: string }) => d.id);
    const { data: rows, error: fetchErr } = await supabase
      .from('detalle_colacion')
      .select('id,costo_unitario')
      .in('id', ids)
      .eq('colacion_id', colacion_id);
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const cuMap = new Map(rows?.map(r => [r.id, r.costo_unitario as number]) ?? []);

    for (const d of detalle as Array<{ id?: string; cantidad: number; codigo_producto?: string | null; nombre_producto?: string | null; unidad_medida?: string | null; costo_unitario?: number | null; costo_total?: number | null }>) {
      if (!d.id) continue;
      const cantidad = Number(d.cantidad);
      if (!Number.isFinite(cantidad) || cantidad < 0)
        return NextResponse.json({ error: 'Cantidad invalida' }, { status: 400 });

      const cu = toCLP(cuMap.get(d.id) ?? 0);
      const { error } = await supabase
        .from('detalle_colacion')
        .update({
          cantidad,
          costo_total: Math.round(cantidad * cu),
          updated_at: new Date().toISOString(),
          updated_by: s.email,
          updated_by_rol: s.rol,
        })
        .eq('id', d.id)
        .eq('colacion_id', colacion_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const nuevos = (detalle as Array<{ id?: string; cantidad: number; codigo_producto?: string | null; nombre_producto?: string | null; unidad_medida?: string | null; costo_unitario?: number | null; costo_total?: number | null }>)
    .filter(d => !d.id);
  if (nuevos.length) {
    const rows = nuevos.map(d => {
      const cantidad = Number(d.cantidad);
      if (!Number.isFinite(cantidad) || cantidad < 0) throw new Error('Cantidad invalida');
      const costoUnitario = toCLP(d.costo_unitario);
      return {
        colacion_id,
        codigo_producto: d.codigo_producto ?? null,
        nombre_producto: d.nombre_producto ?? null,
        cantidad,
        unidad_medida: d.unidad_medida ?? null,
        costo_unitario: costoUnitario,
        costo_total: Number.isFinite(Number(d.costo_total)) ? toCLP(d.costo_total) : toCLP(cantidad * costoUnitario),
      };
    });
    try {
      const { error } = await supabase.from('detalle_colacion').insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Error insertando nuevas lineas' }, { status: 500 });
    }
  }

  // Recalculate parent costo_total
  const { data: allDet } = await supabase
    .from('detalle_colacion')
    .select('costo_total')
    .eq('colacion_id', colacion_id);
  const total = (allDet ?? []).reduce((s, r) => s + ((r.costo_total as number) ?? 0), 0);
  const parentUpdate: Record<string, number> = { costo_total: total };
  if (hasInscritos) parentUpdate.n_inscritos = Number(n_inscritos);
  const { error: parentErr } = await supabase.from('colacion').update(parentUpdate).eq('id', colacion_id);
  if (parentErr) return NextResponse.json({ error: parentErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { colacion_id } = await req.json();
  if (!colacion_id) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  const { error } = await supabase.from('colacion').delete().eq('id', colacion_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
