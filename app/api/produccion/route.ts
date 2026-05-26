import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol, getSessionRol } from '@/lib/auth-server';

function calcTotalPP(cantidad: number, tipoPP: string | null, gramosPorPP: number | null): number {
  if (tipoPP === 'CC' || tipoPP === 'DIRECTO') return cantidad;
  return cantidad * (gramosPorPP ?? 1);
}

export async function GET(req: NextRequest) {
  const s = await getSessionRol();
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha');

  const verCostos = s.rol !== 'cocina';
  const detalleSelect = verCostos
    ? 'id,nombre_pp,tipo_pp,cantidad,gramos_por_pp,total_producido,costo_unitario,costo_total'
    : 'id,nombre_pp,tipo_pp,cantidad,gramos_por_pp,total_producido';

  let query = supabase
    .from('produccion')
    .select(`id,fecha,responsable_nombre,turno,observacion,estado,created_at,detalle_produccion(${detalleSelect}),rendimiento(id,verdura,kg_utilizados,rendimiento_kg)`)
    .order('created_at', { ascending: false });

  if (fecha) query = query.eq('fecha', fecha);
  else        query = query.limit(20);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'jefatura', 'cocina']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const body = await req.json();
  const { fecha, responsable_id, responsable_nombre, turno, observacion, detalle, rendimiento } = body;

  if (!fecha || !responsable_id || !turno || !observacion?.trim())
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  if (!detalle?.length)
    return NextResponse.json({ error: 'Ingresa al menos un PP' }, { status: 400 });

  const { data: prod, error: pErr } = await supabase
    .from('produccion')
    .insert({ fecha, responsable_id, responsable_nombre, turno, observacion: observacion.trim(), estado: 'REGISTRADO' })
    .select('id').single();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { error: dErr } = await supabase
    .from('detalle_produccion')
    .insert(detalle.map((d: Record<string, unknown>) => ({ ...d, produccion_id: prod.id })));
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  if (rendimiento?.length) {
    const { error: rErr } = await supabase
      .from('rendimiento')
      .insert(rendimiento.map((r: Record<string, unknown>) => ({ ...r, produccion_id: prod.id })));
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: prod.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { produccion_id, detalle, rendimiento } = await req.json();

  const hasDetalle = Array.isArray(detalle) && detalle.length > 0;
  const hasRendimiento = Array.isArray(rendimiento) && rendimiento.length > 0;

  if (!produccion_id || (!hasDetalle && !hasRendimiento))
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  if (hasDetalle) {
    const ids = detalle.map((d: { id: string }) => d.id);
    const { data: rows, error: fetchErr } = await supabase
      .from('detalle_produccion')
      .select('id,cantidad,tipo_pp,gramos_por_pp,costo_unitario,costo_total')
      .in('id', ids)
      .eq('produccion_id', produccion_id);
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const rowMap = new Map(rows?.map(r => [r.id, r]) ?? []);

    for (const d of detalle as { id: string; cantidad: number }[]) {
      const row = rowMap.get(d.id);
      if (!row) return NextResponse.json({ error: 'Linea de produccion no encontrada' }, { status: 404 });

      const cantidad = Number(d.cantidad);
      if (!Number.isFinite(cantidad) || cantidad < 0)
        return NextResponse.json({ error: 'Cantidad invalida' }, { status: 400 });

      const total_producido = calcTotalPP(
        cantidad,
        row.tipo_pp as string | null,
        row.gramos_por_pp as number | null
      );
      const cantidadAnterior = Number(row.cantidad) || 0;
      const costoAnterior = Number(row.costo_total) || 0;
      const costoPorCantidad = cantidadAnterior > 0 && costoAnterior > 0
        ? costoAnterior / cantidadAnterior
        : Number(row.costo_unitario) || 0;

      const { error } = await supabase
        .from('detalle_produccion')
        .update({
          cantidad,
          total_producido,
          costo_total: Math.round(cantidad * costoPorCantidad),
        })
        .eq('id', d.id)
        .eq('produccion_id', produccion_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (hasRendimiento) {
    const ids = rendimiento.map((r: { id: string }) => r.id);
    const { data: rows, error: fetchErr } = await supabase
      .from('rendimiento')
      .select('id,kg_utilizados,rendimiento_kg')
      .in('id', ids)
      .eq('produccion_id', produccion_id);
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const rowMap = new Map(rows?.map(r => [r.id, r]) ?? []);

    for (const r of rendimiento as { id: string; kg_utilizados?: number; rendimiento_kg?: number }[]) {
      const row = rowMap.get(r.id);
      if (!row) return NextResponse.json({ error: 'Linea de rendimiento no encontrada' }, { status: 404 });

      const kgUtilizados = Number(r.kg_utilizados);
      const rendimientoKg = Number(r.rendimiento_kg);
      if (!Number.isFinite(kgUtilizados) || kgUtilizados < 0 || !Number.isFinite(rendimientoKg) || rendimientoKg < 0)
        return NextResponse.json({ error: 'Valores de rendimiento invalidos' }, { status: 400 });
      if (rendimientoKg > kgUtilizados)
        return NextResponse.json({ error: 'El rendimiento no puede ser mayor que los kilos utilizados' }, { status: 400 });

      const { error } = await supabase
        .from('rendimiento')
        .update({
          kg_utilizados: kgUtilizados,
          rendimiento_kg: rendimientoKg,
        })
        .eq('id', r.id)
        .eq('produccion_id', produccion_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
