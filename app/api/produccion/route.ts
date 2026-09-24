import { NextRequest, NextResponse, after } from 'next/server';
import { notificarAlertasDeRegistro } from '@/lib/alertas/notificar';
import { createClient } from '@/utils/supabase/server';
import { requireRol, getSessionRol } from '@/lib/auth-server';
import { calcTotalPP, calcCostoProduccionPP } from '@/lib/calculos';
import { puedeHacer } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const s = await getSessionRol();
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha');

  const verCostos = puedeHacer(s.rol, 'produccion', 'verCostos');
  const detalleSelect = verCostos
    ? 'id,nombre_pp,tipo_pp,cantidad,gramos_por_pp,total_producido,codigo_producto,costo_unitario,costo_total'
    : 'id,nombre_pp,tipo_pp,cantidad,gramos_por_pp,total_producido,codigo_producto';

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
  const s = await requireRol(['admin', 'cocina']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const body = await req.json();
  const { fecha, responsable_id, responsable_nombre, turno, observacion, detalle, rendimiento } = body;
  const detalleInput = Array.isArray(detalle) ? detalle as Array<Record<string, unknown>> : [];
  const rendimientoInput = Array.isArray(rendimiento) ? rendimiento as Array<Record<string, unknown>> : [];
  const detalleValido = detalleInput.filter(d => {
    const cantidad = Number(d.cantidad);
    return typeof d.pp_id === 'string' && d.pp_id.trim() !== '' && Number.isFinite(cantidad) && cantidad > 0;
  });
  const rendimientoValido = rendimientoInput
    .map(r => {
      const kgUtilizados = Number(r.kg_utilizados);
      const rendimientoKg = Number(r.rendimiento_kg);
      return {
        fecha: r.fecha,
        verdura: typeof r.verdura === 'string' ? r.verdura.trim() : '',
        kg_utilizados: kgUtilizados,
        rendimiento_kg: rendimientoKg,
        responsable_nombre: typeof r.responsable_nombre === 'string' ? r.responsable_nombre : '',
      };
    })
    .filter(r =>
      typeof r.fecha === 'string' &&
      r.verdura !== '' &&
      Number.isFinite(r.kg_utilizados) &&
      r.kg_utilizados > 0 &&
      Number.isFinite(r.rendimiento_kg) &&
      r.rendimiento_kg > 0
    );

  if (!fecha || !responsable_id || !turno || !observacion?.trim())
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  if (!detalleValido.length && !rendimientoValido.length)
    return NextResponse.json({ error: 'Ingresa al menos un PP o un rendimiento valido' }, { status: 400 });

  const { data: prod, error: pErr } = await supabase
    .from('produccion')
    .insert({ fecha, responsable_id, responsable_nombre, turno, observacion: observacion.trim(), estado: 'REGISTRADO' })
    .select('id').single();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const codigos = [...new Set(detalleValido.map(d => d.codigo_producto).filter(Boolean))] as string[];
  const { data: productos, error: prodErr } = codigos.length
    ? await supabase
        .from('productos')
        .select('codigo,unidad_medida,costo_promedio')
        .in('codigo', codigos)
    : { data: [], error: null };
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

  const unidadPorCodigo = new Map((productos ?? []).map(p => [p.codigo as string, p.unidad_medida as string | null]));
  const costoPorCodigo = new Map((productos ?? []).map(p => [p.codigo as string, Number(p.costo_promedio) || 0]));
  const detalleRows = detalleValido.map(d => {
    const cantidad = Number(d.cantidad) || 0;
    const tipoPP = d.tipo_pp as string | null | undefined;
    const gramosPorPP = d.gramos_por_pp as number | null | undefined;
    const codigoProducto = d.codigo_producto as string | null | undefined;
    const costoUnitario = codigoProducto ? (costoPorCodigo.get(codigoProducto) ?? 0) : 0;
    const unidadProducto = codigoProducto ? unidadPorCodigo.get(codigoProducto) : null;
    const costoCalculado = calcCostoProduccionPP(
      cantidad,
      { tipo_pp: tipoPP, gramos_por_pp: gramosPorPP },
      unidadProducto,
      costoUnitario
    );
    return {
      ...d,
      produccion_id: prod.id,
      cantidad,
      total_producido: calcTotalPP(
        cantidad,
        { tipo_pp: tipoPP, gramos_por_pp: gramosPorPP },
        unidadProducto
      ),
      costo_unitario: costoUnitario,
      costo_total: costoCalculado,
    };
  });

  if (detalleRows.length) {
    const { error: dErr } = await supabase
      .from('detalle_produccion')
      .insert(detalleRows);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  if (rendimientoValido.length) {
    const { error: rErr } = await supabase
      .from('rendimiento')
      .insert(rendimientoValido.map(r => ({ ...r, produccion_id: prod.id })));
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  // Piloto Alertas: analiza el registro recién creado y avisa por correo si tiene alertas.
  // Corre después de responder; no afecta el guardado (ver lib/alertas/notificar.ts).
  after(() => notificarAlertasDeRegistro(supabase, 'Producción', prod.id));

  return NextResponse.json({ id: prod.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { produccion_id, fecha, detalle, rendimiento, delete_ids } = await req.json();

  const hasDetalle = Array.isArray(detalle) && detalle.length > 0;
  const hasRendimiento = Array.isArray(rendimiento) && rendimiento.length > 0;
  const hasDeletes = Array.isArray(delete_ids) && delete_ids.length > 0;
  const hasFecha = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha);

  if (!produccion_id || (!hasDetalle && !hasRendimiento && !hasDeletes && !hasFecha))
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  if (hasFecha) {
    const { error } = await supabase
      .from('produccion')
      .update({ fecha })
      .eq('id', produccion_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (hasDeletes) {
    const ids = (delete_ids as string[]).filter(Boolean);
    if (ids.length) {
      const { error } = await supabase
        .from('detalle_produccion')
        .delete()
        .eq('produccion_id', produccion_id)
        .in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (hasDetalle) {
    const ids = detalle.filter((d: { id?: string }) => d.id).map((d: { id: string }) => d.id);
    const { data: rows, error: fetchErr } = await supabase
      .from('detalle_produccion')
      .select('id,cantidad,tipo_pp,gramos_por_pp,codigo_producto,costo_unitario,costo_total')
      .in('id', ids)
      .eq('produccion_id', produccion_id);
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const rowMap = new Map(rows?.map(r => [r.id, r]) ?? []);
    const codigos = [...new Set((rows ?? []).map(r => r.codigo_producto).filter(Boolean))] as string[];
    const { data: productos, error: prodErr } = codigos.length
      ? await supabase
          .from('productos')
          .select('codigo,unidad_medida')
          .in('codigo', codigos)
      : { data: [], error: null };
    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

    const unidadPorCodigo = new Map((productos ?? []).map(p => [p.codigo as string, p.unidad_medida as string | null]));

    for (const d of detalle as Array<{ id?: string; cantidad: number; pp_id?: string | null; nombre_pp?: string | null; tipo_pp?: string | null; gramos_por_pp?: number | null; codigo_producto?: string | null; costo_unitario?: number | null }>) {
      if (!d.id) continue;
      const row = rowMap.get(d.id);
      if (!row) return NextResponse.json({ error: 'Linea de produccion no encontrada' }, { status: 404 });

      const cantidad = Number(d.cantidad);
      if (!Number.isFinite(cantidad) || cantidad < 0)
        return NextResponse.json({ error: 'Cantidad invalida' }, { status: 400 });

      const total_producido = calcTotalPP(
        cantidad,
        { tipo_pp: row.tipo_pp as string | null, gramos_por_pp: row.gramos_por_pp as number | null },
        row.codigo_producto ? unidadPorCodigo.get(row.codigo_producto as string) : null
      );
      const cantidadAnterior = Number(row.cantidad) || 0;
      const costoAnterior = Number(row.costo_total) || 0;
      const costoPorCantidad = cantidadAnterior > 0 && costoAnterior > 0
        ? costoAnterior / cantidadAnterior
        : Number(row.costo_unitario) || 0;
      const unidadProducto = row.codigo_producto ? unidadPorCodigo.get(row.codigo_producto as string) : null;
      const costoTotal = row.codigo_producto
        ? calcCostoProduccionPP(
            cantidad,
            { tipo_pp: row.tipo_pp as string | null, gramos_por_pp: row.gramos_por_pp as number | null },
            unidadProducto,
            Number(row.costo_unitario) || 0
          )
        : Math.round(cantidad * costoPorCantidad);

      const { error } = await supabase
        .from('detalle_produccion')
        .update({
          cantidad,
          total_producido,
          costo_total: costoTotal,
        })
        .eq('id', d.id)
        .eq('produccion_id', produccion_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const nuevos = (detalle as Array<{ id?: string; cantidad: number; pp_id?: string | null; nombre_pp?: string | null; tipo_pp?: string | null; gramos_por_pp?: number | null; codigo_producto?: string | null; costo_unitario?: number | null; costo_total?: number | null; total_producido?: number | null }>)
    .filter(d => !d.id);
  if (nuevos.length) {
    const codigos = [...new Set(nuevos.map(d => d.codigo_producto).filter(Boolean))] as string[];
    const { data: productos, error: prodErr } = codigos.length
      ? await supabase
          .from('productos')
          .select('codigo,unidad_medida,costo_promedio')
          .in('codigo', codigos)
      : { data: [], error: null };
    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

    const unidadPorCodigo = new Map((productos ?? []).map(p => [p.codigo as string, p.unidad_medida as string | null]));
    const costoPorCodigo = new Map((productos ?? []).map(p => [p.codigo as string, Number(p.costo_promedio) || 0]));

    const rows = nuevos.map(d => {
      const cantidad = Number(d.cantidad);
      if (!Number.isFinite(cantidad) || cantidad < 0) throw new Error('Cantidad invalida');
      const costoUnitario = d.codigo_producto ? (costoPorCodigo.get(d.codigo_producto) ?? 0) : 0;
      const unidadProducto = d.codigo_producto ? unidadPorCodigo.get(d.codigo_producto) : null;
      const totalProducido = calcTotalPP(
        cantidad,
        { tipo_pp: d.tipo_pp ?? null, gramos_por_pp: d.gramos_por_pp ?? null },
        unidadProducto
      );
      return {
        produccion_id,
        pp_id: d.pp_id ?? null,
        nombre_pp: d.nombre_pp ?? '',
        tipo_pp: d.tipo_pp ?? null,
        cantidad,
        gramos_por_pp: d.gramos_por_pp ?? null,
        total_producido: totalProducido,
        codigo_producto: d.codigo_producto ?? null,
        costo_unitario: costoUnitario,
        costo_total: calcCostoProduccionPP(
          cantidad,
          { tipo_pp: d.tipo_pp ?? null, gramos_por_pp: d.gramos_por_pp ?? null },
          unidadProducto,
          costoUnitario
        ),
      };
    });
    try {
      const { error } = await supabase.from('detalle_produccion').insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Error insertando lineas nuevas' }, { status: 500 });
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

export async function DELETE(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { produccion_id } = await req.json();
  if (!produccion_id) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  const { error } = await supabase.from('produccion').delete().eq('id', produccion_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
