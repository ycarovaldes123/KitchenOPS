import ExcelJS from 'exceljs';
import type { ResumenFila } from '@/types/carnicos';

const ESTADO_LABEL: Record<string, string> = { ok: 'OK', alerta: 'ALERTA', sin_conteo: 'Sin conteo final' };

// Verde para OK, rojo para ALERTA (fondo + texto). sin_conteo queda neutro.
const VERDE_TX = 'FF166534';
const VERDE_FONDO = 'FFDCFCE7';
const ROJO_TX = 'FFB91C1C';
const ROJO_FONDO = 'FFFEE2E2';
// Encabezados y columna Producto: "Aguamarina, Enfasis 5, oscuro 25%" con fuente blanca.
const AGUAMARINA_OSCURO = 'FF31869B';
const BLANCO = 'FFFFFFFF';
// Fuente de todo el reporte: Aptos Narrow 12 (nombre + tamano completos en cada celda).
const FUENTE_BASE = { name: 'Aptos Narrow', size: 12 } as const;

// Formatos de celda (NO texto): los numeros siguen siendo numeros y las formulas recalculan.
export const FMT_MILLARES_1 = '#,##0.0';
// Estilo "Millares" de Excel (alineado, guion en ceros) con 1 decimal, para columnas B a I.
export const FMT_ESTILO_MILLARES_1 = '_-* #,##0.0_-;-* #,##0.0_-;_-* "-"??_-;_-@_-';
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
    // Fila de encabezados inmovilizada y zoom 115%.
    views: [{ state: 'frozen', ySplit: 1, zoomScale: 115, zoomScaleNormal: 115 }],
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
    { header: 'Diferencia', key: 'diferencia', width: 13 },        // J  (formula, numero)
    ...(verCostos ? [
      { header: 'Costo Unit.', key: 'costo_unitario', width: 13 }, // K
      { header: 'Diferencia $', key: 'diferencia_valor', width: 15 }, // L (formula, contabilidad)
    ] : []),
    { header: 'Estado', key: 'estado', width: 16 },                // K / M
    { header: 'Observaciones', key: 'observaciones', width: 44.71 }, // L / N (318 px)
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

    for (const key of COLS_MILLARES) row.getCell(key).numFmt = FMT_ESTILO_MILLARES_1;
    row.getCell('diferencia').numFmt = FMT_MILLARES_1;
    // Diferencia y Diferencia $ en negrita (el color lo pone el condicional / el estado).
    row.getCell('diferencia').font = { ...FUENTE_BASE, bold: true };
    if (verCostos) row.getCell('diferencia_valor').font = { ...FUENTE_BASE, bold: true };
    if (verCostos) {
      row.getCell('costo_unitario').numFmt = FMT_CONTABILIDAD_1;
      row.getCell('diferencia_valor').numFmt = FMT_CONTABILIDAD_1;
    }

    const estadoCell = row.getCell('estado');
    if (f.estado === 'ok') {
      estadoCell.font = { ...FUENTE_BASE, bold: true, color: { argb: VERDE_TX } };
      estadoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_FONDO } };
    } else if (f.estado === 'alerta') {
      estadoCell.font = { ...FUENTE_BASE, bold: true, color: { argb: ROJO_TX } };
      estadoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO_FONDO } };
      if (verCostos) row.getCell('diferencia_valor').font = { ...FUENTE_BASE, bold: true, color: { argb: ROJO_TX } };
    }
  });

  const ultimaFila = filas.length + 1;
  const totalColumnas = ws.columns.length;

  // Diferencia: con condicional, si el Estado de la fila es ALERTA queda igual que el Estado
  // (fondo rojo + fuente roja); si es 0,0 y OK, verde. Es formato condicional, asi que sigue al Estado si se edita.
  if (filas.length) {
    const colDif = L('diferencia');
    ws.addConditionalFormatting({
      ref: `${colDif}2:${colDif}${ultimaFila}`,
      rules: [{
        type: 'expression', priority: 1,
        formulae: [`$${L('estado')}2="${ESTADO_LABEL.alerta}"`],
        style: {
          font: { color: { argb: ROJO_TX } },
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: ROJO_FONDO } },
        },
      }, {
        // Diferencia 0,0 con Estado OK: verde como el Estado (fondo + fuente).
        type: 'expression', priority: 2,
        formulae: [`AND(ROUND(${colDif}2,1)=0,$${L('estado')}2="${ESTADO_LABEL.ok}")`],
        style: {
          font: { color: { argb: VERDE_TX } },
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: VERDE_FONDO } },
        },
      }],
    });
  }

  // Total de Diferencia $ al final de la columna (SUBTOTALES respeta los filtros).
  if (verCostos && filas.length) {
    const colValor = L('diferencia_valor');
    const total = filas.reduce((acc, f) => acc + (f.diferencia_valor ?? 0), 0);
    const cell = ws.getCell(`${colValor}${ultimaFila + 1}`);
    cell.value = { formula: `SUBTOTAL(9,${colValor}2:${colValor}${ultimaFila})`, result: total };
    cell.numFmt = FMT_CONTABILIDAD_1;
    cell.font = { ...FUENTE_BASE, bold: true };
    cell.border = THIN_BORDER;
  }

  // Encabezados: aguamarina oscuro, fuente blanca en negrita.
  const headerRow = ws.getRow(1);
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  for (let c = 1; c <= totalColumnas; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { ...FUENTE_BASE, bold: true, color: { argb: BLANCO } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AGUAMARINA_OSCURO } };
  }

  // Columna A (Producto): mismo color y fuente que los encabezados.
  for (let n = 2; n <= ultimaFila; n++) {
    const cell = ws.getCell(`A${n}`);
    cell.font = { ...FUENTE_BASE, bold: true, color: { argb: BLANCO } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AGUAMARINA_OSCURO } };
  }

  // Bordes en toda la tabla, incluida la columna Observaciones (vacia).
  for (let n = 1; n <= ultimaFila; n++) {
    const row = ws.getRow(n);
    for (let c = 1; c <= totalColumnas; c++) row.getCell(c).border = THIN_BORDER;
  }

  // Aptos Narrow en todo el Excel (incluye fila de total y celdas vacias como Observaciones),
  // conservando negrita y color de cada celda.
  for (let n = 1; n <= ultimaFila + 1; n++) {
    const row = ws.getRow(n);
    for (let c = 1; c <= totalColumnas; c++) {
      const cell = row.getCell(c);
      cell.font = { ...cell.font, ...FUENTE_BASE };
    }
  }

  return wb;
}
