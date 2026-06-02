import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol, getSessionRol } from '@/lib/auth-server';

type PlatoMermaPayload = {
  carta_id?: string | null;
  nombre_plato?: string | null;
  cantidad?: number | string | null;
  motivo?: string | null;
  observacion?: string | null;
};

type PlatoPreparado = {
  carta_id: string;
  nombre_plato: string;
  cantidad: number;
  motivo: string | null;
  observacion: string | null;
  costo_unitario: number;
  costo_total: number;
  insumos: {
    carta_ingrediente_id: string | null;
    codigo_producto: string | null;
    pp_id: string | null;
    nombre: string;
    cantidad_unitaria: number;
    cantidad_total: number;
    unidad_medida: string | null;
    precio_unitario: number;
    costo_total: number;
  }[];
};

async function prepararPlatos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  platos: PlatoMermaPayload[] | undefined,
): Promise<PlatoPreparado[]> {
  const rows = (platos ?? [])
    .map(p => ({
      carta_id: p.carta_id?.trim() || null,
      nombre_plato: p.nombre_plato?.trim() || null,
      cantidad: Number(p.cantidad),
      motivo: p.motivo?.trim() || null,
      observacion: p.observacion?.trim() || null,
    }))
    .filter(p => p.carta_id && Number.isFinite(p.cantidad) && p.cantidad > 0);

  if (!rows.length) return [];

  const ids = [...new Set(rows.map(p => p.carta_id).filter(Boolean))] as string[];
  const { data, error } = await supabase
    .from('carta')
    .select(`
      id,nombre,
      carta_ingredientes(id,codigo_producto,pp_id,nombre,cantidad,unidad_medida,precio_unitario,costo_total)
    `)
    .in('id', ids)
    .eq('activo', true);

  if (error) throw new Error(error.message);

  const cartaMap = new Map((data ?? []).map(plato => [plato.id as string, plato]));

  return rows.map(row => {
    const plato = row.carta_id ? cartaMap.get(row.carta_id) : null;
    if (!plato) throw new Error('Plato no encontrado o inactivo');

    const ingredientes = (plato.carta_ingredientes ?? []) as Array<{
      id: string;
      codigo_producto: string | null;
      pp_id: string | null;
      nombre: string | null;
      cantidad: number | null;
      unidad_medida: string | null;
      precio_unitario: number | null;
      costo_total: number | null;
    }>;
    const costoUnitario = ingredientes.reduce((sum, ing) => sum + (Number(ing.costo_total) || 0), 0);

    return {
      carta_id: plato.id as string,
      nombre_plato: plato.nombre as string,
      cantidad: row.cantidad,
      motivo: row.motivo,
      observacion: row.observacion,
      costo_unitario: Math.round(costoUnitario),
      costo_total: Math.round(costoUnitario * row.cantidad),
      insumos: ingredientes.map(ing => {
        const cantidadUnitaria = Number(ing.cantidad) || 0;
        const precioUnitario = Number(ing.precio_unitario) || 0;
        const costoTotal = (Number(ing.costo_total) || 0) * row.cantidad;
        return {
          carta_ingrediente_id: ing.id ?? null,
          codigo_producto: ing.codigo_producto ?? null,
          pp_id: ing.pp_id ?? null,
          nombre: ing.nombre ?? 'SIN NOMBRE',
          cantidad_unitaria: cantidadUnitaria,
          cantidad_total: cantidadUnitaria * row.cantidad,
          unidad_medida: ing.unidad_medida ?? null,
          precio_unitario: precioUnitario,
          costo_total: Math.round(costoTotal),
        };
      }),
    };
  });
}

