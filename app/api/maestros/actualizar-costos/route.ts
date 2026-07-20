import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import * as XLSX from 'xlsx';
import { recalcularCostosPP } from '@/lib/recalcular-pp';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';

// POST /api/maestros/actualizar-costos
// Body: multipart/form-data with field "file" (xlsx)
// Reads: Cod. Producto | Producto | Cod. U. Medida | Costo Unit.
// Updates: productos.costo_promedio where productos.codigo = Cod. Producto

function normalizeCodigo(value: unknown) {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'number'
    ? (Number.isInteger(value) ? value.toFixed(0) : String(value))
    : String(value);

  const cleaned = raw.trim().replace(/\.0+$/, '');
  return /^\d{1,6}$/.test(cleaned) ? cleaned.padStart(7, '0') : cleaned;
}

function parseCosto(value: unknown) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '')
    .trim()
    .replace(/\$/g, '')
    .replace(/\s/g, '');

  if (!text) return Number.NaN;
  const normalized = text.includes(',') && text.includes('.')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(',', '.');

  return Number.parseFloat(normalized);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb     = XLSX.read(buffer, { type: 'buffer' });
  const ws     = wb.Sheets[wb.SheetNames[0]];
  const rows   = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as unknown[][];

  interface FilaProducto { codigo: string; nombre: string; unidad_medida: string; costo: number; }
  const conCosto: FilaProducto[]  = [];
  const softlandSinCosto: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row          = rows[i] as (string | number | null | undefined)[];
    const codigo       = normalizeCodigo(row[0]);
    const nombre       = String(row[1] ?? '').trim();
    const unidad_medida = String(row[2] ?? '').trim().toUpperCase() || 'KG';
    const costo        = parseCosto(row[3]);
    if (!codigo) continue;
    if (!isNaN(costo) && costo > 0) {
      conCosto.push({ codigo, nombre, unidad_medida, costo });
    } else if (!isNaN(costo) && costo === 0) {
      // Softland envía 0 cuando el stock es 0 — conservar último costo conocido
      softlandSinCosto.push(nombre ? `${codigo} — ${nombre}` : codigo);
    }
  }

  if (conCosto.length === 0 && softlandSinCosto.length === 0) {
    return NextResponse.json({ error: 'No se encontraron datos válidos en el archivo' }, { status: 400 });
  }

  // Obtener códigos que ya existen en BD para separar updates de inserts
  const { data: existentes } = await supabase
    .from('productos')
    .select('codigo')
    .in('codigo', conCosto.map(f => f.codigo));

  const existenteSet = new Set((existentes ?? []).map(e => e.codigo));

  const paraActualizar = conCosto.filter(f => existenteSet.has(f.codigo));
  const paraInsertar   = conCosto.filter(f => !existenteSet.has(f.codigo));

  let actualizados  = 0;
  let insertados    = 0;
  const errores: string[] = [];

  for (const { codigo, nombre, unidad_medida, costo } of paraActualizar) {
    const { error } = await supabase
      .from('productos')
      .update({
        nombre: nombre.trim().toUpperCase(),
        unidad_medida,
        costo_promedio: costo,
        updated_at: new Date().toISOString(),
      })
      .eq('codigo', codigo);
    if (error) errores.push(`${codigo}: ${error.message}`);
    else actualizados++;
  }

  if (paraInsertar.length > 0) {
    const { error } = await supabase.from('productos').insert(
      paraInsertar.map(f => ({
        codigo:         f.codigo,
        nombre:         f.nombre,
        unidad_medida:  f.unidad_medida,
        costo_promedio: f.costo,
        activo:         true,
      }))
    );
    if (error) errores.push(`insert nuevos: ${error.message}`);
    else insertados = paraInsertar.length;
  }

  const ppResult = await recalcularCostosPP(supabase);

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'importar_costos_softland',
    tabla:         'productos',
    datos_nuevos:  { actualizados, insertados, pp_recalculadas: ppResult.recalculadas, archivo: file.name },
  });

  return NextResponse.json({
    total_en_planilla: conCosto.length + softlandSinCosto.length,
    actualizados,
    insertados,
    errores: errores.slice(0, 10),
    softland_sin_costo: softlandSinCosto.length,
    detalle_softland_sin_costo: softlandSinCosto.slice(0, 50),
    pp_recalculadas: ppResult.recalculadas,
    pp_errores: ppResult.errores.slice(0, 10),
  });
}
