import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { dentroDeTolerancia } from '@/lib/config-carnicos';
import type { ResumenFila } from '@/types/carnicos';

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin']); // TODO: agregar 'bodega' cuando se habilite el rol
  if (!s.ok) return s.response;

  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha');
  if (!isIsoDate(fecha)) return NextResponse.json({ error: 'Debes enviar fecha en formato YYYY-MM-DD' }, { status: 400 });

  const supabase = await createClient();

  const [productosRes, movimientosRes, invIniHoyRes, invFinHoyRes] = await Promise.all([
    supabase.from('carnicos_productos').select('id,nombre,unidad_medida').eq('activo', true).order('nombre'),
    supabase.from('carnicos_movimientos').select('producto_id,subtipo,cantidad').eq('fecha', fecha),
    supabase.from('carnicos_inventarios').select('producto_id,cantidad').eq('fecha', fecha).eq('tipo', 'INICIAL'),
    supabase.from('carnicos_inventarios').select('producto_id,cantidad').eq('fecha', fecha).eq('tipo', 'FINAL'),
  ]);

  if (productosRes.error) return NextResponse.json({ error: `${productosRes.error.message}. Ejecuta scripts/supabase_control_carnicos.sql y el importador de Excel.` }, { status: 500 });
  if (movimientosRes.error) return NextResponse.json({ error: movimientosRes.error.message }, { status: 500 });
  if (invIniHoyRes.error) return NextResponse.json({ error: invIniHoyRes.error.message }, { status: 500 });
  if (invFinHoyRes.error) return NextResponse.json({ error: invFinHoyRes.error.message }, { status: 500 });

  const productos = productosRes.data ?? [];
  const movimientos = movimientosRes.data ?? [];
  const invIniHoy = sumarPorProducto(invIniHoyRes.data ?? []);
  const invFinHoy = sumarPorProducto(invFinHoyRes.data ?? []);
  const hayConteoFinalHoy = (invFinHoyRes.data ?? []).length > 0;

  const productosSinIniHoy = productos.filter(p => !invIniHoy.has(p.id)).map(p => p.id);
  const carryForward = await calcularCarryForward(supabase, fecha, productosSinIniHoy);

  const filas: ResumenFila[] = productos.map(producto => {
    const movsProducto = movimientos.filter(m => m.producto_id === producto.id);
    const sumaSubtipo = (subtipo: string) => movsProducto.filter(m => m.subtipo === subtipo).reduce((acc, m) => acc + Number(m.cantidad), 0);

    let inv_inicial = 0;
    let inv_inicial_fuente: ResumenFila['inv_inicial_fuente'] = 'cero';
    if (invIniHoy.has(producto.id)) {
      inv_inicial = invIniHoy.get(producto.id)!;
      inv_inicial_fuente = 'conteo_hoy';
    } else if (carryForward.has(producto.id)) {
      inv_inicial = carryForward.get(producto.id)!;
      inv_inicial_fuente = 'carry_forward';
    }

    const ingresos = sumaSubtipo('RECEPCION_BODEGA') + sumaSubtipo('INGRESO_PP');
    const ventas = sumaSubtipo('VENTAS');
    const produccion = sumaSubtipo('PRODUCCION');
    const mermas = sumaSubtipo('MERMAS');
    const colacion = sumaSubtipo('COLACION');
    const calculo = inv_inicial + ingresos - (ventas + produccion + mermas + colacion);
    const inv_final = invFinHoy.get(producto.id) ?? 0;

    const diferencia = hayConteoFinalHoy ? inv_final - calculo : null;
    const estado: ResumenFila['estado'] = diferencia === null ? 'sin_conteo' : dentroDeTolerancia(diferencia, producto.unidad_medida) ? 'ok' : 'alerta';

    return {
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      unidad_medida: producto.unidad_medida,
      inv_inicial: round4(inv_inicial),
      ingresos: round4(ingresos),
      ventas: round4(ventas),
      produccion: round4(produccion),
      mermas: round4(mermas),
      colacion: round4(colacion),
      calculo: round4(calculo),
      inv_final: round4(inv_final),
      diferencia: diferencia === null ? null : round4(diferencia),
      estado,
      inv_inicial_fuente,
    };
  });

  return NextResponse.json({ fecha, filas });
}

function sumarPorProducto(rows: { producto_id: string; cantidad: number }[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.producto_id, (map.get(row.producto_id) ?? 0) + Number(row.cantidad));
  }
  return map;
}

async function calcularCarryForward(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fecha: string,
  productoIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (productoIds.length === 0) return result;

  const { data: fechaPrevia } = await supabase
    .from('carnicos_inventarios')
    .select('fecha')
    .eq('tipo', 'FINAL')
    .lt('fecha', fecha)
    .in('producto_id', productoIds)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!fechaPrevia) return result;

  const { data: filasPrevias } = await supabase
    .from('carnicos_inventarios')
    .select('producto_id,cantidad')
    .eq('tipo', 'FINAL')
    .eq('fecha', fechaPrevia.fecha)
    .in('producto_id', productoIds);

  for (const row of filasPrevias ?? []) {
    result.set(row.producto_id, (result.get(row.producto_id) ?? 0) + Number(row.cantidad));
  }
  return result;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
