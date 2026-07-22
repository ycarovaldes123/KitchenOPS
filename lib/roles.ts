export type RolType = 'cocina' | 'economo' | 'bodega' | 'jefatura' | 'finanzas' | 'admin';

export const RMAP: Record<string, RolType> = {
  'ycaro@cerveceriakunstmann.cl':         'admin',
  'jsepulveda@cerveceriakunstmann.cl':    'admin',
  'ddelgado@cerveceriakunstmann.cl':      'finanzas',
  'caravena@cerveceriakunstmann.cl':      'finanzas',
  'fcaro@cerveceriakunstmann.cl':         'jefatura',
  'jmendez@cerveceriakunstmann.cl':       'bodega',
  'chefstorobayo@cerveceriakunstmann.cl': 'cocina',
};

export const RUTAS_ROL: Record<RolType, string[]> = {
  admin:    ['/produccion', '/colacion', '/frutas', '/inventario', '/mermas', '/historial', '/ventas', '/dashboard', '/kpis', '/costos', '/export', '/maestros'],
  finanzas: ['/dashboard', '/produccion', '/colacion', '/frutas', '/inventario', '/mermas', '/historial', '/ventas', '/kpis', '/costos', '/export', '/maestros'],
  jefatura: ['/historial', '/ventas', '/kpis', '/costos'],
  bodega:   ['/mermas', '/ventas'],
  economo:  ['/colacion', '/frutas', '/inventario', '/mermas', '/historial', '/ventas'],
  cocina:   ['/produccion', '/mermas', '/ventas', '/kpis'],
};

export const RUTA_INICIO: Record<RolType, string> = {
  admin:    '/kpis',
  finanzas: '/kpis',
  jefatura: '/historial',
  bodega:   '/mermas',
  economo:  '/inventario',
  cocina:   '/produccion',
};

export const ROL_LABEL: Record<RolType, string> = {
  admin:    'Administrador',
  finanzas: 'Finanzas',
  jefatura: 'Jefatura Cocina',
  bodega:   'Bodega',
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
  { href: '/produccion', label: 'Produccion', icon: 'flame',    roles: ['admin', 'cocina'] },
  { href: '/colacion',   label: 'Colacion',   icon: 'utensils', roles: ['admin', 'economo'] },
  { href: '/frutas',     label: 'Frutas',     icon: 'utensils', roles: ['admin', 'economo', 'finanzas'] },
  { href: '/inventario', label: 'Toma Inventario', icon: 'grid', roles: ['admin', 'economo', 'finanzas'] },
  { href: '/mermas',     label: 'Mermas',     icon: 'trending', roles: ['admin', 'cocina', 'economo', 'bodega'] },
  { href: '/historial',  label: 'Historial',  icon: 'clock',    roles: ['admin', 'jefatura', 'finanzas', 'economo'] },
  { href: '/ventas',     label: 'Ventas',     icon: 'barchart', roles: ['admin', 'cocina', 'finanzas', 'jefatura', 'economo', 'bodega'] },
  { href: '/dashboard',  label: 'Dashboard',  icon: 'grid',     roles: ['admin', 'finanzas'] },
  { href: '/kpis',       label: 'KPIs',       icon: 'barchart', roles: ['admin', 'finanzas', 'jefatura', 'cocina'] },
  { href: '/costos',     label: 'Costos',     icon: 'dollar',   roles: ['admin', 'finanzas', 'jefatura'] },
  { href: '/export',     label: 'Exportar',   icon: 'download', roles: ['admin', 'finanzas'] },
  { href: '/maestros',   label: 'Maestros',   icon: 'settings', roles: ['admin', 'finanzas'] },
];
