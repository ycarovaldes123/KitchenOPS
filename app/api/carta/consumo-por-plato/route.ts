import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireRol } from '@/lib/auth-server';
import { createClient } from '@/utils/supabase/server';
import { fetchToteatSales } from '@/lib/toteat';

type IngredienteRow = {
  codigo_producto: string | null;
  nombre: string | null;
  cantidad: number | string | null;
  unidad_medida: string | null;
};

type CartaRow = {
  id: string;
  cod_softland: string | null;
  codigo_toteat: string | null;
  nombre: string;
  categoria: string;
  activo: boolean;
  carta_ingredientes?: IngredienteRow[] | null;
};

interface ConsumoPorPlatoRow {
  categoria: string;
  id: string | null;
  id_toteat: string;
  plato: string;
  producto: string;
  id_producto: string | null;
  cantidad: number;
  venta: number;
  total_consumido: number;
}

function isIsoDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeCode(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

function formatNumber(value: number) {
  return Number(value.toFixed(6));
}

function fechaHoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

async function calcularConsumoPorPlato(desde: string, hasta: string) {
  const supabase = await createClient();
  const { data: cartaData, error: cartaError } = await supabase
    .from('carta')
    .select('id, cod_softland, codigo_toteat, nombre, categoria, activo, carta_ingredientes(codigo_producto,nombre,cantidad,unidad_medida)')
    .eq('activo', true)
    .order('nombre');

  if (cartaError) throw new Error(cartaError.message);

  const ventasResult = await fetchToteatSales(desde, hasta, { soloComida: true });
  const carta = (cartaData ?? []) as unknown as CartaRow[];

  // Un mismo Código TOTEAT identifica de forma única al plato (usado para
  // cruzar recetas de carta con las ventas reales de TOTEAT).
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
    if (platos.length > 1) duplicados.add(code);
  }

  const ventasPorCodigo = new Map<string, number>();
  for (const item of ventasResult.items) {
    const code = normalizeCode(item.product_code);
    if (!code) continue;
    ventasPorCodigo.set(code, (ventasPorCodigo.get(code) ?? 0) + (Number(item.quantity) || 0));
  }

  const filas: ConsumoPorPlatoRow[] = [];

  for (const [code, venta] of ventasPorCodigo.entries()) {
    if (duplicados.has(code)) continue;
    const matches = codigoMap.get(code);
    if (!matches?.length) continue;

    const plato = matches[0];
    const ingredientes = plato.carta_ingredientes ?? [];
    if (!ingredientes.length) continue;

    for (const ing of ingredientes) {
      const cantidad = Number(ing.cantidad);
      if (!ing.nombre || !Number.isFinite(cantidad) || cantidad <= 0) continue;

      filas.push({
        categoria: plato.categoria,
        id: plato.cod_softland,
        id_toteat: plato.codigo_toteat as string,
        plato: plato.nombre,
        producto: ing.nombre,
        id_producto: ing.codigo_producto,
        cantidad: formatNumber(cantidad),
        venta: formatNumber(venta),
        total_consumido: formatNumber(cantidad * venta),
      });
    }
  }

  filas.sort((a, b) => a.plato.localeCompare(b.plato, 'es') || a.producto.localeCompare(b.producto, 'es'));

  return filas;
}

function buildWorkbook(filas: ConsumoPorPlatoRow[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Consumo por plato');

  ws.columns = [
    { header: 'CATEGORIA', key: 'categoria', width: 20 },
    { header: 'ID', key: 'id', width: 12 },
    { header: 'ID TOTEAT', key: 'id_toteat', width: 14 },
    { header: 'PLATO', key: 'plato', width: 38 },
    { header: 'PRODUCTOS', key: 'producto', width: 34 },
    { header: 'ID PRODUCTO', key: 'id_producto', width: 14 },
    { header: 'CANTIDAD', key: 'cantidad', width: 12 },
    { header: 'VENTA', key: 'venta', width: 10 },
    { header: 'TOTAL CONSUMIDO', key: 'total_consumido', width: 18 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: 'A1', to: 'I1' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Códigos alfanuméricos / con ceros iniciales deben tratarse como texto.
  ws.getColumn('id').numFmt = '@';
  ws.getColumn('id_toteat').numFmt = '@';
  ws.getColumn('id_producto').numFmt = '@';

  for (const fila of filas) {
    ws.addRow({
      categoria: fila.categoria,
      id: fila.id ?? '',
      id_toteat: fila.id_toteat,
      plato: fila.plato,
      producto: fila.producto,
      id_producto: fila.id_producto ?? '',
      cantidad: fila.cantidad,
      venta: fila.venta,
      total_consumido: fila.total_consumido,
    });
  }

  return wb;
}

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  if (!isIsoDate(desde) || !isIsoDate(hasta)) {
    return NextResponse.json({ error: 'Debes enviar desde y hasta en formato YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const filas = await calcularConsumoPorPlato(desde, hasta);
    const wb = buildWorkbook(filas);
    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="consumo_ingredientes_por_plato_${fechaHoyChile()}.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error generando consumo por plato' }, { status: 500 });
  }
}
