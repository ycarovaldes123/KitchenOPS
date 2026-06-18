export type RolType = 'cocina' | 'economo' | 'jefatura' | 'finanzas' | 'admin';

export const RMAP: Record<string, RolType> = {
  'ycaro@cerveceriakunstmann.cl':         'admin',
  'jsepulveda@cerveceriakunstmann.cl':    'admin',
  'ddelgado@cerveceriakunstmann.cl':      'finanzas',
  'caravena@cerveceriakunstmann.cl':      'finanzas',
  'fcaro@cerveceriakunstmann.cl':         'jefatura',
  'jmendez@cerveceriakunstmann.cl':       'economo',
  'chefstorobayo@cerveceriakunstmann.cl': 'cocina',
};

export const RUTAS_ROL: Record<RolType, string[]> = {
  admin:    ['/produccion', '/colacion', '/frutas', '/inventario', '/mermas', '/historial', '/bodega', '/ventas', '/dashboard', '/kpis', '/costos', '/export', '/maestros'],
  finanzas: ['/dashboard', '/produccion', '/colacion', '/frutas', '/inventario', '/mermas', '/historial', '/bodega', '/ventas', '/kpis', '/costos', '/export', '/maestros'],
  jefatura: ['/produccion', '/colacion', '/frutas', '/inventario', '/mermas', '/historial', '/bodega', '/ventas', '/dashboard', '/kpis', '/export', '/maestros'],
  economo:  ['/colacion', '/frutas', '/inventario', '/mermas', '/historial', '/bodega', '/ventas'],
  cocina:   ['/produccion', '/colacion', '/frutas', '/inventario', '/mermas', '/historial'],
};

export const RUTA_INICIO: Record<RolType, string> = {
  admin:    '/kpis',
  finanzas: '/kpis',
  jefatura: '/dashboard',
  economo:  '/bodega',
  cocina:   '/produccion',
};

export const ROL_LABEL: Record<RolType, string> = {
  admin:    'Administrador',
  finanzas: 'Finanzas',
  jefatura: 'Jefatura Cocina',
  economo:  'Economo',
  cocina:   'Cocina',
};

export interface NavItem {
  href:  string;
  label: string;
  icon:  string;
  roles: RolType[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/produccion', label: 'Produccion', icon: 'flame',    roles: ['admin', 'cocina', 'jefatura'] },
  { href: '/colacion',   label: 'Colacion',   icon: 'utensils', roles: ['admin', 'cocina', 'jefatura', 'economo'] },
  { href: '/frutas',     label: 'Frutas',     icon: 'utensils', roles: ['admin', 'cocina', 'jefatura', 'economo', 'finanzas'] },
  { href: '/inventario', label: 'Inventario', icon: 'grid',     roles: ['admin', 'cocina', 'jefatura', 'economo', 'finanzas'] },
  { href: '/mermas',     label: 'Mermas',     icon: 'trending', roles: ['admin', 'cocina', 'jefatura', 'economo'] },
  { href: '/historial',  label: 'Historial',  icon: 'clock',    roles: ['admin', 'cocina', 'jefatura', 'finanzas', 'economo'] },
  { href: '/bodega',     label: 'Bodega',     icon: 'grid',     roles: ['admin', 'finanzas', 'jefatura', 'economo'] },
  { href: '/ventas',     label: 'Ventas',     icon: 'barchart', roles: ['admin', 'finanzas', 'jefatura', 'economo'] },
  { href: '/dashboard',  label: 'Dashboard',  icon: 'grid',     roles: ['admin', 'jefatura', 'finanzas'] },
  { href: '/kpis',       label: 'KPIs',       icon: 'barchart', roles: ['admin', 'finanzas', 'jefatura'] },
  { href: '/costos',     label: 'Costos',     icon: 'dollar',   roles: ['admin', 'finanzas'] },
  { href: '/export',     label: 'Exportar',   icon: 'download', roles: ['admin', 'finanzas', 'jefatura'] },
  { href: '/maestros',   label: 'Maestros',   icon: 'settings', roles: ['admin', 'finanzas', 'jefatura'] },
];
