import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { calcularResumenFilas, ocultarValorizacion, resolverHastaConConteoFinal } from '@/lib/carnicos-resumen.server';
import { puedeHacer } from '@/lib/permissions';

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'bodega', 'jefatura', 'gerencia']);
  if (!s.ok) return s.response;

  const { searchParams } = new URL(req.url);
  // Compatibilidad: si solo llega "fecha" (uso anterior de un solo dia), se usa como desde y hasta.
  const fechaUnica = searchParams.get('fecha');
  const desde = searchParams.get('desde') ?? fechaUnica;
  const hasta = searchParams.get('hasta') ?? fechaUnica;
  if (!isIsoDate(desde) || !isIsoDate(hasta)) return NextResponse.json({ error: 'Debes enviar desde y hasta en formato YYYY-MM-DD' }, { status: 400 });
  if (desde > hasta) return NextResponse.json({ error: 'La fecha "desde" no puede ser posterior a "hasta"' }, { status: 400 });

  const supabase = await createClient();

  try {
    const hastaConConteo = await resolverHastaConConteoFinal(supabase, desde, hasta);
    let filas = await calcularResumenFilas(supabase, desde, hastaConConteo);
    if (!puedeHacer(s.rol, 'controlCarnicos', 'verCostos')) filas = ocultarValorizacion(filas);
    return NextResponse.json({ desde, hasta: hastaConConteo, hasta_solicitado: hasta, filas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error consultando resumen' }, { status: 500 });
  }
}
