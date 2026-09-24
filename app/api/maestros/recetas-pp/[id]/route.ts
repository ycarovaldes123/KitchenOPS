import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';
import { parseRecetaPPBody, reemplazarIngredientes, recalcularRecetaYProducto, recetaConCodigoPP, codigoRecetaDesdePP } from '@/lib/recetas-pp-server';

// PATCH  /api/maestros/recetas-pp/:id  → { activo } solo activa/desactiva
//                                      → receta completa (nombre, rendimiento, ingredientes...) edita y recalcula
// DELETE /api/maestros/recetas-pp/:id  → elimina la receta y sus ingredientes

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: anterior, error: getErr } = await supabase
    .from('pp_recetas')
    .select('id, codigo_receta, codigo_pp, nombre, rendimiento, unidad_rendimiento, activo')
    .eq('id', id)
    .maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!anterior) return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 });

  // Solo activar / desactivar
  if (Object.keys(body).length === 1 && typeof body.activo === 'boolean') {
    if (body.activo) {
      const otra = await recetaConCodigoPP(supabase, anterior.codigo_pp, id);
      if (otra) return NextResponse.json({ error: `No se puede activar: el código PP ${anterior.codigo_pp} ya lo usa ${otra.codigo_receta} ${otra.nombre}. Desactiva esa o cambia el código PP de esta.` }, { status: 409 });
    }
    const { error } = await supabase.from('pp_recetas').update({ activo: body.activo }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (body.activo) await recalcularRecetaYProducto(supabase, id, { ...anterior, activo: true, ingredientes: [] });

    await auditLog(supabase, {
      usuario_email: s.email,
      rol_usuario:   s.rol,
      accion:        body.activo ? 'activar_receta_pp' : 'desactivar_receta_pp',
      tabla:         'pp_recetas',
      registro_id:   id,
      datos_anteriores: { activo: anterior.activo },
      datos_nuevos:     { activo: body.activo },
    });
    return NextResponse.json({ ok: true });
  }

  const input = parseRecetaPPBody({ ...body, codigo_receta: body.codigo_receta ?? anterior.codigo_receta });
  if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 });

  // El código de receta siempre sigue al código PP: 0502xxx → 0501xxx (p. ej. 0501175-B con PP 0502231 → 0501231)
  if (!body.codigo_receta) {
    input.codigo_receta = codigoRecetaDesdePP(input.codigo_pp) ?? anterior.codigo_receta;
  }

  if (input.activo) {
    const otra = await recetaConCodigoPP(supabase, input.codigo_pp, id);
    if (otra) return NextResponse.json({ error: `El código PP ${input.codigo_pp} ya está vinculado a ${otra.codigo_receta} ${otra.nombre}. Cada PP debe tener una sola receta activa.` }, { status: 409 });
  }

  if (input.codigo_receta !== anterior.codigo_receta) {
    const { data: choque } = await supabase
      .from('pp_recetas')
      .select('id, nombre')
      .eq('codigo_receta', input.codigo_receta)
      .neq('id', id)
      .maybeSingle();
    if (choque) return NextResponse.json({ error: `El código ${input.codigo_receta} ya lo usa ${choque.nombre}` }, { status: 409 });
  }

  const { error: updErr } = await supabase.from('pp_recetas').update({
    codigo_receta:      input.codigo_receta,
    codigo_pp:          input.codigo_pp,
    nombre:             input.nombre,
    rendimiento:        input.rendimiento,
    unidad_rendimiento: input.unidad_rendimiento,
    activo:             input.activo,
  }).eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const ingErr = await reemplazarIngredientes(supabase, id, input);
  if (ingErr) return NextResponse.json({ error: `Ingredientes: ${ingErr}` }, { status: 500 });

  const errores = await recalcularRecetaYProducto(supabase, id, input);

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'editar_receta_pp',
    tabla:         'pp_recetas',
    registro_id:   id,
    datos_anteriores: anterior,
    datos_nuevos:     { ...input },
  });

  return NextResponse.json({ ok: true, errores });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { id } = await params;

  const { data: anterior } = await supabase
    .from('pp_recetas')
    .select('codigo_receta, codigo_pp, nombre, rendimiento, unidad_rendimiento, ingredientes:pp_receta_ingredientes (codigo_ingrediente, nombre_ingrediente, cantidad, unidad_medida)')
    .eq('id', id)
    .maybeSingle();
  if (!anterior) return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 });

  // pp_receta_ingredientes se borra en cascada (FK ON DELETE CASCADE)
  const { error } = await supabase.from('pp_recetas').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'eliminar_receta_pp',
    tabla:         'pp_recetas',
    registro_id:   id,
    datos_anteriores: anterior,
  });

  return NextResponse.json({ ok: true });
}
