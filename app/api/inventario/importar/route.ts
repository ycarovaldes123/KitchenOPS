import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';

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

function cellNumberStatus(cell: ExcelJS.Cell) {
  const raw = cell.value;
  const text = cellText(cell).trim();
  // Celda vacia (null/undefined/"" /solo espacios): el producto no fue contado en
  // esta camara/bodega. No es un error de validacion, la fila debe ignorarse.
  if (raw === null || raw === undefined || text === '') {
    return { cantidad: null as number | null, vacia: true, error: null as string | null };
  }
  const parsed = typeof raw === 'number' ? raw : Number(text.replace(',', '.'));
  if (!Number.isFinite(parsed)) {
    return { cantidad: null as number | null, vacia: false, error: 'Cantidad no numerica' };
  }
  if (parsed < 0) {
    return { cantidad: null as number | null, vacia: false, error: 'Cantidad negativa' };
  }
  // parsed puede ser 0: es un conteo valido (0 !== vacio), no se descarta.
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

  const colCodigo = headers.get('CODIGO')!;
  const colConteo = headers.get('CONTEO')!;

  for (let rowNumber = headerRowNumber + 1; rowNumber <= ws.rowCount; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const codigo = cellText(row.getCell(colCodigo)).trim();
    if (!codigo) continue;

    const cantidadStatus = cellNumberStatus(row.getCell(colConteo));
    // Producto no contado en esta camara/bodega: se excluye por completo, no entra
    // a la lista ni a las validaciones (codigo existente, duplicados, etc.).
    if (cantidadStatus.vacia) continue;

    const producto = productosPorCodigo.get(codigo);
    let mensaje = '';

    if (codigosVistos.has(codigo)) {
      codigosDuplicados.add(codigo);
      mensaje = 'Codigo duplicado';
    } else {
      codigosVistos.add(codigo);
    }
    if (!producto) mensaje = mensaje || 'Codigo inexistente';
    if (cantidadStatus.error) mensaje = mensaje || cantidadStatus.error;

    rows.push({
      codigo,
      producto: producto?.nombre ?? cellText(row.getCell(headers.get('NOMBRE')!)).trim(),
      unidad: producto?.unidad_medida ?? cellText(row.getCell(headers.get('UNIDAD')!)).trim(),
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
