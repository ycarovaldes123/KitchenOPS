import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireRol } from '@/lib/auth-server';
import { createClient } from '@/utils/supabase/server';
import { fetchToteatSales } from '@/lib/toteat';

type IngredienteRow = {
  id: string;
  codigo_producto: string | null;
  nombre: string | null;
  cantidad: number | string | null;
  unidad_medida: string | null;
};

type CartaRow = {
  id: string;
  codigo_toteat?: string | null;
  nombre: string;
  categoria: string;
  activo: boolean;
  carta_ingredientes?: IngredienteRow[] | null;
};

function isIsoDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeCode(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

function formatNumber(value: number) {
  return Number(value.toFixed(6));
}

async function calcular(desde: string, hasta: string) {
  const supabase = await createClient();
  const { data: cartaData, error: cartaError } = await supabase
    .from('carta')
    .select('*, carta_ingredientes(id,codigo_producto,nombre,cantidad,unidad_medida)')
    .eq('activo', true)
    .order('nombre');

  if (cartaError) throw new Error(cartaError.message);

  const ventasResult = await fetchToteatSales(desde, hasta, { soloComida: true });
  const carta = (cartaData ?? []) as unknown as CartaRow[];
  const validaciones = {
    platosSinCodigoToteat: carta
      .filter(p => !normalizeCode(p.codigo_toteat))
      .map(p => ({ id: p.id, plato: p.nombre })),
    codigosDuplicados: [] as { codigo_toteat: string; platos: string[] }[],
    recetasIncompletas: [] as { codigo_toteat: string | null; plato: string; motivo: string }[],
    ventasSinReceta: [] as { codigo_toteat: string | null; plato: string; ventas: number }[],
  };

  const codigoMap = new Map<string, CartaRow[]>();
  for (const plato of carta) {
    const code = normalizeCode(plato.codigo_toteat);
    if (!code) continue;
    const list = codigoMap.get(code) ?? [];
    list.push(plato);
    codigoMap.set(code, list);
  }

  const duplicados = new Set<string>();
  for (const [code, platos] of codigoMap.entries()) {
    if (platos.length <= 1) continue;
    duplicados.add(code);
    validaciones.codigosDuplicados.push({ codigo_toteat: code, platos: platos.map(p => p.nombre) });
  }

  const ventasPorCodigo = new Map<string, { codigo_toteat: string | null; plato: string; ventas: number }>();
  for (const item of ventasResult.items) {
    const code = normalizeCode(item.product_code);
    const key = code || `SIN_CODIGO||${item.product_name}`;
    const current = ventasPorCodigo.get(key) ?? { codigo_toteat: code || null, plato: item.product_name, ventas: 0 };
    current.ventas += Number(item.quantity) || 0;
    ventasPorCodigo.set(key, current);
  }

  const detalle: {
    codigo_toteat: string;
    plato: string;
    ventas: number;
    codigo_producto: string | null;
    producto: string;
    cantidad_por_plato: number;
    unidad_medida: string | null;
    total_por_venta: number;
  }[] = [];
  const consolidadoMap = new Map<string, {
    codigo_producto: string | null;
    producto: string;
    unidad_medida: string | null;
    total_consumido: number;
  }>();

  for (const venta of ventasPorCodigo.values()) {
    const code = normalizeCode(venta.codigo_toteat);
    const matches = code ? codigoMap.get(code) : null;
    if (!code || !matches?.length) {
      validaciones.ventasSinReceta.push(venta);
      continue;
    }
    if (duplicados.has(code)) continue;

    const plato = matches[0];
    const ingredientes = plato.carta_ingredientes ?? [];
    if (!ingredientes.length) {
      validaciones.recetasIncompletas.push({ codigo_toteat: code, plato: plato.nombre, motivo: 'Sin ingredientes cargados' });
      continue;
    }

    for (const ing of ingredientes) {
      const cantidadPorPlato = Number(ing.cantidad);
      if (!ing.nombre || !Number.isFinite(cantidadPorPlato) || cantidadPorPlato <= 0) {
        validaciones.recetasIncompletas.push({ codigo_toteat: code, plato: plato.nombre, motivo: `Ingrediente incompleto (${ing.nombre ?? 'sin nombre'})` });
        continue;
      }

      const total = cantidadPorPlato * venta.ventas;
      const row = {
        codigo_toteat: code,
        plato: plato.nombre,
        ventas: formatNumber(venta.ventas),
        codigo_producto: ing.codigo_producto,
        producto: ing.nombre,
        cantidad_por_plato: formatNumber(cantidadPorPlato),
        unidad_medida: ing.unidad_medida,
        total_por_venta: formatNumber(total),
      };
      detalle.push(row);

      const key = `${ing.codigo_producto ?? ''}||${ing.nombre}||${ing.unidad_medida ?? ''}`;
      const current = consolidadoMap.get(key) ?? {
        codigo_producto: ing.codigo_producto,
        producto: ing.nombre,
        unidad_medida: ing.unidad_medida,
        total_consumido: 0,
      };
      current.total_consumido += total;
      consolidadoMap.set(key, current);
    }
  }

  return {
    desde,
    hasta,
    fuente: 'toteat_api',
    ventasLeidas: ventasResult.items.length,
    detalle: detalle.sort((a, b) => a.plato.localeCompare(b.plato, 'es') || a.producto.localeCompare(b.producto, 'es')),
    consolidado: Array.from(consolidadoMap.values())
      .map(row => ({ ...row, total_consumido: formatNumber(row.total_consumido) }))
      .sort((a, b) => a.producto.localeCompare(b.producto, 'es')),
    validaciones,
  };
}

async function buildWorkbook(data: Awaited<ReturnType<typeof calcular>>) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Consumo ventas');
  ws.columns = [
    { header: 'Código TOTEAT', key: 'codigo_toteat', width: 18 },
    { header: 'Plato', key: 'plato', width: 36 },
    { header: 'Ventas', key: 'ventas', width: 12 },
    { header: 'Código producto', key: 'codigo_producto', width: 18 },
    { header: 'Producto', key: 'producto', width: 36 },
    { header: 'Cantidad por plato', key: 'cantidad_por_plato', width: 18 },
    { header: 'Total por venta', key: 'total_por_venta', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const row of data.detalle) ws.addRow(row);

  const start = ws.rowCount + 3;
  ws.getCell(start, 1).value = 'Consolidado final por producto';
  ws.getCell(start, 1).font = { bold: true };
  const header = ws.getRow(start + 1);
  header.values = ['Código producto', 'Producto', 'Unidad', 'Total consumido'];
  header.font = { bold: true };
  for (const row of data.consolidado) {
    ws.addRow([row.codigo_producto, row.producto, row.unidad_medida, row.total_consumido]);
  }

  const valStart = ws.rowCount + 3;
  ws.getCell(valStart, 1).value = 'Validaciones';
  ws.getCell(valStart, 1).font = { bold: true };
  const warnings = [
    ...data.validaciones.platosSinCodigoToteat.map(p => `Plato sin Codigo TOTEAT: ${p.plato}`),
    ...data.validaciones.codigosDuplicados.map(d => `Codigo TOTEAT duplicado ${d.codigo_toteat}: ${d.platos.join(', ')}`),
    ...data.validaciones.recetasIncompletas.map(r => `Receta incompleta ${r.codigo_toteat ?? '-'} ${r.plato}: ${r.motivo}`),
    ...data.validaciones.ventasSinReceta.map(v => `Venta sin receta ${v.codigo_toteat ?? '-'} ${v.plato}: ${v.ventas}`),
  ];
  if (warnings.length) warnings.forEach(w => ws.addRow([w]));
  else ws.addRow(['Sin observaciones']);

  return wb;
}

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'jefatura']);
  if (!s.ok) return s.response;

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  if (!isIsoDate(desde) || !isIsoDate(hasta)) {
    return NextResponse.json({ error: 'Debes enviar desde y hasta en formato YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const data = await calcular(desde, hasta);
    if (searchParams.get('export') === '1') {
      const wb = await buildWorkbook(data);
      const buffer = await wb.xlsx.writeBuffer();
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Consumo_ventas_${desde}_${hasta}.xlsx"`,
        },
      });
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error consultando consumo ventas' }, { status: 500 });
  }
}
