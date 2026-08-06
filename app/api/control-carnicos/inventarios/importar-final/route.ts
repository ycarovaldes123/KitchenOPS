import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { BODEGAS_CARNICOS, BODEGA_LABEL } from '@/lib/config-carnicos';

const BODEGAS_CONTEO = ['CAMARA CONGELADOS', 'CAMARA MANTENCION', 'COCINA'] as const;

function norm(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function cellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value && typeof value === 'object' && 'text' in value) return String(value.text ?? '');
  if (value && typeof value === 'object' && 'richText' in value) {
    return (value.richText as { text: string }[]).map(part => part.text).join('');
  }
  return String(value ?? '');
}

function numberValue(cell: ExcelJS.Cell): number | null {
  const value = cell.value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value && typeof value === 'object' && 'result' in value) {
    const result = Number(value.result);
    return Number.isFinite(result) ? result : null;
  }
  const parsed = Number(String(value ?? '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'bodega']);
  if (!s.ok) return s.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Debes subir un archivo Excel' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el Excel. Usa el formato descargado desde Tabla resumen.' }, { status: 400 });
  }

  const ws = wb.getWorksheet('CONTEO') ?? wb.worksheets[0];
  if (!ws) return NextResponse.json({ error: 'El Excel no contiene hojas' }, { status: 400 });

  let headerRowNumber = 0;
  const headers = new Map<string, number>();
  ws.eachRow((row, rowNumber) => {
    if (headerRowNumber) return;
    const local = new Map<string, number>();
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const text = norm(cellText(cell));
      if (text) local.set(text, colNumber);
    });
    if (local.has('CODIGO') && local.has('PRODUCTO') && BODEGAS_CONTEO.every(b => local.has(norm(b)))) {
      headerRowNumber = rowNumber;
      local.forEach((value, key) => headers.set(key, value));
    }
  });

  if (!headerRowNumber) {
    return NextResponse.json({ error: 'Formato invalido. No se encontraron las columnas CODIGO, PRODUCTO y bodegas del formato de Tabla resumen.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: productos, error } = await supabase
    .from('carnicos_productos')
    .select('id,codigo,nombre,unidad_medida')
    .eq('activo', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const porCodigo = new Map((productos ?? []).map(p => [norm(p.codigo), p]));
  const porNombre = new Map((productos ?? []).map(p => [norm(p.nombre), p]));
  const colCodigo = headers.get('CODIGO')!;
  const colProducto = headers.get('PRODUCTO')!;
  const colBodega = new Map(BODEGAS_CONTEO.map(b => [b, headers.get(norm(b))!]));
  const lotes = new Map<string, { producto_id: string; producto_nombre: string; unidad_medida: string; cantidad: number }[]>();
  const errores: string[] = [];

  for (let rowNumber = headerRowNumber + 1; rowNumber <= ws.rowCount; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const codigo = norm(cellText(row.getCell(colCodigo)));
    const nombre = norm(cellText(row.getCell(colProducto)));
    if (!codigo && !nombre) continue;

    const producto = (codigo ? porCodigo.get(codigo) : null) ?? (nombre ? porNombre.get(nombre) : null);
    if (!producto) {
      errores.push(`Fila ${rowNumber}: producto no encontrado (${codigo || nombre}).`);
      continue;
    }

    for (const bodega of BODEGAS_CONTEO) {
      if (!BODEGAS_CARNICOS.includes(bodega)) continue;
      const cantidad = numberValue(row.getCell(colBodega.get(bodega)!));
      if (cantidad == null || cantidad < 0) continue;
      const detalle = lotes.get(bodega) ?? [];
      detalle.push({
        producto_id: producto.id,
        producto_nombre: producto.nombre,
        unidad_medida: producto.unidad_medida,
        cantidad,
      });
      lotes.set(bodega, detalle);
    }
  }

  const lotesOut = Array.from(lotes.entries())
    .filter(([, detalle]) => detalle.length > 0)
    .map(([bodega, detalle]) => ({ bodega, bodegaLabel: BODEGA_LABEL[bodega as keyof typeof BODEGA_LABEL] ?? bodega, detalle }));

  if (!lotesOut.length) {
    return NextResponse.json({ error: 'No se encontraron conteos validos por bodega en el archivo.', errores }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    lotes: lotesOut,
    total: lotesOut.reduce((sum, lote) => sum + lote.detalle.length, 0),
    errores,
  });
}
