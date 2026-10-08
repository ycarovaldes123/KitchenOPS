import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { evaluarFormulaAritmetica } from '@/lib/formula-aritmetica';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';

const COL_CODIGO = 1;
const COL_NOMBRE = 2;
const COL_UNIDAD = 3;
const COL_CONTEO = 4; // D

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
  if (value && typeof value === 'object' && 'formula' in value) {
    const formulaValue = value as { formula: string; result?: unknown };
    return formulaValue.result != null ? String(formulaValue.result) : '';
  }
  return String(value ?? '');
}

function cellNumberStatus(cell: ExcelJS.Cell) {
  const raw = cell.value;
  if (raw === null || raw === undefined) {
    return { cantidad: null as number | null, vacia: true, error: null as string | null };
  }

  let parsed: number | null;
  if (typeof raw === 'number') {
    parsed = raw;
  } else if (typeof raw === 'object' && 'formula' in raw) {
    const formulaValue = raw as { formula: string; result?: unknown };
    const resultText = formulaValue.result != null ? String(formulaValue.result).trim() : '';
    const resultParsed = resultText !== '' ? Number(resultText.replace(',', '.')) : NaN;
    if (Number.isFinite(resultParsed)) {
      parsed = resultParsed;
    } else {
      const evaluado = evaluarFormulaAritmetica(formulaValue.formula);
      parsed = evaluado === null ? null : Math.round(evaluado * 1e6) / 1e6;
    }
  } else {
    const text = cellText(cell).trim();
    if (text === '') return { cantidad: null as number | null, vacia: true, error: null as string | null };
    parsed = Number(text.replace(',', '.'));
  }

  if (parsed === null || !Number.isFinite(parsed)) {
    return { cantidad: null as number | null, vacia: false, error: 'Cantidad no numerica' };
  }
  if (parsed < 0) {
    return { cantidad: null as number | null, vacia: false, error: 'Cantidad negativa' };
  }
  if (parsed === 0) {
    // 0 se trata igual que vacio: no fue contado por el usuario, no se toma.
    return { cantidad: null as number | null, vacia: true, error: null as string | null };
  }
  return { cantidad: parsed, vacia: false, error: null as string | null };
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'cocina', 'economo']);
  if (!s.ok) return s.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Debes subir un archivo Excel' }, { status: 400 });
  }

  const wb = new ExcelJS.Workbook();
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el Excel. Usa el archivo generado desde Maestro > Productos > Conteo.' }, { status: 400 });
  }

  const ws = wb.getWorksheet('Conteo') ?? wb.worksheets[0];
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
    if (local.has('CODIGO') && local.has('NOMBRE') && local.has('UNIDAD') && local.has('CONTEO')) {
      headerRowNumber = rowNumber;
      local.forEach((value, key) => headers.set(key, value));
    }
  });

  if (!headerRowNumber) {
    return NextResponse.json({ error: 'Formato invalido. Debe incluir las columnas Código, Nombre, Unidad y Conteo.' }, { status: 400 });
  }

  if (headers.get('CONTEO') !== COL_CONTEO) {
    return NextResponse.json({ error: 'Formato invalido. La columna D debe ser Conteo.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: productos, error } = await supabase
    .from('productos')
    .select('codigo,nombre,unidad_medida')
    .neq('activo', false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const productosPorCodigo = new Map((productos ?? []).map(producto => [String(producto.codigo).trim(), producto]));
  const codigosVistos = new Set<string>();
  const codigosDuplicados = new Set<string>();
  const rows: {
    codigo: string;
    producto: string;
    unidad: string;
    cantidad: number | null;
    estado: 'OK' | 'ERROR';
    mensaje: string;
  }[] = [];

  for (let rowNumber = headerRowNumber + 1; rowNumber <= ws.rowCount; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const cantidadStatus = cellNumberStatus(row.getCell(COL_CONTEO));
    if (cantidadStatus.vacia) continue;

    const codigo = cellText(row.getCell(COL_CODIGO)).trim();
    const producto = productosPorCodigo.get(codigo);
    let mensaje = '';

    if (!codigo) mensaje = 'Codigo vacio';
    if (codigosVistos.has(codigo)) {
      codigosDuplicados.add(codigo);
      mensaje = mensaje || 'Codigo duplicado';
    } else {
      codigosVistos.add(codigo);
    }
    if (!producto) mensaje = mensaje || 'Codigo inexistente';
    if (cantidadStatus.error) mensaje = mensaje || cantidadStatus.error;

    rows.push({
      codigo,
      producto: producto?.nombre ?? cellText(row.getCell(COL_NOMBRE)).trim(),
      unidad: producto?.unidad_medida ?? cellText(row.getCell(COL_UNIDAD)).trim(),
      cantidad: cantidadStatus.cantidad,
      estado: mensaje ? 'ERROR' : 'OK',
      mensaje: mensaje || 'OK',
    });
  }

  const rowsFinal = rows.map(row => (
    codigosDuplicados.has(row.codigo)
      ? { ...row, estado: 'ERROR' as const, mensaje: 'Codigo duplicado' }
      : row
  ));

  if (!rowsFinal.length) {
    return NextResponse.json({ error: 'No se encontraron productos con cantidades ingresadas para la camara seleccionada.' }, { status: 400 });
  }

  return NextResponse.json({
    ok: rowsFinal.every(row => row.estado === 'OK'),
    total: rowsFinal.length,
    validos: rowsFinal.filter(row => row.estado === 'OK').length,
    errores: rowsFinal.filter(row => row.estado !== 'OK').length,
    rows: rowsFinal,
  });
}
