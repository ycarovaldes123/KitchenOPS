export type RolType = 'cocina' | 'jefatura' | 'finanzas' | 'admin';

export const RMAP: Record<string, RolType> = {
  'ycaro@cerveceriakunstmann.cl':         'admin',
  'jsepulveda@cerveceriakunstmann.cl':    'admin',
  'ddelgado@cerveceriakunstmann.cl':      'finanzas',
  'caravena@cerveceriakunstmann.cl':      'finanzas',
  'fcaro@cerveceriakunstmann.cl':         'jefatura',
  'chefstorobayo@cerveceriakunstmann.cl': 'cocina',
};

export const RUTAS_ROL: Record<RolType, string[]> = {
  admin:    ['/produccion', '/colacion', '/mermas', '/historial', '/dashboard', '/kpis', '/costos', '/export', '/maestros'],
  finanzas: ['/dashboard', '/produccion', '/colacion', '/mermas', '/historial', '/kpis', '/costos', '/export', '/maestros'],
  jefatura: ['/produccion', '/colacion', '/mermas', '/historial', '/dashboard', '/kpis', '/export', '/maestros'],
  cocina:   ['/produccion', '/colacion', '/mermas', '/historial'],
};

export const RUTA_INICIO: Record<RolType, string> = {
  admin:    '/kpis',
  finanzas: '/kpis',
  jefatura: '/dashboard',
  cocina:   '/produccion',
};

export const ROL_LABEL: Record<RolType, string> = {
  admin:    'Administrador',
  finanzas: 'Finanzas',
  jefatura: 'Jefatura Cocina',
  cocina:   'Cocina',
};

export interface NavItem {
  href:  string;
  label: string;
  icon:  string;
  roles: RolType[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/produccion', label: 'Producción', icon: 'flame',    roles: ['admin', 'cocina', 'jefatura'] },
  { href: '/colacion',   label: 'Colación',   icon: 'utensils', roles: ['admin', 'cocina', 'jefatura'] },
  { href: '/mermas',     label: 'Mermas',     icon: 'trending', roles: ['admin', 'cocina', 'jefatura'] },
  { href: '/historial',  label: 'Historial',  icon: 'clock',    roles: ['admin', 'cocina', 'jefatura', 'finanzas'] },
  { href: '/dashboard',  label: 'Dashboard',  icon: 'grid',     roles: ['admin', 'jefatura', 'finanzas'] },
  { href: '/kpis',       label: 'KPIs',       icon: 'barchart', roles: ['admin', 'finanzas', 'jefatura'] },
  { href: '/costos',     label: 'Costos',     icon: 'dollar',   roles: ['admin', 'finanzas'] },
  { href: '/export',     label: 'Exportar',   icon: 'download', roles: ['admin', 'finanzas', 'jefatura'] },
  { href: '/maestros',   label: 'Maestros',   icon: 'settings', roles: ['admin', 'finanzas', 'jefatura'] },
];
