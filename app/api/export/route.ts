import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { requireRol } from '@/lib/auth-server';
import { createClient } from '@/utils/supabase/server';

type RendRow = {
  fecha: string;
  verdura: string;
  kg_utilizados: number;
  rendimiento_kg: number;
  responsable_nombre: string | null;
};

type ProdDetalleRow = {
  nombre_pp: string;
  tipo_pp: string;
  cantidad: number;
  gramos_por_pp: number | null;
  total_producido: number | null;
  codigo_producto: string | null;
  costo_unitario: number;
  costo_total: number;
};

type ProdRow = {
  fecha: string;
  responsable_nombre: string;
  turno: string;
  observacion: string;
  detalle_produccion: ProdDetalleRow[];
  rendimiento?: RendRow[];
};

type ColDetalleRow = {
  codigo_producto: string | null;
  nombre_producto: string;
  cantidad: number;
  unidad_medida: string | null;
  costo_unitario: number;
  costo_total: number;
};

type ColRow = {
  fecha: string;
  responsable_nombre: string;
  menu: string;
  n_inscritos: number;
  costo_total: number;
  detalle_colacion: ColDetalleRow[];
};

type FrutaDetalleRow = {
  codigo_producto: string | null;
  nombre_producto: string;
  cantidad: number;
  unidad_medida: string | null;
  costo_unitario: number;
  costo_total: number;
};

type FrutaRow = {
  fecha: string;
  responsable_nombre: string;
  observacion: string | null;
  costo_total: number;
  detalle_frutas: FrutaDetalleRow[];
};

type InventarioDetalleRow = {
  ubicacion: string;
  codigo_producto: string | null;
  nombre_producto: string;
  cantidad: number;
  unidad_medida: string | null;
};

type InventarioRow = {
  fecha: string;
  responsable_nombre: string;
  observacion: string | null;
  detalle_inventario: InventarioDetalleRow[];
};

type MermaDetalleRow = {
  codigo_producto: string | null;
  nombre_producto: string;
  cantidad: number;
  unidad_medida: string | null;
  motivo: string | null;
  costo_unitario: number;
  costo_total: number;
};

type MermaPlatoInsumoRow = {
  id: string;
  detalle_merma_plato_id: string;
  nombre: string;
  codigo_producto: string | null;
  cantidad_unitaria: number;
  cantidad_total: number;
  unidad_medida: string | null;
  precio_unitario: number;
  costo_total: number;
};

type MermaPlatoRow = {
  id: string;
  merma_id: string;
  nombre_plato: string;
  cantidad: number;
  motivo: string | null;
  costo_unitario: number;
  costo_total: number;
  observacion: string | null;
  detalle_mermas_platos_insumos?: MermaPlatoInsumoRow[];
};

type MermaBaseRow = {
  id: string;
  fecha: string;
  responsable_nombre: string;
  observacion: string;
  detalle_mermas: MermaDetalleRow[];
  detalle_mermas_platos?: MermaPlatoRow[];
};

type ProductoCodigoRow = {
  codigo: string;
  nombre: string;
};

type VerduraCodigoRow = {
  nombre: string;
  codigo_producto: string | null;
};

