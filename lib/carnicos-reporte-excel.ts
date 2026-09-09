import ExcelJS from 'exceljs';
import type { ResumenFila } from '@/types/carnicos';

const ESTADO_LABEL: Record<string, string> = { ok: 'OK', alerta: 'ALERTA', sin_conteo: 'Sin conteo final' };

// Verde para OK, rojo para ALERTA (fondo + texto). sin_conteo queda neutro.
const VERDE_TX = 'FF166534';
const VERDE_FONDO = 'FFDCFCE7';
const ROJO_TX = 'FFB91C1C';
const ROJO_FONDO = 'FFFEE2E2';

// Formatos de celda (NO texto): los numeros siguen siendo numeros y las formulas recalculan.
export const FMT_MILLARES_1 = '#,##0.0';
export const FMT_CONTABILIDAD_1 = '_-"$" * #,##0.0_-;-"$" * #,##0.0_-;_-"$" * "-"??_-;_-@_-';

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
};

/**
 * Construye el workbook del Excel Reporte de Control Carnicos.
 * - CALCULO lleva la formula real de Excel: inv. inicial + ingresos - (ventas + produccion + mermas + colacion).
 * - DIFERENCIA depende por formula de INV. FINAL y CALCULO (inv_final - calculo).
 * - DIFERENCIA $ (si verCostos) = DIFERENCIA * COSTO UNIT.
 * Asi, al editar a mano cualquier cantidad en Excel, CALCULO y DIFERENCIA se recalculan solos.
 */
export function construirReporteWorkbook(filas: ResumenFila[], verCostos: boolean): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('REPORTE', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });

  ws.columns = [
    { header: 'Producto', key: 'producto', width: 32 },            // A
    { header: 'Inv. Inicial', key: 'inv_inicial', width: 12 },     // B
    { header: 'Ingresos', key: 'ingresos', width: 10 },            // C
    { header: 'Ventas', key: 'ventas', width: 10 },                // D
    { header: 'Produccion', key: 'produccion', width: 11 },        // E
    { header: 'Mermas', key: 'mermas', width: 10 },                // F
    { header: 'Colacion', key: 'colacion', width: 10 },            // G
    { header: 'Calculo', key: 'calculo', width: 12 },              // H  (formula)
    { header: 'Inv. Final', key: 'inv_final', width: 10 },         // I
    { header: 'Diferencia', key: 'diferencia', width: 13 },        // J  (formula, contabilidad)
    ...(verCostos ? [
      { header: 'Costo Unit.', key: 'costo_unitario', width: 13 }, // K
      { header: 'Diferencia $', key: 'diferencia_valor', width: 15 }, // L (formula, contabilidad)
    ] : []),
    { header: 'Estado', key: 'estado', width: 16 },                // K / M
  ];

  const COLS_MILLARES = ['inv_inicial', 'ingresos', 'ventas', 'produccion', 'mermas', 'colacion', 'calculo', 'inv_final'];
  const L = (key: string) => ws.getColumn(key).letter;

  filas.forEach((f, idx) => {
    const n = idx + 2;

    const row = ws.addRow({
      producto: f.producto_nombre,
      inv_inicial: f.inv_inicial,
      ingresos: f.ingresos,
      ventas: f.ventas,
      produccion: f.produccion,
      mermas: f.mermas,
      colacion: f.colacion,
      inv_final: f.inv_final,
      ...(verCostos ? { costo_unitario: f.costo_unitario } : {}),
      estado: ESTADO_LABEL[f.estado] ?? f.estado,
    });

    row.getCell('calculo').value = {
      formula: `${L('inv_inicial')}${n}+${L('ingresos')}${n}-(${L('ventas')}${n}+${L('produccion')}${n}+${L('mermas')}${n}+${L('colacion')}${n})`,
      result: f.calculo,
    };

    if (f.diferencia !== null) {
      row.getCell('diferencia').value = {
        formula: `${L('inv_final')}${n}-${L('calculo')}${n}`,
        result: f.diferencia,
      };
      if (verCostos) {
        row.getCell('diferencia_valor').value = {
          formula: `${L('diferencia')}${n}*${L('costo_unitario')}${n}`,
          result: f.diferencia_valor ?? 0,
        };
      }
    }

    for (const key of COLS_MILLARES) row.getCell(key).numFmt = FMT_MILLARES_1;
    row.getCell('diferencia').numFmt = FMT_CONTABILIDAD_1;
    if (verCostos) {
      row.getCell('costo_unitario').numFmt = FMT_CONTABILIDAD_1;
      row.getCell('diferencia_valor').numFmt = FMT_CONTABILIDAD_1;
    }

    const estadoCell = row.getCell('estado');
    if (f.estado === 'ok') {
      estadoCell.font = { bold: true, color: { argb: VERDE_TX } };
      estadoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_FONDO } };
    } else if (f.estado === 'alerta') {
      estadoCell.font = { bold: true, color: { argb: ROJO_TX } };
      estadoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO_FONDO } };
      row.getCell('diferencia').font = { color: { argb: ROJO_TX } };
      if (verCostos) row.getCell('diferencia_valor').font = { color: { argb: ROJO_TX } };
    }
  });

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.eachCell({ includeEmpty: true }, cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  });

  ws.eachRow(row => {
    row.eachCell({ includeEmpty: true }, cell => { cell.border = THIN_BORDER; });
  });

  return wb;
}
