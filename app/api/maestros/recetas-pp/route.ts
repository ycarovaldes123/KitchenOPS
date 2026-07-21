import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { recalcularCostosPP } from '@/lib/recalcular-pp';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';

// GET  /api/maestros/recetas-pp           → list all recipes with ingredients + calculated costs
// POST /api/maestros/recetas-pp           → { accion: "recalcular" } recalculate all costs from DB

export async function GET() {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();

  const { data: recetas, error } = await supabase
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
    .eq('activo', true)
    .order('nombre');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(recetas ?? []);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const body = await req.json().catch(() => ({}));

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
