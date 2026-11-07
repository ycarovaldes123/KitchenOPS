import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { recalcularCostosPP } from '@/lib/recalcular-pp';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';
import { parseRecetaPPBody, generarCodigoReceta, reemplazarIngredientes, recalcularRecetaYProducto, recetaConCodigoPP } from '@/lib/recetas-pp-server';

// GET  /api/maestros/recetas-pp           → list active recipes with ingredients + calculated costs
//      ?todas=1                           → include inactive recipes too
// POST /api/maestros/recetas-pp           → { accion: "recalcular" } recalculate all costs from DB
//                                         → { accion: "crear", ...receta } create a recipe from the editor

export async function GET(req: NextRequest) {
  // Cocina puede consultar las recetas (solo lectura); crear/recalcular sigue siendo admin/finanzas.
  const s = await requireRol(['admin', 'finanzas', 'cocina']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const todas = req.nextUrl.searchParams.get('todas') === '1';

  let query = supabase
    .from('pp_recetas')
    .select(`
      *,
      ingredientes:pp_receta_ingredientes (
        id, orden, codigo_ingrediente, nombre_ingrediente,
        cantidad, unidad_medida,
        costo_unitario_snap, costo_linea_calculado,
        sin_codigo, sin_costo
      )
    `)
    .order('nombre');
  if (!todas) query = query.eq('activo', true);

  const { data: recetas, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(recetas ?? []);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const body = await req.json().catch(() => ({}));

  if (body.accion === 'crear') return crearReceta(supabase, s, body);

  if (body.accion !== 'recalcular') {
    return NextResponse.json({ error: 'accion no reconocida' }, { status: 400 });
  }

  const result = await recalcularCostosPP(supabase);

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'recalcular_costos_pp',
    tabla:         'pp_recetas',
    datos_nuevos:  { recalculadas: result.recalculadas, errores: result.errores.length },
  });

  return NextResponse.json({
    recalculadas: result.recalculadas,
    errores:      result.errores.slice(0, 20),
  });
}

async function crearReceta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  s: { email: string; rol: string },
  body: Record<string, unknown>,
) {
  const input = parseRecetaPPBody(body);
  if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 });

  if (input.activo) {
    const otra = await recetaConCodigoPP(supabase, input.codigo_pp);
    if (otra) return NextResponse.json({ error: `El código PP ${input.codigo_pp} ya está vinculado a ${otra.codigo_receta} ${otra.nombre}. Edita esa receta o elige otro código PP.` }, { status: 409 });
  }

  const codigoReceta = input.codigo_receta ?? await generarCodigoReceta(supabase, input.codigo_pp);

  const { data: existente } = await supabase
    .from('pp_recetas')
    .select('id, nombre')
    .eq('codigo_receta', codigoReceta)
    .maybeSingle();
  if (existente) {
    return NextResponse.json({ error: `Ya existe la receta ${codigoReceta} (${existente.nombre}). Edítala en vez de crear otra.` }, { status: 409 });
  }

  const { data: receta, error } = await supabase
    .from('pp_recetas')
    .insert({
      codigo_receta:      codigoReceta,
      codigo_pp:          input.codigo_pp,
      nombre:             input.nombre,
      rendimiento:        input.rendimiento,
      unidad_rendimiento: input.unidad_rendimiento,
      activo:             input.activo,
      area:               input.area,
      estado:             'PENDIENTE',
    })
    .select('id')
    .single();
  if (error || !receta) return NextResponse.json({ error: error?.message ?? 'No se pudo crear la receta' }, { status: 500 });

  const ingErr = await reemplazarIngredientes(supabase, receta.id, input);
  if (ingErr) {
    await supabase.from('pp_recetas').delete().eq('id', receta.id);
    return NextResponse.json({ error: `Ingredientes: ${ingErr}` }, { status: 500 });
  }

  const errores = await recalcularRecetaYProducto(supabase, receta.id, input);

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'crear_receta_pp',
    tabla:         'pp_recetas',
    registro_id:   receta.id,
    datos_nuevos:  { ...input, codigo_receta: codigoReceta },
  });

  return NextResponse.json({ id: receta.id, codigo_receta: codigoReceta, errores });
}