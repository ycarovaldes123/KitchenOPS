import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { calcularResumenFilas, ocultarValorizacion } from '@/lib/carnicos-resumen.server';
import { construirReporteWorkbook } from '@/lib/carnicos-reporte-excel';
import { formatFechaCompacta } from '@/lib/config-carnicos';
import { puedeHacer } from '@/lib/permissions';

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// GET /api/control-carnicos/resumen/reporte?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Todas las columnas de la Tabla Resumen para el rango filtrado. La columna CALCULO lleva la
// formula real de Excel (inv. inicial + ingresos - salidas) y DIFERENCIA depende de ella por
// formula, de modo que si se edita a mano una cantidad, Excel recalcula CALCULO y DIFERENCIA.
// Ver lib/carnicos-reporte-excel.ts para el detalle de formatos y formulas.
export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'bodega']);
  if (!s.ok) return s.response;

  const { searchParams } = new URL(req.url);
  const fechaUnica = searchParams.get('fecha');
  const desde = searchParams.get('desde') ?? fechaUnica;
  const hasta = searchParams.get('hasta') ?? fechaUnica;
  if (!isIsoDate(desde) || !isIsoDate(hasta)) return NextResponse.json({ error: 'Debes enviar desde y hasta en formato YYYY-MM-DD' }, { status: 400 });
  if (desde > hasta) return NextResponse.json({ error: 'La fecha "desde" no puede ser posterior a "hasta"' }, { status: 400 });

  const supabase = await createClient();

  let filas;
  try {
    filas = await calcularResumenFilas(supabase, desde, hasta);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error generando el reporte' }, { status: 500 });
  }
  const verCostos = puedeHacer(s.rol, 'controlCarnicos', 'verCostos');
  if (!verCostos) filas = ocultarValorizacion(filas);

  const wb = construirReporteWorkbook(filas, verCostos);
  const buffer = await wb.xlsx.writeBuffer();
  const filename = desde === hasta
    ? `Reporte_${formatFechaCompacta(desde)}.xlsx`
    : `Reporte_${formatFechaCompacta(desde)}_${formatFechaCompacta(hasta)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
