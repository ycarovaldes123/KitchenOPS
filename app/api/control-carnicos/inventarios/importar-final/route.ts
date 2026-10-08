import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { BODEGAS_CARNICOS, BODEGA_LABEL } from '@/lib/config-carnicos';

const BODEGAS_CONTEO = ['CAMARA CONGELADOS', 'CAMARA MANTENCION', 'COCINA'] as const;
const FALLBACK_COL_PRODUCTO = 3; // C
const FALLBACK_COL_BODEGAS: Record<(typeof BODEGAS_CONTEO)[number], number> = {
  'CAMARA CONGELADOS': 5, // E
  'CAMARA MANTENCION': 6, // F
  COCINA: 7, // G
};
const PRODUCTO_HEADERS = ['PRODUCTO', 'NOMBRE PRODUCTO', 'NOMBRE', 'PRODUCTOS', 'DESCRIPCION'];
const BODEGA_HEADERS: Record<(typeof BODEGAS_CONTEO)[number], string[]> = {
  'CAMARA CONGELADOS': ['CAMARA CONGELADOS', 'CAMARA CONGELADO', 'CONGELADOS'],
  'CAMARA MANTENCION': ['CAMARA MANTENCION', 'CAMARA DE MANTENCION', 'MANTENCION'],
  COCINA: ['COCINA'],
};
const PRODUCTO_HEADERS_NORMALIZADOS = PRODUCTO_HEADERS.map(norm);
const PRODUCTO_ALIASES: Record<string, string> = {
  [norm('PP SALMON TROZO GR (250')]: norm('PP SALMON TROZO GR (250)'),
  [norm('PP SALMON CEVICHE GR')]: norm('PP SALMON CEVICHE (GR)'),
  // Renombrados 2026-10-08: planillas de conteo con el nombre anterior siguen importando
  [norm('ESCALOPA DE VACUNO (UND) 120gr c/u')]: norm('ESCALOPA DE VACUNO (UND) 150GR c/u'),
  [norm('ESCALOPA DE VACUNO DE ASIENTO (150 GR) (UND)')]: norm('ESCALOPA DE VACUNO (UND) 150GR c/u'),
  [norm('PUNTA PALETA')]: norm('PUNTA PALETA (KG)'),
  [norm('PP BASTONES DE POLLO GRS (120 GR)')]: norm('PP BASTONES DE POLLO GRS (200 GR)'),
  [norm('PP SORRENTINOS DE SALMON AHUMADO PORC')]: norm('PP SORRENTINOS'),
};

type ProductoCarnicoDb = {
  id: string;
  codigo: string;
  nombre: string;
  unidad_medida: string;
};

type ConteoCell =
  | { kind: 'empty' }
  | { kind: 'number'; value: number }
  | { kind: 'invalid'; raw: string };

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

function numberValue(cell: ExcelJS.Cell): ConteoCell {
  const value = cell.value;
  if (value == null) return { kind: 'empty' };
  if (typeof value === 'number') return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'invalid', raw: String(value) };
  if (value && typeof value === 'object' && 'result' in value) {
    if (value.result == null || String(value.result).trim() === '') return { kind: 'empty' };
    const result = Number(String(value.result).replace(',', '.').trim());
    return Number.isFinite(result) ? { kind: 'number', value: result } : { kind: 'invalid', raw: String(value.result) };
  }
  const raw = String(value).replace(',', '.').trim();
  if (!raw) return { kind: 'empty' };
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? { kind: 'number', value: parsed } : { kind: 'invalid', raw };
}

function findHeader(headers: Map<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const col = headers.get(norm(alias));
    if (col) return col;
  }
  return null;
}

function pushProducto(productosPorNombre: Map<string, ProductoCarnicoDb[]>, producto: ProductoCarnicoDb) {
  const key = norm(producto.nombre);
  const existentes = productosPorNombre.get(key) ?? [];
  existentes.push(producto);
  productosPorNombre.set(key, existentes);
}

