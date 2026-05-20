import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import * as XLSX from 'xlsx';
import { requireRol } from '@/lib/auth-server';

// GET /api/export?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'jefatura']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde') ?? '';
  const hasta = searchParams.get('hasta') ?? '';

  if (!desde || !hasta)
    return NextResponse.json({ error: 'Parámetros desde/hasta requeridos' }, { status: 400 });

  const verCostos = s.rol === 'admin' || s.rol === 'finanzas';

  // ── Fetch paralelo ────────────────────────────────────────────
  const [
    { data: producciones },
    { data: colaciones },
    { data: mermas },
  ] = await Promise.all([
    supabase
      .from('produccion')
      .select('fecha,responsable_nombre,turno,observacion,detalle_produccion(nombre_pp,tipo_pp,cantidad,gramos_por_pp,total_producido,codigo_producto,costo_unitario,costo_total),rendimiento(fecha,verdura,kg_utilizados,rendimiento_kg,responsable_nombre)')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: true }),
    supabase
      .from('colacion')
      .select('fecha,responsable_nombre,menu,n_inscritos,costo_total,detalle_colacion(nombre_producto,cantidad,unidad_medida,costo_unitario,costo_total)')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: true }),
    supabase
      .from('mermas')
      .select('fecha,responsable_nombre,observacion,detalle_mermas(nombre_producto,cantidad,unidad_medida,motivo,costo_unitario,costo_total)')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: true }),
  ]);

  const wb = XLSX.utils.book_new();

  // ── Hoja RESUMEN (metadatos del archivo) ─────────────────────
  const ahora = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short',
  }).format(new Date());
  const nProd   = (producciones ?? []).length;
  const nCol    = (colaciones  ?? []).length;
  const nMermas = (mermas      ?? []).length;
  const rowsRes: unknown[][] = [
    ['KitchenOPS — Exportación de datos operacionales'],
    [],
    ['Sistema',   'KitchenOPS — Cervecería Kunstmann, Torobayo'],
    ['Período',   `${desde} al ${hasta}`],
    ['Generado',  ahora],
    [],
    ['Resumen de registros'],
    ['Hoja', 'Registros'],
    ['PRODUCCION (informes)', nProd],
    ['VERDURAS (rendimientos)', (producciones ?? []).flatMap((p: unknown) => (p as { rendimiento?: unknown[] }).rendimiento ?? []).length],
    ['COLACION',  nCol],
    ['MERMA',     nMermas],
    [],
    ['Reglas de cálculo'],
    ['precio_carta',  'Incluye IVA 19% — nunca recalcular'],
    ['costo_bruto',   'costo_neto × 1.19'],
    ['margen',        '(precio_carta − costo_bruto) / precio_carta × 100'],
    ['merma_kg',      'MAX(0, kg_utilizados − rendimiento_kg)'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsRes), 'RESUMEN');

  // ── Hoja PRODUCCION ──────────────────────────────────────────
  type ProdRow = {
    fecha: string; responsable_nombre: string; turno: string; observacion: string;
    detalle_produccion: { nombre_pp: string; tipo_pp: string; cantidad: number; gramos_por_pp: number | null; total_producido: number | null; codigo_producto: string | null; costo_unitario: number; costo_total: number }[];
  };
  const headerProd = verCostos
    ? ['Fecha', 'Responsable', 'Turno', 'Observación', 'PP', 'Tipo', 'Cantidad', 'Gramos/PP', 'Total producido (g)', 'Código producto', 'Costo unitario', 'Costo total']
    : ['Fecha', 'Responsable', 'Turno', 'Observación', 'PP', 'Tipo', 'Cantidad', 'Gramos/PP', 'Total producido (g)'];
  const rowsProd: unknown[][] = [headerProd];
  for (const p of (producciones ?? []) as ProdRow[]) {
    for (const d of p.detalle_produccion ?? []) {
      const row: unknown[] = [p.fecha, p.responsable_nombre, p.turno, p.observacion, d.nombre_pp, d.tipo_pp, d.cantidad, d.gramos_por_pp ?? '', d.total_producido ?? ''];
      if (verCostos) row.push(d.codigo_producto ?? '', d.costo_unitario, d.costo_total);
      rowsProd.push(row);
    }
    if (!p.detalle_produccion?.length) {
      const row: unknown[] = [p.fecha, p.responsable_nombre, p.turno, p.observacion, '', '', '', '', ''];
      if (verCostos) row.push('', '', '');
      rowsProd.push(row);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsProd), 'PRODUCCION');

  // ── Hoja VERDURAS ─────────────────────────────────────────────
  type RendRow = { fecha: string; verdura: string; kg_utilizados: number; rendimiento_kg: number; responsable_nombre: string | null };
  const rowsVerd: unknown[][] = [
    ['Fecha', 'Responsable', 'Verdura', 'KG utilizados', 'KG rendimiento', 'Merma KG', 'Merma %'],
  ];
  for (const p of (producciones ?? []) as ProdRow[]) {
    for (const r of (p as unknown as { rendimiento: RendRow[] }).rendimiento ?? []) {
      const mermaKg  = Math.max(0, r.kg_utilizados - r.rendimiento_kg);
      const mermaPct = r.kg_utilizados > 0 ? Math.round((mermaKg / r.kg_utilizados) * 1000) / 10 : 0;
      rowsVerd.push([
        r.fecha, r.responsable_nombre ?? p.responsable_nombre,
        r.verdura, r.kg_utilizados, r.rendimiento_kg,
        Math.round(mermaKg * 100) / 100, mermaPct,
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsVerd), 'VERDURAS');

  // ── Hoja COLACION ─────────────────────────────────────────────
  type ColRow = {
    fecha: string; responsable_nombre: string; menu: string; n_inscritos: number; costo_total: number;
    detalle_colacion: { nombre_producto: string; cantidad: number; unidad_medida: string; costo_unitario: number; costo_total: number }[];
  };
  const headerCol = verCostos
    ? ['Fecha', 'Responsable', 'Menú', 'N° inscritos', 'Costo total', 'Costo por plato', 'Ingrediente', 'Cantidad', 'Unidad', 'Costo unitario', 'Costo ingrediente']
    : ['Fecha', 'Responsable', 'Menú', 'N° inscritos', 'Ingrediente', 'Cantidad', 'Unidad'];
  const rowsCol: unknown[][] = [headerCol];
  for (const c of (colaciones ?? []) as ColRow[]) {
    const cpp = c.n_inscritos > 0 ? Math.round(c.costo_total / c.n_inscritos) : 0;
    for (const d of c.detalle_colacion ?? []) {
      const row: unknown[] = verCostos
        ? [c.fecha, c.responsable_nombre, c.menu, c.n_inscritos, c.costo_total, cpp, d.nombre_producto, d.cantidad, d.unidad_medida, d.costo_unitario, d.costo_total]
        : [c.fecha, c.responsable_nombre, c.menu, c.n_inscritos, d.nombre_producto, d.cantidad, d.unidad_medida];
      rowsCol.push(row);
    }
    if (!c.detalle_colacion?.length) {
      const row: unknown[] = verCostos
        ? [c.fecha, c.responsable_nombre, c.menu, c.n_inscritos, c.costo_total, cpp, '', '', '', '', '']
        : [c.fecha, c.responsable_nombre, c.menu, c.n_inscritos, '', '', ''];
      rowsCol.push(row);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsCol), 'COLACION');

  // ── Hoja MERMA ────────────────────────────────────────────────
  type MermaRow = {
    fecha: string; responsable_nombre: string; observacion: string;
    detalle_mermas: { nombre_producto: string; cantidad: number; unidad_medida: string; motivo: string | null; costo_unitario: number; costo_total: number }[];
  };
  const headerMer = verCostos
    ? ['Fecha', 'Responsable', 'Observación', 'Producto', 'Cantidad', 'Unidad', 'Motivo', 'Costo unitario', 'Costo total']
    : ['Fecha', 'Responsable', 'Observación', 'Producto', 'Cantidad', 'Unidad', 'Motivo'];
  const rowsMer: unknown[][] = [headerMer];
  for (const m of (mermas ?? []) as MermaRow[]) {
    for (const d of m.detalle_mermas ?? []) {
      const row: unknown[] = verCostos
        ? [m.fecha, m.responsable_nombre, m.observacion, d.nombre_producto, d.cantidad, d.unidad_medida, d.motivo ?? '', d.costo_unitario, d.costo_total]
        : [m.fecha, m.responsable_nombre, m.observacion, d.nombre_producto, d.cantidad, d.unidad_medida, d.motivo ?? ''];
      rowsMer.push(row);
    }
    if (!m.detalle_mermas?.length) {
      const row: unknown[] = verCostos
        ? [m.fecha, m.responsable_nombre, m.observacion, '', '', '', '', '', '']
        : [m.fecha, m.responsable_nombre, m.observacion, '', '', '', ''];
      rowsMer.push(row);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsMer), 'MERMA');

  // ── Generar archivo ───────────────────────────────────────────
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const filename = `KitchenOps_${desde}_${hasta}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
