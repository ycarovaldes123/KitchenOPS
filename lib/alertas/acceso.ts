import type { NavItem, RolType } from '@/lib/roles';

// ─── Módulo "Alertas y Validaciones" — PILOTO SOLO LOCAL ─────────────────────
// Se habilita únicamente si se cumplen las TRES condiciones:
//   1. next dev (NODE_ENV === 'development')     → en Vercel siempre es 'production'
//   2. ENABLE_ALERTAS_MODULE=true en .env.local  → variable solo de servidor, no se inyecta al navegador
//   3. host local: localhost / 127.0.0.1 / ::1    → ni la IP de red local (tablet) lo ve
// Se evalúa en el servidor: proxy.ts, layout (sidebar), Inicio y la propia página.

export const ALERTAS_HREF = '/alertas';

// El piloto lo revisa el administrador
const ROLES_ALERTAS: RolType[] = ['admin'];

export const ALERTAS_NAV_ITEM: NavItem = {
  href: ALERTAS_HREF,
  label: 'Alertas',
  icon: 'shield-alert',
  roles: ROLES_ALERTAS,
  descripcion: 'Errores, inconsistencias y calidad de datos',
};

export function esHostLocal(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase();
  const sinPuerto = h.startsWith('[') ? h.slice(1, h.indexOf(']')) : h.replace(/:\d+$/, '');
  return sinPuerto === 'localhost' || sinPuerto === '127.0.0.1' || sinPuerto === '::1';
}

export function alertasHabilitadas(host: string | null | undefined, rol?: RolType): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (process.env.ENABLE_ALERTAS_MODULE !== 'true') return false;
  if (!esHostLocal(host)) return false;
  return rol === undefined || ROLES_ALERTAS.includes(rol);
}

// Agrega el módulo al final de la lista de navegación solo cuando corresponde (si no, la lista queda intacta)
export function conModuloAlertas(items: NavItem[], rol: RolType, host: string | null | undefined): NavItem[] {
  return alertasHabilitadas(host, rol) ? [...items, ALERTAS_NAV_ITEM] : items;
}