function normalizarNombreProducto(value: unknown) {
  const normalizado = norm(value);
  return PRODUCTO_ALIASES[normalizado] ?? normalizado;
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
    const tieneProducto = findHeader(local, PRODUCTO_HEADERS) != null;
    const tieneBodegas = BODEGAS_CONTEO.every(b => findHeader(local, BODEGA_HEADERS[b]) != null);
    if (tieneProducto && tieneBodegas) {
      headerRowNumber = rowNumber;
      local.forEach((value, key) => headers.set(key, value));
    }
  });

  const supabase = await createClient();
  const { data: productos, error } = await supabase
    .from('carnicos_productos')
    .select('id,codigo,nombre,unidad_medida')
    .eq('activo', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const productosPorNombre = new Map<string, ProductoCarnicoDb[]>();
  for (const producto of (productos ?? []) as ProductoCarnicoDb[]) pushProducto(productosPorNombre, producto);

  const colProducto = headerRowNumber ? findHeader(headers, PRODUCTO_HEADERS) ?? FALLBACK_COL_PRODUCTO : FALLBACK_COL_PRODUCTO;
  const colBodega = new Map(BODEGAS_CONTEO.map(b => [
    b,
    headerRowNumber ? findHeader(headers, BODEGA_HEADERS[b]) ?? FALLBACK_COL_BODEGAS[b] : FALLBACK_COL_BODEGAS[b],
  ]));
  const dataStartRow = headerRowNumber ? headerRowNumber + 1 : 1;
  const lotes = new Map<string, { producto_id: string; producto_nombre: string; unidad_medida: string; cantidad: number }[]>();
  const clavesVistas = new Set<string>();
  const errores: string[] = [];

  for (let rowNumber = dataStartRow; rowNumber <= ws.rowCount; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const nombreRaw = cellText(row.getCell(colProducto));
    const nombre = normalizarNombreProducto(nombreRaw);
    const conteos = BODEGAS_CONTEO.map(bodega => [bodega, numberValue(row.getCell(colBodega.get(bodega)!))] as const);
    const tieneConteo = conteos.some(([, conteo]) => conteo.kind !== 'empty');
    if (!nombre && !tieneConteo) continue;
    if (PRODUCTO_HEADERS_NORMALIZADOS.includes(nombre)) continue;
    if (!tieneConteo) continue;
    if (!nombre) {
      errores.push(`Fila ${rowNumber}: conteo sin nombre de producto.`);
      continue;
    }

    const candidatos = productosPorNombre.get(nombre) ?? [];
    if (candidatos.length === 0) {
      errores.push(`Fila ${rowNumber}: producto no encontrado (${nombreRaw.trim()}).`);
      continue;
    }
    if (candidatos.length > 1) {
      errores.push(`Fila ${rowNumber}: el nombre "${nombreRaw.trim()}" coincide con mas de un producto del maestro. Corrige el nombre antes de importar.`);
      continue;
    }
    const producto = candidatos[0];

    for (const [bodega, conteo] of conteos) {
      if (!BODEGAS_CARNICOS.includes(bodega)) continue;
      if (conteo.kind === 'empty') continue;
      if (conteo.kind === 'invalid' || conteo.value < 0) {
        errores.push(`Fila ${rowNumber}: conteo invalido en ${BODEGA_LABEL[bodega]} (${conteo.kind === 'invalid' ? conteo.raw : conteo.value}).`);
        continue;
      }
      const key = `${bodega}||${producto.id}`;
      if (clavesVistas.has(key)) {
        errores.push(`Fila ${rowNumber}: producto duplicado en ${BODEGA_LABEL[bodega]} (${producto.codigo} - ${producto.nombre}).`);
        continue;
      }
      clavesVistas.add(key);
      const detalle = lotes.get(bodega) ?? [];
      detalle.push({
        producto_id: producto.id,
        producto_nombre: producto.nombre,
        unidad_medida: producto.unidad_medida,
        cantidad: conteo.value,
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

  if (errores.length > 0) {
    return NextResponse.json({
      error: `El archivo tiene ${errores.length} error(es). Corrige los productos duplicados o inexistentes antes de guardar.`,
      errores,
      lotes: lotesOut,
      total: lotesOut.reduce((sum, lote) => sum + lote.detalle.length, 0),
    }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    lotes: lotesOut,
    total: lotesOut.reduce((sum, lote) => sum + lote.detalle.length, 0),
    errores,
  });
}
