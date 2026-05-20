import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditPayload {
  usuario_email:     string;
  rol_usuario:       string;
  accion:            string;
  tabla:             string;
  registro_id?:      string;
  datos_anteriores?: Record<string, unknown>;
  datos_nuevos?:     Record<string, unknown>;
  motivo?:           string;
}

export async function auditLog(supabase: SupabaseClient, payload: AuditPayload) {
  const { error } = await supabase.from('audit_log').insert(payload);
  if (error) console.error('[audit] error registrando:', error.message, payload);
}
