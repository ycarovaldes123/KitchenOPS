// Solo servidor (usa la service role key).
import type { createServiceClient } from '@/utils/supabase/server';
import { RMAP, esRol, type RolType } from '@/lib/roles';

// Cuentas de ingreso (Supabase Auth). Solo se usan con el service client y desde rutas de admin.

type Service = Awaited<ReturnType<typeof createServiceClient>>;

export const PASSWORD_MIN = 8;

export interface CuentaAcceso {
  id: string;
  email: string;
  /** Perfil efectivo: lista fija RMAP o, si no esta, app_metadata.rol. */
  rol: RolType | null;
  /** El perfil viene de la lista fija del codigo (no se cambia desde Personal). */
  fijo: boolean;
}

export async function mapaCuentas(supabase: Service): Promise<Map<string, CuentaAcceso>> {
  const mapa = new Map<string, CuentaAcceso>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      const email = (u.email ?? '').toLowerCase();
      if (!email) continue;
      const fijo = RMAP[email];
      const meta = u.app_metadata?.rol;
      mapa.set(email, { id: u.id, email, rol: fijo ?? (esRol(meta) ? meta : null), fijo: !!fijo });
    }
    if (data.users.length < 1000) break;
  }
  return mapa;
}

export function validarPassword(password: string) {
  if (password.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (/\s/.test(password)) return 'La contraseña no puede tener espacios.';
  return null;
}

/**
 * Crea la cuenta (si no existe) o actualiza su contraseña y/o perfil.
 * El perfil de un correo de la lista fija (RMAP) no se toca.
 */
export async function guardarCuenta(
  supabase: Service,
  email: string,
  opciones: { password?: string; perfil?: RolType | null },
): Promise<{ creada: boolean; cuenta: CuentaAcceso }> {
  const correo = email.trim().toLowerCase();
  const cuentas = await mapaCuentas(supabase);
  const existente = cuentas.get(correo);
  const fijo = RMAP[correo];
  const perfil = fijo ?? opciones.perfil ?? existente?.rol ?? null;

  if (!existente) {
    if (!opciones.password) throw new Error('Para crear la cuenta de acceso ingresa una contraseña.');
    if (!perfil) throw new Error('Elige el perfil de acceso al sistema.');
    const { data, error } = await supabase.auth.admin.createUser({
      email: correo,
      password: opciones.password,
      email_confirm: true,
      app_metadata: fijo ? {} : { rol: perfil },
    });
    if (error) throw new Error(error.message);
    return { creada: true, cuenta: { id: data.user.id, email: correo, rol: perfil, fijo: !!fijo } };
  }

  const cambios: { password?: string; app_metadata?: Record<string, unknown> } = {};
  if (opciones.password) cambios.password = opciones.password;
  if (!fijo && opciones.perfil && opciones.perfil !== existente.rol) cambios.app_metadata = { rol: opciones.perfil };
  if (Object.keys(cambios).length) {
    const { error } = await supabase.auth.admin.updateUserById(existente.id, cambios);
    if (error) throw new Error(error.message);
  }
  return { creada: false, cuenta: { ...existente, rol: perfil } };
}
