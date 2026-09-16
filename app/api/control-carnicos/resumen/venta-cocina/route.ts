import { NextRequest, NextResponse } from 'next/server';
import { requireRol } from '@/lib/auth-server';
import { puedeHacer } from '@/lib/permissions';
import { fetchToteatSales, isCocinaSale } from '@/lib/toteat';

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Venta Toteat "solo cocina" (comida real, sin Cafeteria) del rango [desde, hasta], para el KPI
 * "% Diferencia $ vs venta cocina" de Tabla Resumen. Separado del endpoint /resumen principal
 * porque consulta Toteat en vivo (no hay nada sincronizado en `ventas_toteat` todavia) y un rango
 * de un mes puede tardar bastante (~20s): el frontend lo pide en paralelo, sin bloquear la tabla.
 */
export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'bodega', 'jefatura', 'gerencia']);
  if (!s.ok) return s.response;
  if (!puedeHacer(s.rol, 'controlCarnicos', 'verCostos')) return NextResponse.json({ ventaCocinaTotal: 0 });

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  if (!isIsoDate(desde) || !isIsoDate(hasta)) return NextResponse.json({ error: 'Debes enviar desde y hasta en formato YYYY-MM-DD' }, { status: 400 });
  if (desde > hasta) return NextResponse.json({ error: 'La fecha "desde" no puede ser posterior a "hasta"' }, { status: 400 });

  try {
    const { items } = await fetchToteatSales(desde, hasta, { soloComida: false });
    const ventaCocinaTotal = items.filter(isCocinaSale).reduce((acc, item) => acc + (Number(item.gross_amount) || 0), 0);
    return NextResponse.json({ ventaCocinaTotal });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error consultando venta Toteat' }, { status: 500 });
  }
}