export async function GET(req: NextRequest) {
  const s = await getSessionRol();
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha');

  const verCostos = s.rol !== 'cocina';
  const detalleSelect = verCostos
    ? 'id,nombre_producto,cantidad,unidad_medida,motivo,costo_unitario,costo_total'
    : 'id,nombre_producto,cantidad,unidad_medida,motivo';

  let query = supabase
    .from('mermas')
    .select(`id,fecha,responsable_nombre,observacion,estado,created_at,detalle_mermas(${detalleSelect})`)
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
  const { fecha, responsable_id, responsable_nombre, observacion, detalle, platos } = body;

  if (!fecha || !responsable_id || !observacion?.trim())
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  if (!detalle?.length && !platos?.length)
    return NextResponse.json({ error: 'Ingresa al menos un producto o plato preparado' }, { status: 400 });

  let platosPreparados: PlatoPreparado[] = [];
  try {
    platosPreparados = await prepararPlatos(supabase, platos);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error preparando platos' }, { status: 500 });
  }

  const detalleProductos = Array.isArray(detalle) ? detalle : [];
  const detallePlatos = platosPreparados.map(plato => ({
    codigo_producto: null,
    nombre_producto: `PLATO PREPARADO: ${plato.nombre_plato}`,
    cantidad: plato.cantidad,
    unidad_medida: 'UN',
    motivo: plato.motivo,
    costo_unitario: plato.costo_unitario,
    costo_total: plato.costo_total,
  }));
  const detalleFinal = [...detalleProductos, ...detallePlatos];

  if (!detalleFinal.length)
    return NextResponse.json({ error: 'Ingresa al menos una merma valida' }, { status: 400 });

  const { data: mer, error: mErr } = await supabase
    .from('mermas')
    .insert({ fecha, responsable_id, responsable_nombre, observacion: observacion.trim(), estado: 'REGISTRADO' })
    .select('id').single();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const { error: dErr } = await supabase
    .from('detalle_mermas')
    .insert(detalleFinal.map((d: Record<string, unknown>) => ({ ...d, merma_id: mer.id })));
  if (dErr) {
    await supabase.from('mermas').delete().eq('id', mer.id);
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  if (platosPreparados.length) {
    for (const plato of platosPreparados) {
      const { data: platoRow, error: platoErr } = await supabase
        .from('detalle_mermas_platos')
        .insert({
        merma_id: mer.id,
        carta_id: plato.carta_id,
        nombre_plato: plato.nombre_plato,
        cantidad: plato.cantidad,
        motivo: plato.motivo,
        costo_unitario: plato.costo_unitario,
        costo_total: plato.costo_total,
        observacion: plato.observacion,
        })
        .select('id')
        .single();

      if (platoErr) {
        await supabase.from('mermas').delete().eq('id', mer.id);
        return NextResponse.json({ error: `${platoErr.message}. Ejecuta scripts/supabase_mermas_platos.sql en Supabase.` }, { status: 500 });
      }

      const insumoRows = plato.insumos.map(insumo => ({
        detalle_merma_plato_id: platoRow.id,
        ...insumo,
      }));

      if (insumoRows.length) {
        const { error: insErr } = await supabase
          .from('detalle_mermas_platos_insumos')
          .insert(insumoRows);
        if (insErr) {
          await supabase.from('mermas').delete().eq('id', mer.id);
          return NextResponse.json({ error: insErr.message }, { status: 500 });
        }
      }
    }
  }

  return NextResponse.json({ id: mer.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { merma_id, fecha, detalle, delete_ids } = await req.json();

  const hasDetalle = Array.isArray(detalle) && detalle.length > 0;
  const hasDeletes = Array.isArray(delete_ids) && delete_ids.length > 0;
  const hasFecha = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha);

  if (!merma_id || (!hasDetalle && !hasDeletes && !hasFecha))
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  if (hasFecha) {
    const { error } = await supabase
      .from('mermas')
      .update({ fecha })
      .eq('id', merma_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (hasDeletes) {
    const ids = (delete_ids as string[]).filter(Boolean);
    if (ids.length) {
      const { error } = await supabase
        .from('detalle_mermas')
        .delete()
        .eq('merma_id', merma_id)
        .in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (hasDetalle) {
    const ids = detalle.filter((d: { id?: string }) => d.id).map((d: { id: string }) => d.id);
    const { data: rows, error: fetchErr } = await supabase
      .from('detalle_mermas')
      .select('id,costo_unitario')
      .in('id', ids)
      .eq('merma_id', merma_id);
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const cuMap = new Map(rows?.map(r => [r.id, r.costo_unitario as number]) ?? []);

    for (const d of detalle as Array<{ id?: string; cantidad: number; codigo_producto?: string | null; nombre_producto?: string | null; unidad_medida?: string | null; motivo?: string | null; costo_unitario?: number | null; costo_total?: number | null }>) {
      if (!d.id) continue;
      const cantidad = Number(d.cantidad);
      if (!Number.isFinite(cantidad) || cantidad < 0)
        return NextResponse.json({ error: 'Cantidad invalida' }, { status: 400 });

      const cu = cuMap.get(d.id) ?? 0;
      const { error } = await supabase
        .from('detalle_mermas')
        .update({
          cantidad,
          costo_total: Math.round(cantidad * cu),
          updated_at: new Date().toISOString(),
          updated_by: s.email,
          updated_by_rol: s.rol,
        })
        .eq('id', d.id)
        .eq('merma_id', merma_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const nuevos = (detalle as Array<{ id?: string; cantidad: number; codigo_producto?: string | null; nombre_producto?: string | null; unidad_medida?: string | null; motivo?: string | null; costo_unitario?: number | null; costo_total?: number | null }>)
      .filter(d => !d.id);
    if (nuevos.length) {
      const rows = nuevos.map(d => {
        const cantidad = Number(d.cantidad);
        if (!Number.isFinite(cantidad) || cantidad < 0) throw new Error('Cantidad invalida');
        const costoUnitario = Number(d.costo_unitario) || 0;
        return {
          merma_id,
          codigo_producto: d.codigo_producto ?? null,
          nombre_producto: d.nombre_producto ?? null,
          cantidad,
          unidad_medida: d.unidad_medida ?? null,
          motivo: d.motivo ?? null,
          costo_unitario: costoUnitario,
          costo_total: Number.isFinite(Number(d.costo_total)) ? Number(d.costo_total) : Math.round(cantidad * costoUnitario),
        };
      });
      try {
        const { error } = await supabase.from('detalle_mermas').insert(rows);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Error insertando nuevas lineas' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { merma_id } = await req.json();
  if (!merma_id) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });

  const { error } = await supabase.from('mermas').delete().eq('id', merma_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
