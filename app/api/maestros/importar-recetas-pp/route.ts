import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import * as XLSX from 'xlsx';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';
import { normalizarNombreProducto } from '@/lib/nombre-producto';

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
  costo_pp: number;       // col K del Excel: costo por unidad de rendimiento
  costo_total_neto: number; // col H del Excel: costo neto total de la receta
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

function closeTo(a: number, b: number, tolerancePct = 0.03): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return false;
  return Math.abs(a - b) <= Math.max(1, Math.abs(b) * tolerancePct);
}

function resolveCostoPP(
  receta: RecetaRow,
  ppInfo?: { tipo_pp: string | null; gramos_por_pp: number | null }
): { costo: number; unidad: string; ajustado: boolean } {
  const costoColK = Number(receta.costo_pp) || 0;
  const costoTotal = Number(receta.costo_total_neto) || 0;
  const rendimiento = Number(receta.rendimiento) || 0;
  const unidadOriginal = receta.unidad_rendimiento || 'GR';

  if (costoColK > 0 && costoTotal > 0 && ppInfo?.tipo_pp === 'PORCION' && Number(ppInfo.gramos_por_pp) > 0) {
    const porciones = rendimiento / Number(ppInfo.gramos_por_pp);
    if (porciones > 0 && closeTo(costoColK * porciones, costoTotal)) {
      return { costo: costoColK, unidad: 'PR', ajustado: unidadOriginal !== 'PR' };
    }
  }

  const costoPorRendimiento = costoTotal > 0 && rendimiento > 0 ? costoTotal / rendimiento : 0;
  if (costoPorRendimiento > 0 && (!costoColK || !closeTo(costoColK * rendimiento, costoTotal))) {
    return { costo: costoPorRendimiento, unidad: unidadOriginal, ajustado: true };
  }

  return { costo: costoColK, unidad: unidadOriginal, ajustado: false };
}

function parseProduccionSheet(buffer: Buffer): RecetaRow[] {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets['PRODUCCION'];
  if (!ws) throw new Error('No se encontró la hoja PRODUCCION en el archivo');

  // Anclar la lectura en A1: si la columna A está vacía, !ref parte en B y todas las columnas se corren.
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  range.s.c = 0;
  range.s.r = 0;
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null, range }) as (string | number | null)[][];

  const recetas: RecetaRow[] = [];
  const seenCodes = new Map<string, number>();
  let tablaCount = 0;

  let current: RecetaRow | null = null;
  let isFirstIngredient = false;
  let pendingRendimiento = 0;
  let pendingCostoPP = 0;
  let pendingCostoTotalNeto = 0;

  function finalise() {
    if (current && current.ingredientes.length > 0) {
      if (pendingRendimiento > 0) current.rendimiento = pendingRendimiento;
      if (pendingCostoPP > 0) current.costo_pp = pendingCostoPP;
      if (pendingCostoTotalNeto > 0) current.costo_total_neto = pendingCostoTotalNeto;
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
    const colH = r[7];
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
        costo_pp: 0,
        costo_total_neto: 0,
        ingredientes: [],
      };
      isFirstIngredient = true;
      pendingRendimiento = 0;
      pendingCostoPP = 0;
      pendingCostoTotalNeto = 0;
      continue;
    }

    if (current && colB && typeof colB === 'string' && colB.trim() && colD && colD !== 'U/M') {
      const codigo    = String(colB).trim();
      const nombre    = colC ? String(colC).trim() : '';
      const um        = colD ? String(colD).trim().toUpperCase().replace('UND', 'UN') : 'KG';
      const cantidad  = typeof colE === 'number' ? colE : parseFloat(String(colE ?? '0')) || 0;

      if (isFirstIngredient) {
        if (typeof colJ === 'number' && colJ > 0) pendingRendimiento = colJ;
        if (typeof colH === 'number' && colH > 0) pendingCostoTotalNeto = colH;
        const colK = r[10];
        if (typeof colK === 'number' && colK > 0) pendingCostoPP = colK;
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
  let costosAjustados = 0;
  let productosUpsert = 0;
  const errores: string[] = [];

  const codigosPP = [...new Set(recetas.map(r => r.codigo_pp).filter(Boolean))] as string[];
  const { data: ppCostInfo, error: ppCostInfoErr } = codigosPP.length
    ? await supabase
        .from('pp')
        .select('codigo_producto,tipo_pp,gramos_por_pp')
        .in('codigo_producto', codigosPP)
    : { data: [], error: null };
  if (ppCostInfoErr) return NextResponse.json({ error: ppCostInfoErr.message }, { status: 500 });

  const ppInfoPorCodigo = new Map(
    (ppCostInfo ?? []).map(pp => [
      pp.codigo_producto as string,
      { tipo_pp: pp.tipo_pp as string | null, gramos_por_pp: pp.gramos_por_pp as number | null },
    ])
  );

  for (const receta of recetas) {
    const costoPP = resolveCostoPP(
      receta,
      receta.codigo_pp ? ppInfoPorCodigo.get(receta.codigo_pp) : undefined
    );
    if (costoPP.ajustado) costosAjustados++;

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
      unidad_rendimiento: costoPP.unidad,
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

    // Col K se usa solo si cuadra con el neto/rendimiento; algunos PP traen formulas manuales.
    if (costoPP.costo > 0) {
      await supabase.from('pp_recetas').update({
        costo_unitario_calculado: costoPP.costo,
        costo_total_calculado:    Math.round(receta.costo_total_neto > 0 ? receta.costo_total_neto : costoPP.costo * receta.rendimiento),
        estado:                   'ACTIVO',
        calculado_at:             new Date().toISOString(),
      }).eq('id', recetaId);

      if (receta.codigo_pp) {
        const { error: prodUpsertErr } = await supabase.from('productos').upsert({
          codigo:         receta.codigo_pp,
          nombre:         normalizarNombreProducto(receta.nombre),
          unidad_medida:  costoPP.unidad,
          costo_promedio: costoPP.costo,
          activo:         true,
        }, { onConflict: 'codigo' });
        if (prodUpsertErr) errores.push(`${receta.codigo_pp} producto: ${prodUpsertErr.message}`);
        else productosUpsert++;
      }
    }
  }

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'importar_recetas_pp',
    tabla:         'pp_recetas',
    datos_nuevos:  { importadas, actualizadas, total: recetas.length, costosAjustados, productosUpsert, archivo: file.name },
  });

  return NextResponse.json({
    total_recetas: recetas.length,
    importadas,
    actualizadas,
    costos_ajustados: costosAjustados,
    productos_actualizados: productosUpsert,
    errores: errores.slice(0, 20),
  });
}
