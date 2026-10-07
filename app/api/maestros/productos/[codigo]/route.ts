import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';
import { recalcularCostosPP, recetasAfectadasPorProductos } from '@/lib/recalcular-pp';

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UNIDADES_VALIDAS = ['KG', 'GR', 'LT', 'CC', 'UN', 'PR', 'PQ'];

type CodeReference = {
  table: string;
  column: string;
  optional?: boolean;
};

const CODE_REFERENCES: CodeReference[] = [
  { table: 'pp', column: 'codigo_producto' },
  { table: 'pp_ingredientes', column: 'codigo_producto' },
  { table: 'detalle_produccion', column: 'codigo_producto' },
  { table: 'detalle_colacion', column: 'codigo_producto' },
  { table: 'detalle_frutas', column: 'codigo_producto' },
  { table: 'detalle_mermas', column: 'codigo_producto' },
  { table: 'carta_ingredientes', column: 'codigo_producto' },
  { table: 'productos_criticos_bodega', column: 'codigo_producto', optional: true },
  { table: 'control_bodega_cocina', column: 'codigo_producto', optional: true },
  { table: 'detalle_mermas_platos_insumos', column: 'codigo_producto', optional: true },
  { table: 'pp_receta_ingredientes', column: 'codigo_ingrediente', optional: true },
  { table: 'pp_recetas', column: 'codigo_pp', optional: true },
];

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || error?.message?.includes('does not exist');
}

async function updateCodeReferences(supabase: Supabase, fromCode: string, toCode: string) {
  const updated: CodeReference[] = [];

  for (const ref of CODE_REFERENCES) {
    const { error } = await supabase
      .from(ref.table)
      .update({ [ref.column]: toCode })
      .eq(ref.column, fromCode);

    if (error) {
      if (ref.optional && isMissingRelationError(error)) continue;

      for (const done of updated.reverse()) {
        await supabase
          .from(done.table)
          .update({ [done.column]: fromCode })
          .eq(done.column, toCode);
      }

      return error;
    }

    updated.push(ref);
  }

  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase    = await createClient();
  const { codigo }  = await params;
  const body        = await req.json();
  const codigoNuevo = typeof body.codigo === 'string' ? body.codigo.trim() : codigo;
  const cambioCodigo = codigoNuevo !== codigo;

  if (cambioCodigo && s.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo ADMIN puede modificar el codigo del producto' }, { status: 403 });
  }

  if (cambioCodigo && !codigoNuevo) {
    return NextResponse.json({ error: 'El codigo es requerido' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.nombre !== undefined) {
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    if (!nombre) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }

    updates.nombre = nombre.toUpperCase();
  }
  if (body.unidad_medida !== undefined) {
    const raw = String(body.unidad_medida ?? '').trim().toUpperCase();
    const unidad = raw === 'UND' ? 'UN' : raw;
    if (!UNIDADES_VALIDAS.includes(unidad)) {
      return NextResponse.json({ error: `Unidad de medida no valida: ${raw || '(vacia)'}. Usa ${UNIDADES_VALIDAS.join(', ')}` }, { status: 400 });
    }
    updates.unidad_medida = unidad;
  }
  if (body.costo_promedio !== undefined) updates.costo_promedio = body.costo_promedio;
  if (body.codigo_defontana !== undefined) {
    const codDef = String(body.codigo_defontana ?? '').trim();
    if (codDef && !/^\d+$/.test(codDef)) {
      return NextResponse.json({ error: 'El codigo Defontana debe contener solo numeros' }, { status: 400 });
    }
    if (codDef) {
      const { data: otro } = await supabase.from('productos').select('codigo,nombre').eq('codigo_defontana', codDef).neq('codigo', codigo).maybeSingle();
      if (otro) return NextResponse.json({ error: `El codigo Defontana ${codDef} ya esta asignado a ${otro.codigo} ${otro.nombre}` }, { status: 409 });
    }
    updates.codigo_defontana = codDef || null;
  }
  if (body.activo        !== undefined) updates.activo        = body.activo;
  updates.updated_at = new Date().toISOString();

  if (cambioCodigo) {
    const { data: actual, error: fetchErr } = await supabase
      .from('productos')
      .select('codigo,nombre,unidad_medida,costo_promedio,codigo_defontana,activo')
      .eq('codigo', codigo)
      .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!actual) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

    const { data: existente, error: existsErr } = await supabase
      .from('productos')
      .select('codigo')
      .eq('codigo', codigoNuevo)
      .maybeSingle();
    if (existsErr) return NextResponse.json({ error: existsErr.message }, { status: 500 });
    if (existente) return NextResponse.json({ error: 'Ya existe un producto con ese codigo' }, { status: 409 });

    const productoNuevo = {
      ...actual,
      ...updates,
      codigo: codigoNuevo,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('productos')
      .insert(productoNuevo)
      .select()
      .single();
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    const refErr = await updateCodeReferences(supabase, codigo, codigoNuevo);
    if (refErr) {
      await supabase.from('productos').delete().eq('codigo', codigoNuevo);
      return NextResponse.json({ error: refErr.message }, { status: 500 });
    }

    const { error: deleteErr } = await supabase.from('productos').delete().eq('codigo', codigo);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    const ppResult = await recalcularCostosPP(supabase, await recetasAfectadasPorProductos(supabase, [codigoNuevo]));

    await auditLog(supabase, {
      usuario_email: s.email,
      rol_usuario:   s.rol,
      accion:        'modificar_producto',
      tabla:         'productos',
      registro_id:   codigoNuevo,
      datos_anteriores: { codigo },
      datos_nuevos:  { ...updates, codigo: codigoNuevo, pp_recalculadas: ppResult.recalculadas },
    });

    return NextResponse.json({ ...inserted, pp_recalculadas: ppResult.recalculadas, pp_errores: ppResult.errores.slice(0, 10) });
  }

  const { data: anterior } = await supabase.from('productos').select('unidad_medida,costo_promedio,codigo_defontana').eq('codigo', codigo).maybeSingle();

  const { data, error } = await supabase.from('productos').update(updates).eq('codigo', codigo).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalcular recetas PP solo si cambió algo que afecta el costo, y solo las que usan este producto
  // (antes se recalculaban todas las recetas en cada guardado: ~500 escrituras, ~100 s).
  const cambioCosto  = updates.costo_promedio !== undefined && Math.abs((Number(anterior?.costo_promedio) || 0) - (Number(updates.costo_promedio) || 0)) > 1e-6;
  const cambioUnidad = updates.unidad_medida !== undefined && updates.unidad_medida !== anterior?.unidad_medida;
  const ppResult = cambioCosto || cambioUnidad
    ? await recalcularCostosPP(supabase, await recetasAfectadasPorProductos(supabase, [codigo]))
    : { recalculadas: 0, errores: [] as string[] };

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        body.nombre !== undefined ? 'modificar_producto' : 'editar_producto',
    tabla:         'productos',
    registro_id:   codigo,
    datos_anteriores: anterior ?? undefined,
    datos_nuevos:  { ...updates, pp_recalculadas: ppResult.recalculadas },
  });

  return NextResponse.json({ ...data, pp_recalculadas: ppResult.recalculadas, pp_errores: ppResult.errores.slice(0, 10) });
}
