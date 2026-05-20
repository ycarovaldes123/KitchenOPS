import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { RMAP, type RolType } from '@/lib/roles';

export type SessionOk  = { ok: true;  email: string; rol: RolType };
export type SessionErr = { ok: false; response: NextResponse };
export type SessionResult = SessionOk | SessionErr;

export async function getSessionRol(): Promise<SessionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }

  const rol = RMAP[user.email ?? ''];
  if (!rol) {
    return { ok: false, response: NextResponse.json({ error: 'Sin acceso' }, { status: 403 }) };
  }

  return { ok: true, email: user.email!, rol };
}

export async function requireRol(rolesPermitidos: RolType[]): Promise<SessionResult> {
  const session = await getSessionRol();
  if (!session.ok) return session;

  if (!rolesPermitidos.includes(session.rol)) {
    return { ok: false, response: NextResponse.json({ error: 'Sin permiso para esta acción' }, { status: 403 }) };
  }

  return session;
}
