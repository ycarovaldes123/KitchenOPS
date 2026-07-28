import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { getVentasParaFecha } from '@/lib/carnicos-toteat';
import { calcularConsumoCarnicos } from '@/lib/carnicos-ventas';
import type { CarnicoPlato, CarnicoProducto, PendienteVenta } from '@/types/carnicos';

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'bodega']);
  if (!s.ok) return s.response;

  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha');
  if (!isIsoDate(fecha)) return NextResponse.json({ error: 'Debes enviar fecha en formato YYYY-MM-DD' }, { status: 400 });

  const supabase = await createClient();
  const [platosRes, productosRes, registradasRes] = await Promise.all([
    supabase.from('carnicos_platos').select('id,categoria,codigo_toteat,plato_nombre,producto_id,codigo_producto,producto_nombre,unidad_medida,cantidad,advertencia,activo').eq('activo', true),
    supabase.from('carnicos_productos').select('id,tipo,codigo,nombre,unidad_medida,es_pp,activo').eq('activo', true),
    supabase.from('carnicos_ventas_registradas').select('producto_id').eq('fecha', fecha),
  ]);

  if (platosRes.error) return NextResponse.json({ error: `${platosRes.error.message}. Ejecuta scripts/supabase_control_carnicos.sql y el importador de Excel.` }, { status: 500 });
  if (productosRes.error) return NextResponse.json({ error: productosRes.error.message }, { status: 500 });

  let ventas: Awaited<ReturnType<typeof getVentasParaFecha>>['ventas'] = [];
  let fuenteVentas: Awaited<ReturnType<typeof getVentasParaFecha>>['fuente'] = 'sincronizadas';
  const pendientesExtra: PendienteVenta[] = [];

  try {
    const resultado = await getVentasParaFecha(fecha);
    ventas = resultado.ventas;
    fuenteVentas = resultado.fuente;
  } catch (error) {
    pendientesExtra.push({
      tipo: 'api_sin_respuesta',
      codigo_toteat: null,
      plato_nombre: null,
      observacion: error instanceof Error ? error.message : 'No se pudo consultar Toteat.',
    });
  }

  const { consumos, pendientes } = calcularConsumoCarnicos(ventas, (platosRes.data ?? []) as CarnicoPlato[], (productosRes.data ?? []) as CarnicoProducto[]);

  const registradasSet = new Set((registradasRes.data ?? []).map(r => r.producto_id));
  const consumosConEstado = consumos.map(c => ({ ...c, ya_registrado: registradasSet.has(c.producto_id) }));

  return NextResponse.json({
    fecha,
    fuenteVentas,
    consumos: consumosConEstado,
    pendientes: [...pendientesExtra, ...pendientes],
    ventasLeidas: ventas.length,
    platosConReceta: consumos.length,
  });
}
