import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { convertirCantidad } from '@/lib/unidades-carnicos';
import type { ConsumoCalculado } from '@/types/carnicos';

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

interface Entrada {
  producto_id: string;
  producto_nombre: string;
  unidad_medida: string;
  codigo_toteat: string;
  plato_nombre: string;
  cantidad_vendida: number;
  cantidad_por_plato: number;
  consumo_total: number;
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin']); // TODO: agregar 'bodega' cuando se habilite el rol
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const fecha = body.fecha;
  const consumosBody = Array.isArray(body.consumos) ? (body.consumos as ConsumoCalculado[]) : [];
  const responsable_id = typeof body.responsable_id === 'string' ? body.responsable_id : null;
  const responsable_nombre = String(body.responsable_nombre || 'Sistema Ventas Toteat').trim();
  const turno = body.turno === 'AM' || body.turno === 'PM' ? body.turno : null;

  if (!isIsoDate(fecha) || consumosBody.length === 0) {
    return NextResponse.json({ error: 'Faltan fecha o consumos a registrar' }, { status: 400 });
  }

  // Solo productos con consumo real (defensivo: calcularConsumoCarnicos ya solo devuelve estos).
  const consumos = consumosBody.filter(c => c.cantidad_calculada > 0 && c.platos_origen.length > 0);

  const entradas: Entrada[] = [];
  const omitidos: { codigo_toteat: string; producto_nombre: string }[] = [];

  for (const consumo of consumos) {
    // Agrupa por codigo_toteat por si llegan filas repetidas para el mismo plato (defensivo,
    // ademas de la agregacion que ya hace calcularConsumoCarnicos), para no perder ni
    // sobrescribir cantidades al registrar.
    const porCodigo = new Map<string, ConsumoCalculado['platos_origen'][number]>();
    for (const origen of consumo.platos_origen) {
      const existente = porCodigo.get(origen.codigo_toteat);
      if (existente) existente.cantidad_vendida += origen.cantidad_vendida;
      else porCodigo.set(origen.codigo_toteat, { ...origen });
    }

    for (const origen of porCodigo.values()) {
      // Mismo calculo que en la consulta (calcularConsumoCarnicos): convertir de la unidad de la
      // receta a la unidad del producto antes de guardar, para que el total coincida con el
      // "Total calculado" que se muestra en pantalla y que llega correcto a Tabla Resumen.
      const consumoEnUnidadReceta = origen.cantidad_por_plato * origen.cantidad_vendida;
      const consumoConvertido = convertirCantidad(consumoEnUnidadReceta, origen.unidad_receta, consumo.unidad_medida);
      if (consumoConvertido === null || consumoConvertido <= 0) {
        omitidos.push({ codigo_toteat: origen.codigo_toteat, producto_nombre: consumo.producto_nombre });
        continue;
      }
      entradas.push({
        producto_id: consumo.producto_id,
        producto_nombre: consumo.producto_nombre,
        unidad_medida: consumo.unidad_medida,
        codigo_toteat: origen.codigo_toteat,
        plato_nombre: origen.plato_nombre,
        cantidad_vendida: origen.cantidad_vendida,
        cantidad_por_plato: origen.cantidad_por_plato,
        consumo_total: consumoConvertido,
      });
    }
  }

  if (entradas.length === 0) {
    return NextResponse.json({ ok: true, insertados: 0, sobrescritos: 0, omitidos });
  }

  const supabase = await createClient();

  // 1) Trae en una sola consulta todo lo ya registrado para esta fecha, para saber que se va a
  //    sobrescribir sin tener que golpear la base por cada plato/producto.
  const { data: existentes, error: existentesError } = await supabase
    .from('carnicos_ventas_registradas')
    .select('id, codigo_toteat, producto_id, movimiento_id')
    .eq('fecha', fecha);
  if (existentesError) return NextResponse.json({ error: existentesError.message }, { status: 500 });

  const existentesMap = new Map((existentes ?? []).map(e => [`${e.codigo_toteat}||${e.producto_id}`, e]));

  // 2) Borra en bloque los movimientos previos de lo que se va a sobrescribir (la cascada borra
  //    tambien el registro de venta vinculado), para que volver a ingresar reemplace el dato en
  //    vez de duplicarlo.
  const movimientoIdsABorrar = entradas
    .map(e => existentesMap.get(`${e.codigo_toteat}||${e.producto_id}`)?.movimiento_id)
    .filter((id): id is string => Boolean(id));
  if (movimientoIdsABorrar.length > 0) {
    const { error: delMovError } = await supabase.from('carnicos_movimientos').delete().in('id', movimientoIdsABorrar);
    if (delMovError) return NextResponse.json({ error: delMovError.message }, { status: 500 });
  }
  // Registros huerfanos sin movimiento vinculado (no deberia pasar, se limpian por las dudas).
  const ventaIdsHuerfanas = entradas
    .map(e => existentesMap.get(`${e.codigo_toteat}||${e.producto_id}`))
    .filter((e): e is NonNullable<typeof e> => Boolean(e && !e.movimiento_id))
    .map(e => e.id);
  if (ventaIdsHuerfanas.length > 0) {
    await supabase.from('carnicos_ventas_registradas').delete().in('id', ventaIdsHuerfanas);
  }

  // 3) Inserta movimiento + registro de venta por cada entrada (2 idas y vueltas, en vez de las
  //    5 anteriores por entrada), lo que evita que el registro se sienta "colgado" cuando hay
  //    varios platos.
  let insertados = 0;
  let sobrescritos = 0;
  for (const entrada of entradas) {
    const { data: movimiento, error: movError } = await supabase
      .from('carnicos_movimientos')
      .insert({
        fecha,
        responsable_id,
        responsable_nombre,
        turno,
        observacion: `Venta Toteat ${entrada.codigo_toteat} - ${entrada.plato_nombre}`,
        bodega: 'COCINA',
        movimiento: 'SALIDA',
        subtipo: 'VENTAS',
        producto_id: entrada.producto_id,
        producto_nombre: entrada.producto_nombre,
        unidad_medida: entrada.unidad_medida,
        cantidad: entrada.consumo_total,
        origen: 'venta_toteat',
        created_by: s.email,
      })
      .select('id')
      .single();
    if (movError) return NextResponse.json({ error: movError.message }, { status: 500 });

    const { error: ventaError } = await supabase
      .from('carnicos_ventas_registradas')
      .insert({
        fecha,
        codigo_toteat: entrada.codigo_toteat,
        plato_nombre: entrada.plato_nombre,
        cantidad_vendida: entrada.cantidad_vendida,
        producto_id: entrada.producto_id,
        cantidad_por_plato: entrada.cantidad_por_plato,
        unidad_medida: entrada.unidad_medida,
        consumo_total: entrada.consumo_total,
        movimiento_id: movimiento.id,
      });
    if (ventaError) return NextResponse.json({ error: ventaError.message }, { status: 500 });

    if (existentesMap.has(`${entrada.codigo_toteat}||${entrada.producto_id}`)) sobrescritos++;
    else insertados++;
  }

  return NextResponse.json({ ok: true, insertados, sobrescritos, omitidos });
}
