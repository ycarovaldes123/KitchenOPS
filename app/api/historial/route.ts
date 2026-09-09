import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getSessionRol } from '@/lib/auth-server';

const SEARCH_FETCH_LIMIT = 5000;
const SUMMARY_FETCH_LIMIT = 10000;

// PostgREST responde 416 (code PGRST103) cuando el offset del .range() cae despues de la ultima
// fila: pasa al paginar mas alla del final (ej. la lista se acorto entre "cargar mas"). No es un
// error real, es una pagina vacia.
function esRangoFuera(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST103' || /range not satisfiable/i.test(error.message ?? '');
}

function normalizarBusqueda(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function textoBuscable(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(textoBuscable).join(' ');
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(textoBuscable).join(' ');
  return '';
}

function asRecordRows(data: unknown[] | null | undefined) {
  return (data ?? []) as Record<string, unknown>[];
}

function childRows(row: Record<string, unknown>, key: string) {
  return Array.isArray(row[key]) ? (row[key] as Record<string, unknown>[]) : [];
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sumChildCost(rows: Record<string, unknown>[], key: string) {
  return rows.reduce((sum, row) => sum + childRows(row, key).reduce((s, d) => s + num(d.costo_total), 0), 0);
}

function buildSummary(tipo: string, rowsUnknown: unknown[] | null | undefined, verCostos: boolean, truncated = false) {
  const rows = asRecordRows(rowsUnknown);
  const registros = rows.length;

  if (tipo === 'produccion') {
    const lineas = rows.reduce((sum, row) => sum + childRows(row, 'detalle_produccion').length, 0);
    const costo_total = verCostos ? sumChildCost(rows, 'detalle_produccion') : null;
    return {
      registros,
      lineas,
      costo_total,
      promedio_registro: verCostos && registros > 0 ? Math.round((costo_total ?? 0) / registros) : null,
      truncated,
    };
  }

  if (tipo === 'colacion') {
    const ingredientes = rows.reduce((sum, row) => sum + childRows(row, 'detalle_colacion').length, 0);
    const inscritos = rows.reduce((sum, row) => sum + num(row.n_inscritos), 0);
    const costo_total = verCostos ? rows.reduce((sum, row) => sum + num(row.costo_total), 0) : null;
    return {
      registros,
      lineas: ingredientes,
      inscritos,
      costo_total,
      promedio_registro: verCostos && registros > 0 ? Math.round((costo_total ?? 0) / registros) : null,
      promedio_plato: verCostos && inscritos > 0 ? Math.round((costo_total ?? 0) / inscritos) : null,
      truncated,
    };
  }

  if (tipo === 'frutas') {
    const lineas = rows.reduce((sum, row) => sum + childRows(row, 'detalle_frutas').length, 0);
    const costo_total = verCostos ? rows.reduce((sum, row) => sum + num(row.costo_total), 0) : null;
    return {
      registros,
      lineas,
      costo_total,
      promedio_registro: verCostos && registros > 0 ? Math.round((costo_total ?? 0) / registros) : null,
      truncated,
    };
  }

  if (tipo === 'mermas') {
    const productos = rows.reduce((sum, row) => sum + childRows(row, 'detalle_mermas').length, 0);
    const platos = rows.reduce((sum, row) => sum + childRows(row, 'detalle_mermas_platos').length, 0);
    const costo_total = verCostos ? sumChildCost(rows, 'detalle_mermas') : null;
    return {
      registros,
      lineas: productos + platos,
      productos,
      platos,
      costo_total,
      promedio_registro: verCostos && registros > 0 ? Math.round((costo_total ?? 0) / registros) : null,
      truncated,
    };
  }

  if (tipo === 'inventario') {
    const productos = rows.reduce((sum, row) => sum + childRows(row, 'detalle_inventario').length, 0);
    const cantidad_total = rows.reduce((sum, row) => sum + childRows(row, 'detalle_inventario').reduce((s, d) => s + num(d.cantidad), 0), 0);
    return {
      registros,
      lineas: productos,
      productos,
      cantidad_total,
      promedio_productos: registros > 0 ? Math.round(productos / registros) : 0,
      truncated,
    };
  }

  return { registros, lineas: 0, truncated };
}

function responderConBusqueda(data: unknown[] | null, busqueda: string, offset: number, limit: number, tipo: string, verCostos: boolean, baseCount?: number | null) {
  const terms = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean);
  const rows = data ?? [];
  const filtered = terms.length
    ? rows.filter(row => {
        const text = normalizarBusqueda(textoBuscable(row));
        return terms.every(term => text.includes(term));
      })
    : rows;
  const items = filtered.slice(offset, offset + limit);
  return NextResponse.json({
    items,
    count: filtered.length,
    hasMore: offset + items.length < filtered.length,
    nextOffset: offset + items.length,
    truncated: Boolean(baseCount && baseCount > SEARCH_FETCH_LIMIT),
    summary: buildSummary(tipo, filtered, verCostos, Boolean(baseCount && baseCount > SEARCH_FETCH_LIMIT)),
  });
}

function responderPaginado(data: unknown[] | null, count: number | null, offset: number, tipo: string, verCostos: boolean, summaryRows?: unknown[] | null) {
  const summaryTruncated = Boolean(count && count > SUMMARY_FETCH_LIMIT);
  return NextResponse.json({
    items: data ?? [],
    count: count ?? 0,
    hasMore: offset + (data?.length ?? 0) < (count ?? 0),
    nextOffset: offset + (data?.length ?? 0),
    summary: buildSummary(tipo, summaryRows ?? data ?? [], verCostos, summaryTruncated),
  });
}

// GET /api/historial?tipo=produccion|colacion|mermas|frutas|inventario&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&q=texto
export async function GET(req: NextRequest) {
  const s = await getSessionRol();
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get('tipo') ?? 'produccion';
  const desde = searchParams.get('desde') ?? '';
  const hasta = searchParams.get('hasta') ?? '';
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '50') || 50));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? '0') || 0);
  const busqueda = searchParams.get('q')?.trim() ?? '';

  const verCostos = s.rol !== 'cocina';

  if (tipo === 'produccion') {
    const detalleSelect = verCostos
      ? 'id,nombre_pp,tipo_pp,cantidad,gramos_por_pp,total_producido,codigo_producto,costo_unitario,costo_total'
      : 'id,nombre_pp,tipo_pp,cantidad,gramos_por_pp,total_producido,codigo_producto';
    let q = supabase
      .from('produccion')
      .select(`id,fecha,responsable_nombre,turno,observacion,estado,created_at,detalle_produccion(${detalleSelect}),rendimiento(id,verdura,kg_utilizados,rendimiento_kg)`, { count: 'exact' })
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    if (busqueda) {
      const { data, error, count } = await q.limit(SEARCH_FETCH_LIMIT);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return responderConBusqueda(data ?? [], busqueda, offset, limit, tipo, verCostos, count);
    }
    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error && !esRangoFuera(error)) return NextResponse.json({ error: error.message }, { status: 500 });
    let sq = supabase
      .from('produccion')
      .select(`id,fecha,detalle_produccion(${detalleSelect})`)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (desde) sq = sq.gte('fecha', desde);
    if (hasta) sq = sq.lte('fecha', hasta);
    const { data: summaryData, error: summaryError } = await sq.limit(SUMMARY_FETCH_LIMIT);
    if (summaryError) return NextResponse.json({ error: summaryError.message }, { status: 500 });
    return responderPaginado(data ?? [], count, offset, tipo, verCostos, summaryData ?? []);
  }

  if (tipo === 'colacion') {
    const detalleSelect = verCostos
      ? 'id,nombre_producto,cantidad,unidad_medida,costo_unitario,costo_total'
      : 'id,nombre_producto,cantidad,unidad_medida';
    const parentSelect = verCostos
      ? `id,fecha,responsable_nombre,menu,n_inscritos,costo_total,created_at,detalle_colacion(${detalleSelect})`
      : `id,fecha,responsable_nombre,menu,n_inscritos,created_at,detalle_colacion(${detalleSelect})`;
    let q = supabase
      .from('colacion')
      .select(parentSelect, { count: 'exact' })
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    if (busqueda) {
      const { data, error, count } = await q.limit(SEARCH_FETCH_LIMIT);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return responderConBusqueda(data ?? [], busqueda, offset, limit, tipo, verCostos, count);
    }
    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error && !esRangoFuera(error)) return NextResponse.json({ error: error.message }, { status: 500 });
    let sq = supabase
      .from('colacion')
      .select(parentSelect)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (desde) sq = sq.gte('fecha', desde);
    if (hasta) sq = sq.lte('fecha', hasta);
    const { data: summaryData, error: summaryError } = await sq.limit(SUMMARY_FETCH_LIMIT);
    if (summaryError) return NextResponse.json({ error: summaryError.message }, { status: 500 });
    return responderPaginado(data ?? [], count, offset, tipo, verCostos, summaryData ?? []);
  }

  if (tipo === 'mermas') {
    const detalleSelect = verCostos
      ? 'id,nombre_producto,cantidad,unidad_medida,motivo,costo_unitario,costo_total'
      : 'id,nombre_producto,cantidad,unidad_medida,motivo';
    const baseSelect = `id,fecha,responsable_nombre,observacion,estado,created_at,detalle_mermas(${detalleSelect})`;
    const platosSelect = `${baseSelect},detalle_mermas_platos(id,nombre_plato,cantidad,motivo,costo_unitario,costo_total,observacion,detalle_mermas_platos_insumos(id,nombre,codigo_producto,cantidad_unitaria,cantidad_total,unidad_medida,precio_unitario,costo_total))`;
    const buildQuery = (select: string) => {
      let q = supabase
        .from('mermas')
        .select(select, { count: 'exact' })
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });
      if (desde) q = q.gte('fecha', desde);
      if (hasta) q = q.lte('fecha', hasta);
      return q;
    };

    let result = busqueda
      ? await buildQuery(platosSelect).limit(SEARCH_FETCH_LIMIT)
      : await buildQuery(platosSelect).range(offset, offset + limit - 1);
    if (result.error && result.error.message.includes('detalle_mermas_platos')) {
      result = busqueda
        ? await buildQuery(baseSelect).limit(SEARCH_FETCH_LIMIT)
        : await buildQuery(baseSelect).range(offset, offset + limit - 1);
    }
    if (result.error && !esRangoFuera(result.error)) return NextResponse.json({ error: result.error.message }, { status: 500 });
    if (busqueda) return responderConBusqueda(result.data ?? [], busqueda, offset, limit, tipo, verCostos, result.count);
    let summaryResult = await buildQuery(platosSelect).limit(SUMMARY_FETCH_LIMIT);
    if (summaryResult.error && summaryResult.error.message.includes('detalle_mermas_platos')) {
      summaryResult = await buildQuery(baseSelect).limit(SUMMARY_FETCH_LIMIT);
    }
    if (summaryResult.error) return NextResponse.json({ error: summaryResult.error.message }, { status: 500 });
    return responderPaginado(result.data ?? [], result.count, offset, tipo, verCostos, summaryResult.data ?? []);
  }

  if (tipo === 'frutas') {
    const detalleSelect = verCostos
      ? 'id,nombre_producto,cantidad,unidad_medida,costo_unitario,costo_total'
      : 'id,nombre_producto,cantidad,unidad_medida';
    const parentSelect = verCostos
      ? `id,fecha,responsable_nombre,observacion,costo_total,created_at,detalle_frutas(${detalleSelect})`
      : `id,fecha,responsable_nombre,observacion,created_at,detalle_frutas(${detalleSelect})`;
    let q = supabase
      .from('frutas')
      .select(parentSelect, { count: 'exact' })
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    if (busqueda) {
      const { data, error, count } = await q.limit(SEARCH_FETCH_LIMIT);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return responderConBusqueda(data ?? [], busqueda, offset, limit, tipo, verCostos, count);
    }
    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error && !esRangoFuera(error)) return NextResponse.json({ error: error.message }, { status: 500 });
    let sq = supabase
      .from('frutas')
      .select(parentSelect)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (desde) sq = sq.gte('fecha', desde);
    if (hasta) sq = sq.lte('fecha', hasta);
    const { data: summaryData, error: summaryError } = await sq.limit(SUMMARY_FETCH_LIMIT);
    if (summaryError) return NextResponse.json({ error: summaryError.message }, { status: 500 });
    return responderPaginado(data ?? [], count, offset, tipo, verCostos, summaryData ?? []);
  }

  if (tipo === 'inventario') {
    const parentSelect = 'id,fecha,responsable_nombre,observacion,created_at,detalle_inventario(id,ubicacion,codigo_producto,nombre_producto,cantidad,unidad_medida)';
    let q = supabase
      .from('inventarios')
      .select(parentSelect, { count: 'exact' })
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    if (busqueda) {
      const { data, error, count } = await q.limit(SEARCH_FETCH_LIMIT);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return responderConBusqueda(data ?? [], busqueda, offset, limit, tipo, verCostos, count);
    }
    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error && !esRangoFuera(error)) return NextResponse.json({ error: error.message }, { status: 500 });
    let sq = supabase
      .from('inventarios')
      .select(parentSelect)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (desde) sq = sq.gte('fecha', desde);
    if (hasta) sq = sq.lte('fecha', hasta);
    const { data: summaryData, error: summaryError } = await sq.limit(SUMMARY_FETCH_LIMIT);
    if (summaryError) return NextResponse.json({ error: summaryError.message }, { status: 500 });
    return responderPaginado(data ?? [], count, offset, tipo, verCostos, summaryData ?? []);
  }

  return NextResponse.json({ error: 'Tipo invalido' }, { status: 400 });
}
