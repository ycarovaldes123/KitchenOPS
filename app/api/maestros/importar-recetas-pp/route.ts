import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import * as XLSX from 'xlsx';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';

// POST /api/maestros/importar-recetas-pp
// Body: multipart/form-data with field "file" (xlsx)
// Reads PRODUCCION sheet from Recetas Torobayo Actualizadas.xlsx
// Upserts pp_recetas + pp_receta_ingredientes

interface RecetaRow {
  codigo_receta: string;
  codigo_pp: string | null;
  nombre: string;
  rendimiento: number;
  unidad_rendimiento: string;
  ingredientes: IngredienteRow[];
}

interface IngredienteRow {
  orden: number;
  codigo_ingrediente: string | null;
  nombre_ingrediente: string;
  cantidad: number;
  unidad_medida: string;
}

function extractRendUnit(jText: unknown): string {
  if (typeof jText !== 'string') return 'GR';
  const upper = jText.toUpperCase();
  if (upper.includes('RENDIMIENTO')) {
    const parts = upper.replace('RENDIMIENTO', '').trim().split(/\s+/);
    const unit = parts[0];
    if (['GR', 'PR', 'CC', 'KG'].includes(unit)) return unit;
  }
  return 'GR';
}

function codeToCodigoPP(code: string | null): string | null {
  if (!code) return null;
  if (code.startsWith('0501')) return '0502' + code.slice(4);
  return null;
}

function parseProduccionSheet(buffer: Buffer): RecetaRow[] {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets['PRODUCCION'];
  if (!ws) throw new Error('No se encontró la hoja PRODUCCION en el archivo');

  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null }) as (string | number | null)[][];

  const recetas: RecetaRow[] = [];
  const seenCodes = new Map<string, number>();
  let tablaCount = 0;

  let current: RecetaRow | null = null;
  let isFirstIngredient = false;
  let pendingRendimiento = 0;

  function finalise() {
    if (current && current.ingredientes.length > 0 && pendingRendimiento > 0) {
      current.rendimiento = pendingRendimiento;
      recetas.push(current);
    } else if (current && current.ingredientes.length > 0) {
      current.rendimiento = 1;
      recetas.push(current);
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    const colB = r[1];
    const colC = r[2];
    const colD = r[3];
    const colE = r[4];
    const colJ = r[9];

    if (colD === 'U/M') {
      finalise();

      const rawCode = colB ? String(colB).trim() : null;
      const nombre  = colC ? String(colC).trim() : '';
      const rendUnit = extractRendUnit(colJ);

      let codigo_receta: string;
      if (rawCode && rawCode.startsWith('0501')) {
        const seen = seenCodes.get(rawCode) ?? 0;
        seenCodes.set(rawCode, seen + 1);
        const suffix = seen === 0 ? '' : seen === 1 ? '-B' : seen === 2 ? '-C' : `-${seen + 1}`;
        codigo_receta = rawCode + suffix;
      } else {
        tablaCount++;
        codigo_receta = `TABLA-${String(tablaCount).padStart(3, '0')}`;
      }

      current = {
        codigo_receta,
        codigo_pp: codeToCodigoPP(rawCode),
        nombre,
        rendimiento: 1,
        unidad_rendimiento: rendUnit,
        ingredientes: [],
      };
      isFirstIngredient = true;
      pendingRendimiento = 0;
      continue;
    }

    if (current && colB && typeof colB === 'string' && colB.trim() && colD && colD !== 'U/M') {
      const codigo    = String(colB).trim();
      const nombre    = colC ? String(colC).trim() : '';
      const um        = colD ? String(colD).trim().toUpperCase().replace('UND', 'UN') : 'KG';
      const cantidad  = typeof colE === 'number' ? colE : parseFloat(String(colE ?? '0')) || 0;

      if (isFirstIngredient && typeof colJ === 'number' && colJ > 0) {
        pendingRendimiento = colJ;
      }
      isFirstIngredient = false;

      const orden = current.ingredientes.length + 1;
      current.ingredientes.push({
        orden,
        codigo_ingrediente: codigo.match(/^\d{7}$/) ? codigo : null,
        nombre_ingrediente: nombre,
        cantidad,
        unidad_medida: um,
      });
    }
  }

  finalise();
  return recetas;
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let recetas: RecetaRow[];
  try {
    recetas = parseProduccionSheet(buffer);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al leer el archivo' }, { status: 400 });
  }

  if (recetas.length === 0) {
    return NextResponse.json({ error: 'No se encontraron recetas en la hoja PRODUCCION' }, { status: 400 });
  }

  let importadas = 0;
  let actualizadas = 0;
  const errores: string[] = [];

  for (const receta of recetas) {
    const { data: existing } = await supabase
      .from('pp_recetas')
      .select('id')
      .eq('codigo_receta', receta.codigo_receta)
      .maybeSingle();

    const masterPayload = {
      codigo_receta:      receta.codigo_receta,
      codigo_pp:          receta.codigo_pp,
      nombre:             receta.nombre,
      rendimiento:        receta.rendimiento,
      unidad_rendimiento: receta.unidad_rendimiento,
      importado_at:       new Date().toISOString(),
      estado:             'PENDIENTE',
    };

    let recetaId: string;

    if (existing) {
      const { error } = await supabase
        .from('pp_recetas')
        .update(masterPayload)
        .eq('id', existing.id);
      if (error) { errores.push(`${receta.codigo_receta}: ${error.message}`); continue; }
      recetaId = existing.id;
      actualizadas++;
    } else {
      const { data, error } = await supabase
        .from('pp_recetas')
        .insert(masterPayload)
        .select('id')
        .single();
      if (error || !data) { errores.push(`${receta.codigo_receta}: ${error?.message ?? 'sin id'}`); continue; }
      recetaId = data.id;
      importadas++;
    }

    await supabase.from('pp_receta_ingredientes').delete().eq('pp_receta_id', recetaId);

    if (receta.ingredientes.length > 0) {
      const { error: ingErr } = await supabase.from('pp_receta_ingredientes').insert(
        receta.ingredientes.map(ing => ({
          pp_receta_id:       recetaId,
          orden:              ing.orden,
          codigo_ingrediente: ing.codigo_ingrediente,
          nombre_ingrediente: ing.nombre_ingrediente,
          cantidad:           ing.cantidad,
          unidad_medida:      ing.unidad_medida,
          sin_codigo:         !ing.codigo_ingrediente,
        }))
      );
      if (ingErr) errores.push(`${receta.codigo_receta} ingredientes: ${ingErr.message}`);
    }
  }

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'importar_recetas_pp',
    tabla:         'pp_recetas',
    datos_nuevos:  { importadas, actualizadas, total: recetas.length, archivo: file.name },
  });

  return NextResponse.json({
    total_recetas: recetas.length,
    importadas,
    actualizadas,
    errores: errores.slice(0, 20),
  });
}
