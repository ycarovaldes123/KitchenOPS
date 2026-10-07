import type { NavItem, RolType } from '@/lib/roles';

// ─── Módulo "Alertas y Validaciones" ──────────────────────────────────────────
// Activo en el sistema (ya no es piloto local). La pantalla /alertas la ve solo el administrador;
// las advertencias al guardar (POST /api/alertas/validar) las reciben todos los que registran.
// ENABLE_ALERTAS_MODULE=false apaga el módulo completo (pantalla + advertencias) sin desplegar código.
// Se evalúa en el servidor: proxy.ts, layout (sidebar), Inicio y la propia página.

export const ALERTAS_HREF = '/alertas';

// La pantalla de revisión la usa el administrador
const ROLES_ALERTAS: RolType[] = ['admin'];

export const ALERTAS_NAV_ITEM: NavItem = {
  href: ALERTAS_HREF,
  label: 'Alertas',
  icon: 'shield-alert',
  roles: ROLES_ALERTAS,
  descripcion: 'Errores, inconsistencias y calidad de datos',
};

export function moduloAlertasActivo(): boolean {
  return process.env.ENABLE_ALERTAS_MODULE !== 'false';
}

// `host` se mantiene en la firma por compatibilidad con los llamados existentes; ya no restringe.
export function alertasHabilitadas(_host: string | null | undefined, rol?: RolType): boolean {
  if (!moduloAlertasActivo()) return false;
  return rol === undefined || ROLES_ALERTAS.includes(rol);
}

// Agrega el módulo al final de la lista de navegación solo cuando corresponde (si no, la lista queda intacta)
export function conModuloAlertas(items: NavItem[], rol: RolType, host: string | null | undefined): NavItem[] {
  return alertasHabilitadas(host, rol) ? [...items, ALERTAS_NAV_ITEM] : items;
}
