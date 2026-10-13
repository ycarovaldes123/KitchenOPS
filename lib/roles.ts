export type RolType = 'cocina' | 'economo' | 'bodega' | 'jefatura' | 'finanzas' | 'admin' | 'gerencia';

export const RMAP: Record<string, RolType> = {
  'ycaro@cerveceriakunstmann.cl':         'admin',
  'jsepulveda@cerveceriakunstmann.cl':    'admin',
  'ddelgado@cerveceriakunstmann.cl':      'finanzas',
  'caravena@cerveceriakunstmann.cl':      'finanzas',
  'fcaro@cerveceriakunstmann.cl':         'jefatura',
  'jmendez@cerveceriakunstmann.cl':       'bodega',
  'chefstorobayo@cerveceriakunstmann.cl': 'cocina',
  'mdelannoy@cerveceriakunstmann.cl':     'gerencia',
};

export const RUTAS_ROL: Record<RolType, string[]> = {
  admin:    ['/produccion', '/colacion', '/mermas', '/frutas', '/inventario', '/control-carnicos', '/historial', '/ventas', '/dashboard', '/kpis', '/costos', '/export', '/maestros'],
  finanzas: ['/dashboard', '/produccion', '/colacion', '/frutas', '/inventario', '/mermas', '/historial', '/ventas', '/kpis', '/costos', '/export', '/maestros'],
  jefatura: ['/historial', '/ventas', '/kpis', '/costos', '/control-carnicos'],
  bodega:   ['/mermas', '/ventas', '/historial', '/control-carnicos'],
  economo:  ['/colacion', '/frutas', '/inventario', '/mermas', '/historial', '/ventas'],
  cocina:   ['/produccion', '/mermas', '/ventas', '/kpis', '/historial', '/costos'],
  // Gerente de Operaciones: solo consulta/visualizacion, sin registrar/editar/eliminar en ningun modulo.
  gerencia: ['/historial', '/ventas', '/costos', '/control-carnicos', '/kpis'],
};

// Pantalla Inicio comun: grilla de modulos a los que el rol tiene acceso. "/" y el logo
// KitchenOps llevan aca; cada rol sigue viendo solo sus modulos (se filtran con RUTAS_ROL).
export const RUTA_INICIO_COMUN = '/inicio';

// Modulo principal de cada rol (fallback si intenta entrar a un modulo sin permiso).
export const RUTA_INICIO: Record<RolType, string> = {
  admin:    '/kpis',
  finanzas: '/kpis',
  jefatura: '/historial',
  bodega:   '/mermas',
  economo:  '/inventario',
  cocina:   '/produccion',
  gerencia: '/historial',
};

// Nombre para mostrar en el saludo de la pantalla Inicio ("Hola, ..."). Si el correo no esta
// aca, se usa la parte antes del @. La cuenta de cocina es compartida por varias personas.
export const NOMBRE_POR_EMAIL: Record<string, string> = {
  'ycaro@cerveceriakunstmann.cl':         'Yonatan',
  'jsepulveda@cerveceriakunstmann.cl':    'Javiera',
  'ddelgado@cerveceriakunstmann.cl':      'Daniel',
  'caravena@cerveceriakunstmann.cl':      'Cecilia',
  'fcaro@cerveceriakunstmann.cl':         'Felipe',
  'jmendez@cerveceriakunstmann.cl':       'Joel',
  'chefstorobayo@cerveceriakunstmann.cl': 'Chefs',
  'mdelannoy@cerveceriakunstmann.cl':     'Mauricio',
};

export const ROL_LABEL: Record<RolType, string> = {
  admin:    'Administrador',
  finanzas: 'Finanzas',
  jefatura: 'Jefatura Cocina',
  bodega:   'Bodega',
  economo:  'Economo',
  cocina:   'Cocina',
  gerencia: 'Gerente de Operaciones',
};

export interface NavItem {
  href:  string;
  label: string;
  icon:  string;
  roles: RolType[];
  descripcion?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/produccion', label: 'Produccion', icon: 'cooking-pot',    roles: ['admin', 'cocina'], descripcion: 'Registro diario de PP y producción' },
  { href: '/colacion',   label: 'Colacion',   icon: 'utensils', roles: ['admin', 'economo'], descripcion: 'Inscripciones y costos de colación' },
  { href: '/frutas',     label: 'Frutas',     icon: 'apple', roles: ['admin', 'economo', 'finanzas'], descripcion: 'Control de frutas' },
  { href: '/inventario', label: 'Toma Inventario', icon: 'clipboard', roles: ['admin', 'economo', 'finanzas'], descripcion: 'Toma de inventario físico' },
  { href: '/control-carnicos', label: 'Control Carnicos', icon: 'beef', roles: ['admin', 'bodega', 'jefatura', 'gerencia'], descripcion: 'Ingresos, ventas, inventarios y cuadre de carnes' },
  { href: '/mermas',     label: 'Mermas',     icon: 'trending', roles: ['admin', 'cocina', 'economo', 'bodega'], descripcion: 'Rendimiento y mermas de verduras' },
  { href: '/historial',  label: 'Historial',  icon: 'clock',    roles: ['admin', 'jefatura', 'finanzas', 'economo', 'cocina', 'bodega', 'gerencia'], descripcion: 'Historial de registros' },
  { href: '/ventas',     label: 'Ventas',     icon: 'chart-column', roles: ['admin', 'cocina', 'finanzas', 'jefatura', 'economo', 'bodega', 'gerencia'], descripcion: 'Ventas Toteat por período' },
  { href: '/dashboard',  label: 'Dashboard',  icon: 'dashboard',     roles: ['admin', 'finanzas'], descripcion: 'KPIs y filtros por período' },
  { href: '/kpis',       label: 'KPIs',       icon: 'chart-line', roles: ['admin', 'finanzas', 'jefatura', 'cocina', 'gerencia'], descripcion: 'Indicadores operacionales' },
  { href: '/costos',     label: 'Costos',     icon: 'chef-hat', roles: ['admin', 'finanzas', 'jefatura', 'cocina', 'gerencia'], descripcion: 'Reportería de costos y fichas técnicas' },
  { href: '/export',     label: 'Exportar',   icon: 'file-down', roles: ['admin', 'finanzas'], descripcion: 'Exportar datos a Excel' },
  { href: '/maestros',   label: 'Maestros',   icon: 'settings', roles: ['admin', 'finanzas'], descripcion: 'PP, productos y personal' },
];
