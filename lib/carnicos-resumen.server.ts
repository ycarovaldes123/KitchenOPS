import type { createClient } from '@/utils/supabase/server';
import { dentroDeTolerancia } from './config-carnicos';
import type { ResumenFila } from '@/types/carnicos';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Calcula el cuadre de Control Carnicos para el rango [desde, hasta].
 * inv_inicial viene del inicio del rango (desde), inv_final del cierre (hasta),
 * y los movimientos (ingresos/ventas/produccion/mermas/colacion) se suman en todo el rango.
 * Compartido entre /api/control-carnicos/resumen y los exports Excel (conteo/reporte).
 */
export async function calcularResumenFilas(
  supabase: SupabaseServerClient,
  desde: string,
  hasta: string,
): Promise<ResumenFila[]> {
  const [productosRes, movimientosRes, invIniRes, invFinRes] = await Promise.all([
    supabase.from('carnicos_productos').select('id,nombre,codigo,tipo,unidad_medida').eq('activo', true).order('nombre'),
    supabase.from('carnicos_movimientos').select('producto_id,subtipo,cantidad').gte('fecha', desde).lte('fecha', hasta),
    supabase.from('carnicos_inventarios').select('producto_id,cantidad').eq('fecha', desde).eq('tipo', 'INICIAL'),
    supabase.from('carnicos_inventarios').select('producto_id,cantidad').eq('fecha', hasta).eq('tipo', 'FINAL'),
  ]);

  if (productosRes.error) throw new Error(`${productosRes.error.message}. Ejecuta scripts/supabase_control_carnicos.sql y el importador de Excel.`);
  if (movimientosRes.error) throw new Error(movimientosRes.error.message);
  if (invIniRes.error) throw new Error(invIniRes.error.message);
  if (invFinRes.error) throw new Error(invFinRes.error.message);

  const productos = productosRes.data ?? [];
  const movimientos = movimientosRes.data ?? [];
  const invIni = sumarPorProducto(invIniRes.data ?? []);
  const invFin = sumarPorProducto(invFinRes.data ?? []);
  const hayConteoFinal = (invFinRes.data ?? []).length > 0;

  const productosSinIni = productos.filter(p => !invIni.has(p.id)).map(p => p.id);
  const carryForward = await calcularCarryForward(supabase, desde, productosSinIni);

  return productos.map(producto => {
    const movsProducto = movimientos.filter(m => m.producto_id === producto.id);
    const sumaSubtipo = (subtipo: string) => movsProducto.filter(m => m.subtipo === subtipo).reduce((acc, m) => acc + Number(m.cantidad), 0);

    let inv_inicial = 0;
    let inv_inicial_fuente: ResumenFila['inv_inicial_fuente'] = 'cero';
    if (invIni.has(producto.id)) {
      inv_inicial = invIni.get(producto.id)!;
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
    const inv_final = invFin.get(producto.id) ?? 0;

    const diferencia = hayConteoFinal ? inv_final - calculo : null;
    const estado: ResumenFila['estado'] = diferencia === null ? 'sin_conteo' : dentroDeTolerancia(diferencia, producto.unidad_medida) ? 'ok' : 'alerta';

    return {
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      producto_codigo: producto.codigo,
      categoria: producto.tipo,
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
}

function sumarPorProducto(rows: { producto_id: string; cantidad: number }[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.producto_id, (map.get(row.producto_id) ?? 0) + Number(row.cantidad));
  }
  return map;
}

async function calcularCarryForward(
  supabase: SupabaseServerClient,
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
