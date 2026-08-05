import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { calcularResumenFilas } from '@/lib/carnicos-resumen.server';
import { formatFechaCompacta } from '@/lib/config-carnicos';

const ESTADO_LABEL: Record<string, string> = { ok: 'OK', alerta: 'Alerta', sin_conteo: 'Sin conteo final' };
const ROJO = 'FFB91C1C';
const ROJO_FONDO = 'FFFEE2E2';

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
};

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// GET /api/control-carnicos/resumen/reporte?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Todas las columnas de la Tabla Resumen, solo para el rango de fecha filtrado. Estado "Alerta"
// se destaca en rojo y la columna Diferencia sale con letra roja.
export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'bodega']);
  if (!s.ok) return s.response;

  const { searchParams } = new URL(req.url);
  const fechaUnica = searchParams.get('fecha');
  const desde = searchParams.get('desde') ?? fechaUnica;
  const hasta = searchParams.get('hasta') ?? fechaUnica;
  if (!isIsoDate(desde) || !isIsoDate(hasta)) return NextResponse.json({ error: 'Debes enviar desde y hasta en formato YYYY-MM-DD' }, { status: 400 });
  if (desde > hasta) return NextResponse.json({ error: 'La fecha "desde" no puede ser posterior a "hasta"' }, { status: 400 });

  const supabase = await createClient();

  let filas;
  try {
    filas = await calcularResumenFilas(supabase, desde, hasta);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error generando el reporte' }, { status: 500 });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('REPORTE', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });

  ws.columns = [
    { header: 'Producto', key: 'producto', width: 32 },
    { header: 'Inv. Inicial', key: 'inv_inicial', width: 12 },
    { header: 'Ingresos', key: 'ingresos', width: 10 },
    { header: 'Ventas', key: 'ventas', width: 10 },
    { header: 'Produccion', key: 'produccion', width: 11 },
    { header: 'Mermas', key: 'mermas', width: 10 },
    { header: 'Colacion', key: 'colacion', width: 10 },
    { header: 'Calculo', key: 'calculo', width: 10 },
    { header: 'Inv. Final', key: 'inv_final', width: 10 },
    { header: 'Diferencia', key: 'diferencia', width: 11 },
    { header: 'Estado', key: 'estado', width: 16 },
  ];

  for (const f of filas) {
    const row = ws.addRow({
      producto: f.producto_nombre,
      inv_inicial: f.inv_inicial,
      ingresos: f.ingresos,
      ventas: f.ventas,
      produccion: f.produccion,
      mermas: f.mermas,
      colacion: f.colacion,
      calculo: f.calculo,
      inv_final: f.inv_final,
      diferencia: f.diferencia,
      estado: ESTADO_LABEL[f.estado] ?? f.estado,
    });

    // Diferencia: roja para cualquier valor distinto de 0 (positivo o negativo); el 0 queda en negro normal.
    if (f.diferencia !== null && Math.abs(f.diferencia) > 0.0001) {
      row.getCell('diferencia').font = { color: { argb: ROJO } };
    }

    if (f.estado === 'alerta') {
      const estadoCell = row.getCell('estado');
      estadoCell.font = { bold: true, color: { argb: ROJO } };
      estadoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO_FONDO } };
    }
  }

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.eachCell({ includeEmpty: true }, cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  });

  ws.eachRow(row => {
    row.eachCell({ includeEmpty: true }, cell => { cell.border = THIN_BORDER; });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const filename = desde === hasta
    ? `Reporte_${formatFechaCompacta(desde)}.xlsx`
    : `Reporte_${formatFechaCompacta(desde)}_${formatFechaCompacta(hasta)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
