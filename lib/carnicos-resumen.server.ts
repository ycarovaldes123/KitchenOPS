import type { createClient } from '@/utils/supabase/server';
import type { ResumenFila } from '@/types/carnicos';
import { fetchAllRows } from '@/lib/supabase-paginate';
import { inicioMesISO } from '@/lib/config-carnicos';
import { resolverArrastreInicial, type InvSnapshotRow } from '@/lib/carnicos-inventario-inicial';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface MovimientoResumen {
  producto_id: string;
  subtipo: string;
  cantidad: number;
}

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
    supabase.from('carnicos_productos').select('id,nombre,codigo,tipo,unidad_medida,costo_unitario').eq('activo', true).order('nombre'),
    // PostgREST corta cada select en ~1000 filas aunque no haya .limit(); un rango de varios dias con
    // ventas Toteat supera eso facilmente y el cuadre quedaria calculado sobre un subconjunto arbitrario
    // (haciendo que ediciones/altas del Historial "no se reflejen"). Se pagina con .range() e id estable.
    fetchAllRows<MovimientoResumen>((from, to) =>
      supabase
        .from('carnicos_movimientos')
        .select('producto_id,subtipo,cantidad', { count: 'exact' })
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<{ producto_id: string; cantidad: number }>((from, to) =>
      supabase
        .from('carnicos_inventarios')
        .select('producto_id,cantidad', { count: 'exact' })
        .eq('fecha', desde)
        .eq('tipo', 'INICIAL')
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<{ producto_id: string; cantidad: number }>((from, to) =>
      supabase
        .from('carnicos_inventarios')
        .select('producto_id,cantidad', { count: 'exact' })
        .eq('fecha', hasta)
        .eq('tipo', 'FINAL')
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

  if (productosRes.error) throw new Error(`${productosRes.error.message}. Ejecuta scripts/supabase_control_carnicos.sql, scripts/supabase_carnicos_costo_unitario.sql y el importador de Excel.`);
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

    const diferencia = hayConteoFinal ? round4(inv_final - calculo) : null;
    // Estado estricto: 0 exacto es OK, cualquier diferencia positiva o negativa es Alerta (sin tolerancia).
    const estado: ResumenFila['estado'] = diferencia === null ? 'sin_conteo' : diferencia === 0 ? 'ok' : 'alerta';
    const costo_unitario = Number(producto.costo_unitario ?? 0);
    const diferencia_valor = diferencia === null ? null : round2(diferencia * costo_unitario);

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
      diferencia,
      estado,
      inv_inicial_fuente,
      costo_unitario: round2(costo_unitario),
      diferencia_valor,
    };
  });
}

/**
 * Si el usuario filtra hasta una fecha sin conteo FINAL, usa el ultimo cierre FINAL
 * disponible dentro del rango. Asi la vista mensual no queda "sin conteo final" cuando
 * hoy es posterior al ultimo inventario cargado.
 */
export async function resolverHastaConConteoFinal(
  supabase: SupabaseServerClient,
  desde: string,
  hasta: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('carnicos_inventarios')
    .select('fecha')
    .eq('tipo', 'FINAL')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0]?.fecha ?? hasta;
}

/** Quita los valores monetarios de las filas para roles sin permiso verCostos en controlCarnicos. */
export function ocultarValorizacion(filas: ResumenFila[]): ResumenFila[] {
  return filas.map(f => ({ ...f, costo_unitario: 0, diferencia_valor: null }));
}

function sumarPorProducto(rows: { producto_id: string; cantidad: number }[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.producto_id, (map.get(row.producto_id) ?? 0) + Number(row.cantidad));
  }
  return map;
}

/**
 * Para los productos sin inventario INICIAL manual en `fecha`, resuelve que inventario
 * FINAL corresponde arrastrar como inventario inicial. El candidato SOLO puede ser un
 * FINAL del MISMO mes y año que `fecha` y anterior a ella: un FINAL de un mes anterior
 * nunca se arrastra (al cambiar de mes el inicial arranca en 0 salvo carga manual).
 * Ver lib/carnicos-inventario-inicial.ts.
 */
async function calcularCarryForward(
  supabase: SupabaseServerClient,
  fecha: string,
  productoIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (productoIds.length === 0) return result;

  // Solo el mes en curso: se consulta desde el dia 1 del mes de `fecha` hasta el dia
  // anterior. Nunca se traen FINAL de meses previos.
  const primerDiaDelMes = inicioMesISO(fecha);

  const { data, error } = await fetchAllRows<{ producto_id: string; fecha: string; cantidad: number }>((from, to) =>
    supabase
      .from('carnicos_inventarios')
      .select('producto_id,fecha,cantidad')
      .eq('tipo', 'FINAL')
      .in('producto_id', productoIds)
      .gte('fecha', primerDiaDelMes)
      .lt('fecha', fecha)
      .order('id', { ascending: true })
      .range(from, to)
  );
  if (error) throw new Error(error.message);

  const rowsPorProducto = new Map<string, InvSnapshotRow[]>();
  for (const row of data ?? []) {
    const lista = rowsPorProducto.get(row.producto_id) ?? [];
    lista.push({ fecha: row.fecha, tipo: 'FINAL', cantidad: Number(row.cantidad) });
    rowsPorProducto.set(row.producto_id, lista);
  }

  for (const [producto_id, rows] of rowsPorProducto) {
    const arrastre = resolverArrastreInicial(rows, fecha);
    if (arrastre !== null) result.set(producto_id, arrastre);
  }
  return result;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
