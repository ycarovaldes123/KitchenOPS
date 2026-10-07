// Envío automático de alertas al crear un registro en Producción, Mermas o Colación.
// Corre con after() DESPUÉS de responder: nunca bloquea ni modifica el guardado, y cualquier
// error queda solo en el log del servidor. Solo lee datos; no escribe en la base.
//
// Se activa con ENABLE_ALERTAS_EMAIL=true y un proveedor de correo configurado (lib/email.ts).
// Destinatario fijo: DESTINATARIO_PILOTO. Solo se crea → cada registro avisa una vez.

import type { SupabaseClient } from '@supabase/supabase-js';
import { cargarDatosSistema } from './datos';
import { analizarDatos } from './analizador';
import { armarCorreoRegistro, MODULOS_CORREO } from './resumen';
import { enviarCorreo, proveedorConfigurado } from '@/lib/email';
import type { ModuloAlerta } from './types';

// Enlace del correo: dominio de producción en Vercel (variable de sistema que Vercel define sola);
// en desarrollo, el servidor local.
const URL_MODULO = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/alertas`
  : 'http://localhost:3000/alertas';

export function correoAutomaticoActivo(): boolean {
  return process.env.ENABLE_ALERTAS_EMAIL === 'true' && proveedorConfigurado() !== null;
}

export async function notificarAlertasDeRegistro(supabase: SupabaseClient, modulo: ModuloAlerta, registroId: string): Promise<void> {
  if (!correoAutomaticoActivo() || !MODULOS_CORREO.includes(modulo)) return;
  try {
    const { alertas } = analizarDatos(await cargarDatosSistema(supabase));
    const delRegistro = alertas.filter(a => a.origen === registroId && a.modulo === modulo);
    if (!delRegistro.length) return;
    await enviarCorreo(armarCorreoRegistro(delRegistro, URL_MODULO));
  } catch (e) {
    console.error(`[alertas] no se pudo notificar ${modulo} ${registroId}:`, e instanceof Error ? e.message : e);
  }
}
