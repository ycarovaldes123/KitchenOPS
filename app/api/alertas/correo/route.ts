import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { alertasHabilitadas } from '@/lib/alertas/acceso';
import { cargarDatosSistema } from '@/lib/alertas/datos';
import { analizarDatos } from '@/lib/alertas/analizador';
import { alertasDelResumen, armarCorreoResumen } from '@/lib/alertas/resumen';
import { DESTINATARIO_PILOTO, enviarCorreo, proveedorConfigurado } from '@/lib/email';

// Correo de prueba del resumen diario (pantalla de Alertas, solo administrador).
// Requiere además ENABLE_ALERTAS_EMAIL=true. Siempre va a DESTINATARIO_PILOTO (lib/email.ts).
// GET  → estado (proveedor configurado, destinatario)
// POST → envía el resumen del último día con alertas

function habilitado(req: NextRequest, rol: Parameters<typeof alertasHabilitadas>[1]) {
  return alertasHabilitadas(req.headers.get('host'), rol) && process.env.ENABLE_ALERTAS_EMAIL === 'true';
}

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;
  if (!alertasHabilitadas(req.headers.get('host'), s.rol)) return NextResponse.json({ error: 'No disponible' }, { status: 404 });
  return NextResponse.json({
    habilitado: process.env.ENABLE_ALERTAS_EMAIL === 'true',
    proveedor: proveedorConfigurado(),
    destinatario: DESTINATARIO_PILOTO,
  });
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;
  if (!habilitado(req, s.rol)) {
    return NextResponse.json({ error: 'El envío de prueba está desactivado (ENABLE_ALERTAS_EMAIL)' }, { status: 403 });
  }

  try {
    const supabase = await createClient();
    const { alertas } = analizarDatos(await cargarDatosSistema(supabase));
    const resumen = alertasDelResumen(alertas);
    if (!resumen.alertas.length) return NextResponse.json({ error: 'No hay alertas para resumir' }, { status: 400 });

    const url = `${req.nextUrl.protocol}//${req.headers.get('host')}/alertas`;
    const correo = armarCorreoResumen(resumen.alertas, resumen.fecha, url);
    const r = await enviarCorreo(correo);
    return NextResponse.json({ ok: true, ...r, asunto: correo.asunto });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo enviar' }, { status: 500 });
  }
}
