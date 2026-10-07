import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { alertasHabilitadas } from '@/lib/alertas/acceso';
import { cargarDatosSistema } from '@/lib/alertas/datos';
import { analizarDatos } from '@/lib/alertas/analizador';
import { REGLAS } from '@/lib/alertas/catalogo';
import type { DatosModulo } from '@/lib/alertas/types';

// GET /api/alertas — pantalla de Alertas, solo administrador (lib/alertas/acceso.ts).
// Ejecuta las reglas sobre los datos reales en modo lectura: solo SELECT, no escribe nada,
// no bloquea ni modifica movimientos. ?refrescar=1 fuerza un nuevo análisis.

const CACHE_MS = 2 * 60 * 1000;
let cache: { en: number; datos: DatosModulo } | null = null;

function ahoraChile() {
  const partes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
  return { fecha: partes.slice(0, 10), iso: partes.replace(' ', 'T') };
}

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;
  if (!alertasHabilitadas(req.headers.get('host'), s.rol)) {
    return NextResponse.json({ error: 'No disponible' }, { status: 404 });
  }

  if (cache && Date.now() - cache.en < CACHE_MS && req.nextUrl.searchParams.get('refrescar') !== '1') {
    return NextResponse.json(cache.datos);
  }

  try {
    const supabase = await createClient();
    const datos = await cargarDatosSistema(supabase);
    const r = analizarDatos(datos);
    const ahora = ahoraChile();
    const respuesta: DatosModulo = {
      alertas: r.alertas,
      reglas: REGLAS,
      volumen: r.volumen,
      hoy: ahora.fecha,
      generadoEn: ahora.iso,
      registrosAnalizados: r.registrosAnalizados,
    };
    cache = { en: Date.now(), datos: respuesta };
    return NextResponse.json(respuesta);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error analizando datos' }, { status: 500 });
  }
}