function normalizeText(text: unknown) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// GET /api/export?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde') ?? '';
  const hasta = searchParams.get('hasta') ?? '';

  if (!desde || !hasta) {
    return NextResponse.json({ error: 'Parametros desde/hasta requeridos' }, { status: 400 });
  }

  const verCostos = s.rol === 'admin' || s.rol === 'finanzas';

  const [prodResult, colResult, mermaResult, frutaResult, inventarioResult, productosResult, verdurasResult] = await Promise.all([
    supabase
      .from('produccion')
      .select('fecha,responsable_nombre,turno,observacion,detalle_produccion(nombre_pp,tipo_pp,cantidad,gramos_por_pp,total_producido,codigo_producto,costo_unitario,costo_total),rendimiento(fecha,verdura,kg_utilizados,rendimiento_kg,responsable_nombre)')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true }),
    supabase
      .from('colacion')
      .select('fecha,responsable_nombre,menu,n_inscritos,costo_total,detalle_colacion(codigo_producto,nombre_producto,cantidad,unidad_medida,costo_unitario,costo_total)')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true }),
    supabase
      .from('mermas')
      .select('id,fecha,responsable_nombre,observacion,detalle_mermas(codigo_producto,nombre_producto,cantidad,unidad_medida,motivo,costo_unitario,costo_total)')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true }),
    supabase
      .from('frutas')
      .select('fecha,responsable_nombre,observacion,costo_total,detalle_frutas(codigo_producto,nombre_producto,cantidad,unidad_medida,costo_unitario,costo_total)')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true }),
    supabase
      .from('inventarios')
      .select('fecha,responsable_nombre,observacion,detalle_inventario(ubicacion,codigo_producto,nombre_producto,cantidad,unidad_medida)')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true }),
    supabase
      .from('productos')
      .select('codigo,nombre'),
    supabase
      .from('verduras')
      .select('nombre,codigo_producto'),
  ]);

  if (prodResult.error) return NextResponse.json({ error: prodResult.error.message }, { status: 500 });
  if (colResult.error) return NextResponse.json({ error: colResult.error.message }, { status: 500 });
  if (mermaResult.error) return NextResponse.json({ error: mermaResult.error.message }, { status: 500 });
  if (frutaResult.error) return NextResponse.json({ error: frutaResult.error.message }, { status: 500 });
  if (inventarioResult.error) return NextResponse.json({ error: inventarioResult.error.message }, { status: 500 });
  if (productosResult.error) return NextResponse.json({ error: productosResult.error.message }, { status: 500 });

  const producciones = (prodResult.data ?? []) as ProdRow[];
  const colaciones = (colResult.data ?? []) as ColRow[];
  const mermasBase = (mermaResult.data ?? []) as MermaBaseRow[];
  const frutas = (frutaResult.data ?? []) as FrutaRow[];
  const inventarios = (inventarioResult.data ?? []) as InventarioRow[];
  const codigoProductoPorNombre = new Map<string, string>();
  for (const producto of (productosResult.data ?? []) as ProductoCodigoRow[]) {
    const key = normalizeText(producto.nombre);
    if (key && !codigoProductoPorNombre.has(key)) {
      codigoProductoPorNombre.set(key, producto.codigo);
    }
  }
  const codigoVerduraPorNombre = new Map<string, string>();
  if (!verdurasResult.error) {
    for (const verdura of (verdurasResult.data ?? []) as VerduraCodigoRow[]) {
      const key = normalizeText(verdura.nombre);
      if (key && verdura.codigo_producto && !codigoVerduraPorNombre.has(key)) {
        codigoVerduraPorNombre.set(key, verdura.codigo_producto);
      }
    }
  }

  const mermaIds = [...new Set(mermasBase.map(merma => merma.id).filter(Boolean))];
  const { data: mermaPlatosData, error: mermaPlatosError } = mermaIds.length
    ? await supabase
        .from('detalle_mermas_platos')
        .select('id,merma_id,nombre_plato,cantidad,motivo,costo_unitario,costo_total,observacion')
        .in('merma_id', mermaIds)
    : { data: [], error: null };
  if (mermaPlatosError) return NextResponse.json({ error: mermaPlatosError.message }, { status: 500 });

  const mermaPlatoIds = [...new Set(((mermaPlatosData ?? []) as MermaPlatoRow[]).map(plato => plato.id).filter(Boolean))];
  const { data: mermaPlatoInsumosData, error: mermaPlatoInsumosError } = mermaPlatoIds.length
    ? await supabase
        .from('detalle_mermas_platos_insumos')
        .select('id,detalle_merma_plato_id,nombre,codigo_producto,cantidad_unitaria,cantidad_total,unidad_medida,precio_unitario,costo_total')
        .in('detalle_merma_plato_id', mermaPlatoIds)
    : { data: [], error: null };
  if (mermaPlatoInsumosError) return NextResponse.json({ error: mermaPlatoInsumosError.message }, { status: 500 });

  const insumosByPlatoId = new Map<string, MermaPlatoInsumoRow[]>();
  for (const insumo of (mermaPlatoInsumosData ?? []) as MermaPlatoInsumoRow[]) {
    if (!insumosByPlatoId.has(insumo.detalle_merma_plato_id)) {
      insumosByPlatoId.set(insumo.detalle_merma_plato_id, []);
    }
    insumosByPlatoId.get(insumo.detalle_merma_plato_id)!.push(insumo);
  }

  const platosByMermaId = new Map<string, MermaPlatoRow[]>();
  for (const plato of (mermaPlatosData ?? []) as MermaPlatoRow[]) {
    const platoCompleto = {
      ...plato,
      detalle_mermas_platos_insumos: insumosByPlatoId.get(plato.id) ?? [],
    };
    if (!platosByMermaId.has(plato.merma_id)) {
      platosByMermaId.set(plato.merma_id, []);
    }
    platosByMermaId.get(plato.merma_id)!.push(platoCompleto);
  }

  const mermas: MermaBaseRow[] = mermasBase.map(merma => ({
    ...merma,
    detalle_mermas_platos: platosByMermaId.get(merma.id) ?? [],
  }));

  const wb = XLSX.utils.book_new();

  const ahora = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());

  const rowsRes: unknown[][] = [
    ['KitchenOPS - Exportacion de datos operacionales'],
    [],
    ['Sistema', 'KitchenOPS - Cerveceria Kunstmann, Torobayo'],
    ['Periodo', `${desde} al ${hasta}`],
    ['Generado', ahora],
    [],
    ['Resumen de registros'],
    ['Hoja', 'Registros'],
    ['PRODUCCION (informes)', producciones.length],
    ['VERDURAS (rendimientos)', producciones.flatMap(produccion => produccion.rendimiento ?? []).length],
    ['COLACION', colaciones.length],
    ['FRUTAS', frutas.length],
    ['TOMA INVENTARIO', inventarios.length],
    ['MERMA', mermas.length],
    ['MERMA PLATOS', mermas.flatMap(merma => merma.detalle_mermas_platos ?? []).length],
    [],
    ['Reglas de calculo'],
    ['precio_carta', 'Incluye IVA 19% - nunca recalcular'],
    ['costo_bruto', 'costo_neto x 1.19'],
    ['margen', '(precio_carta - costo_bruto) / precio_carta x 100'],
    ['merma_kg', 'MAX(0, kg_utilizados - rendimiento_kg)'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsRes), 'RESUMEN');

  const headerProd = verCostos
    ? ['Fecha', 'Responsable', 'Turno', 'Observacion', 'PP', 'Tipo', 'Cantidad', 'Gramos/PP', 'Total producido (g)', 'Costo unitario', 'Costo total']
    : ['Fecha', 'Responsable', 'Turno', 'Observacion', 'PP', 'Tipo', 'Cantidad', 'Gramos/PP', 'Total producido (g)'];
  const rowsProd: unknown[][] = [headerProd];
  for (const produccion of producciones) {
    for (const detalle of produccion.detalle_produccion ?? []) {
      const row: unknown[] = [
        produccion.fecha,
        produccion.responsable_nombre,
        produccion.turno,
        produccion.observacion,
        detalle.nombre_pp,
        detalle.tipo_pp,
        detalle.cantidad,
        detalle.gramos_por_pp ?? '',
        detalle.total_producido ?? '',
      ];
      if (verCostos) row.push(detalle.costo_unitario, detalle.costo_total);
      rowsProd.push(row);
    }

    if (!produccion.detalle_produccion?.length) {
      const row: unknown[] = [
        produccion.fecha,
        produccion.responsable_nombre,
        produccion.turno,
        produccion.observacion,
        '',
        '',
        '',
        '',
        '',
      ];
      if (verCostos) row.push('', '');
      rowsProd.push(row);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsProd), 'PRODUCCION');

  const rowsVerd: unknown[][] = [
    ['Fecha', 'Responsable', 'Código producto', 'Verdura', 'KG utilizados', 'KG rendimiento', 'Merma KG', 'Merma %'],
  ];
  for (const produccion of producciones) {
    for (const rendimiento of produccion.rendimiento ?? []) {
      const mermaKg = Math.max(0, rendimiento.kg_utilizados - rendimiento.rendimiento_kg);
      const mermaPct = rendimiento.kg_utilizados > 0
        ? Math.round((mermaKg / rendimiento.kg_utilizados) * 1000) / 10
        : 0;

      rowsVerd.push([
        rendimiento.fecha,
        rendimiento.responsable_nombre ?? produccion.responsable_nombre,
        codigoVerduraPorNombre.get(normalizeText(rendimiento.verdura))
          ?? codigoProductoPorNombre.get(normalizeText(rendimiento.verdura))
          ?? '',
        rendimiento.verdura,
        rendimiento.kg_utilizados,
        rendimiento.rendimiento_kg,
        Math.round(mermaKg * 100) / 100,
        mermaPct,
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsVerd), 'VERDURAS');

  const headerCol = verCostos
    ? ['Fecha', 'Responsable', 'Menú', 'N° inscritos', 'Costo total', 'Costo por plato', 'Código producto', 'Ingrediente', 'Cantidad', 'Unidad', 'Costo unitario', 'Costo ingrediente']
    : ['Fecha', 'Responsable', 'Menú', 'N° inscritos', 'Código producto', 'Ingrediente', 'Cantidad', 'Unidad'];
  const rowsCol: unknown[][] = [headerCol];
  for (const colacion of colaciones) {
    const costoPorPlato = colacion.n_inscritos > 0
      ? Math.round(colacion.costo_total / colacion.n_inscritos)
      : 0;

    for (const detalle of colacion.detalle_colacion ?? []) {
      const row: unknown[] = verCostos
        ? [
            colacion.fecha,
            colacion.responsable_nombre,
            colacion.menu,
            colacion.n_inscritos,
            colacion.costo_total,
            costoPorPlato,
            detalle.codigo_producto ?? '',
            detalle.nombre_producto,
            detalle.cantidad,
            detalle.unidad_medida ?? '',
            detalle.costo_unitario,
            detalle.costo_total,
          ]
        : [
            colacion.fecha,
            colacion.responsable_nombre,
            colacion.menu,
            colacion.n_inscritos,
            detalle.codigo_producto ?? '',
            detalle.nombre_producto,
            detalle.cantidad,
            detalle.unidad_medida ?? '',
          ];
      rowsCol.push(row);
    }

    if (!colacion.detalle_colacion?.length) {
      const row: unknown[] = verCostos
        ? [colacion.fecha, colacion.responsable_nombre, colacion.menu, colacion.n_inscritos, colacion.costo_total, costoPorPlato, '', '', '', '', '', '']
        : [colacion.fecha, colacion.responsable_nombre, colacion.menu, colacion.n_inscritos, '', '', '', ''];
      rowsCol.push(row);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsCol), 'COLACION');

  const headerFrutas = verCostos
    ? ['Fecha', 'Responsable', 'Observación', 'Código producto', 'Fruta', 'Cantidad', 'Unidad', 'Costo unitario', 'Costo total']
    : ['Fecha', 'Responsable', 'Observación', 'Código producto', 'Fruta', 'Cantidad', 'Unidad'];
  const rowsFrutas: unknown[][] = [headerFrutas];
  for (const fruta of frutas) {
    for (const detalle of fruta.detalle_frutas ?? []) {
      const row: unknown[] = verCostos
        ? [
            fruta.fecha,
            fruta.responsable_nombre,
            fruta.observacion ?? '',
            detalle.codigo_producto ?? '',
            detalle.nombre_producto,
            detalle.cantidad,
            detalle.unidad_medida ?? '',
            detalle.costo_unitario,
            detalle.costo_total,
          ]
        : [
            fruta.fecha,
            fruta.responsable_nombre,
            fruta.observacion ?? '',
            detalle.codigo_producto ?? '',
            detalle.nombre_producto,
            detalle.cantidad,
            detalle.unidad_medida ?? '',
          ];
      rowsFrutas.push(row);
    }

    if (!fruta.detalle_frutas?.length) {
      const row: unknown[] = verCostos
        ? [fruta.fecha, fruta.responsable_nombre, fruta.observacion ?? '', '', '', '', '', '', '']
        : [fruta.fecha, fruta.responsable_nombre, fruta.observacion ?? '', '', '', '', ''];
      rowsFrutas.push(row);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsFrutas), 'FRUTAS');

  const rowsInventario: unknown[][] = [
    ['Camaras', 'Codigo de producto', 'Nombre o producto', 'Cantidad ingresada', 'Responsable'],
  ];
  for (const inventario of inventarios) {
    for (const detalle of inventario.detalle_inventario ?? []) {
      rowsInventario.push([
        detalle.ubicacion,
        detalle.codigo_producto ?? '',
        detalle.nombre_producto,
        detalle.cantidad,
        inventario.responsable_nombre,
      ]);
    }

    if (!inventario.detalle_inventario?.length) {
      rowsInventario.push(['', '', '', '', inventario.responsable_nombre]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsInventario), 'TOMA INVENTARIO');

  const headerMer = verCostos
    ? ['Fecha', 'Responsable', 'Observación', 'Código producto', 'Producto', 'Cantidad', 'Unidad', 'Motivo', 'Costo unitario', 'Costo total']
    : ['Fecha', 'Responsable', 'Observación', 'Código producto', 'Producto', 'Cantidad', 'Unidad', 'Motivo'];
  const rowsMer: unknown[][] = [headerMer];
  for (const merma of mermas) {
    for (const detalle of merma.detalle_mermas ?? []) {
      const row: unknown[] = verCostos
        ? [
            merma.fecha,
            merma.responsable_nombre,
            merma.observacion,
            detalle.codigo_producto ?? '',
            detalle.nombre_producto,
            detalle.cantidad,
            detalle.unidad_medida ?? '',
            detalle.motivo ?? '',
            detalle.costo_unitario,
            detalle.costo_total,
          ]
        : [
            merma.fecha,
            merma.responsable_nombre,
            merma.observacion,
            detalle.codigo_producto ?? '',
            detalle.nombre_producto,
            detalle.cantidad,
            detalle.unidad_medida ?? '',
            detalle.motivo ?? '',
          ];
      rowsMer.push(row);
    }

    if (!merma.detalle_mermas?.length) {
      const row: unknown[] = verCostos
        ? [merma.fecha, merma.responsable_nombre, merma.observacion, '', '', '', '', '', '', '']
        : [merma.fecha, merma.responsable_nombre, merma.observacion, '', '', '', '', ''];
      rowsMer.push(row);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsMer), 'MERMA');

  const headerMerPlatos = verCostos
    ? ['Fecha', 'Responsable', 'Observacion merma', 'Plato', 'Cantidad plato', 'Motivo', 'Observacion plato', 'Codigo producto', 'Insumo', 'Cantidad unitaria', 'Cantidad total', 'Unidad', 'Precio unitario', 'Costo insumo']
    : ['Fecha', 'Responsable', 'Observacion merma', 'Plato', 'Cantidad plato', 'Motivo', 'Observacion plato', 'Codigo producto', 'Insumo', 'Cantidad unitaria', 'Cantidad total', 'Unidad'];
  const rowsMerPlatos: unknown[][] = [headerMerPlatos];
  for (const merma of mermas) {
    for (const plato of merma.detalle_mermas_platos ?? []) {
      const insumos = plato.detalle_mermas_platos_insumos ?? [];

      if (!insumos.length) {
        const row: unknown[] = verCostos
          ? [merma.fecha, merma.responsable_nombre, merma.observacion, plato.nombre_plato, plato.cantidad, plato.motivo ?? '', plato.observacion ?? '', '', '', '', '', '', '', plato.costo_total]
          : [merma.fecha, merma.responsable_nombre, merma.observacion, plato.nombre_plato, plato.cantidad, plato.motivo ?? '', plato.observacion ?? '', '', '', '', '', ''];
        rowsMerPlatos.push(row);
        continue;
      }

      for (const insumo of insumos) {
        const row: unknown[] = verCostos
          ? [
              merma.fecha,
              merma.responsable_nombre,
              merma.observacion,
              plato.nombre_plato,
              plato.cantidad,
              plato.motivo ?? '',
              plato.observacion ?? '',
              insumo.codigo_producto ?? '',
              insumo.nombre,
              insumo.cantidad_unitaria,
              insumo.cantidad_total,
              insumo.unidad_medida ?? '',
              insumo.precio_unitario,
              insumo.costo_total,
            ]
          : [
              merma.fecha,
              merma.responsable_nombre,
              merma.observacion,
              plato.nombre_plato,
              plato.cantidad,
              plato.motivo ?? '',
              plato.observacion ?? '',
              insumo.codigo_producto ?? '',
              insumo.nombre,
              insumo.cantidad_unitaria,
              insumo.cantidad_total,
              insumo.unidad_medida ?? '',
            ];
        rowsMerPlatos.push(row);
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsMerPlatos), 'MERMA PLATOS');

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
