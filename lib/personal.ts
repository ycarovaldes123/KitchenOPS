import { NAV_ITEMS, RMAP, RUTAS_ROL, type RolType } from '@/lib/roles';
import { PERMISOS, type Modulo } from '@/lib/permissions';

// Tablas donde cada registro guarda quien lo hizo (responsable_id): de ahi sale "Ultima actividad"
// y se valida que no se elimine a alguien con historial.
export const TABLAS_ACTIVIDAD = ['produccion', 'mermas', 'colacion', 'frutas', 'inventarios', 'carnicos_movimientos', 'carnicos_inventarios'];

// ── Rol = area o funcion laboral (no da acceso por si mismo) ──
export type Area = 'cocina' | 'finanzas' | 'jefatura' | 'economato' | 'pasteleria' | 'bodega' | 'gerencia' | 'operaciones';

export const AREAS: { value: Area; label: string; color: string; bg: string }[] = [
  { value: 'cocina',     label: 'Cocina',     color: '#C2410C', bg: '#FFF0E9' },
  { value: 'finanzas',   label: 'Finanzas',   color: '#1D4ED8', bg: '#EFF6FF' },
  { value: 'jefatura',   label: 'Jefatura',   color: '#B91C1C', bg: '#FDECE7' },
  { value: 'economato',  label: 'Economato',  color: '#0E7490', bg: '#ECFEFF' },
  { value: 'pasteleria', label: 'Pastelería', color: '#A21CAF', bg: '#FAF0FC' },
  { value: 'bodega',     label: 'Bodega',     color: '#92400E', bg: '#FEF3C7' },
  { value: 'gerencia',   label: 'Gerencia',   color: '#475569', bg: '#F1F5F9' },
  { value: 'operaciones', label: 'Operaciones', color: '#4338CA', bg: '#EEF2FF' },
];

// ── Acceso = nivel dentro de KitchenOps ──
export type NivelAcceso = 'operativo' | 'usuario' | 'jefatura' | 'administrador';

export const NIVELES: { value: NivelAcceso; label: string; icon: string }[] = [
  { value: 'operativo',     label: 'Operativo',     icon: 'user' },
  { value: 'usuario',       label: 'Usuario',       icon: 'user' },
  { value: 'jefatura',      label: 'Jefatura',      icon: 'crown' },
  { value: 'administrador', label: 'Administrador', icon: 'shield' },
];

// Modulos que aparecen en la matriz de permisos (mismo orden e iconos que el sidebar).
const MODULO_POR_RUTA: Record<string, Modulo> = {
  '/produccion': 'produccion', '/colacion': 'colacion', '/mermas': 'mermas', '/frutas': 'frutas',
  '/inventario': 'inventario', '/control-carnicos': 'controlCarnicos', '/historial': 'historial',
  '/ventas': 'ventas', '/dashboard': 'dashboard', '/kpis': 'kpis', '/costos': 'costos',
  '/export': 'export', '/maestros': 'maestros',
};
const ORDEN_MODULOS = ['/produccion', '/colacion', '/mermas', '/frutas', '/inventario', '/control-carnicos',
  '/historial', '/ventas', '/dashboard', '/kpis', '/costos', '/export', '/maestros'];

const LABEL_MODULO: Record<string, string> = {
  '/produccion': 'Producción', '/colacion': 'Colación', '/control-carnicos': 'Control Cárnicos',
};

export const MODULOS_PERMISO: { key: Modulo; href: string; label: string; icon: string }[] =
  ORDEN_MODULOS.map(href => {
    const nav = NAV_ITEMS.find(n => n.href === href);
    return { key: MODULO_POR_RUTA[href], href, label: LABEL_MODULO[href] ?? nav?.label ?? href, icon: nav?.icon ?? 'grid' };
  });

export type PermisoVE = { ver: boolean; editar: boolean };
export type PermisosPersona = Record<string, PermisoVE>;

/** Regla: Editar requiere Visualizacion. */
export function normalizarPermisos(raw: unknown): PermisosPersona {
  const out: PermisosPersona = {};
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Partial<PermisoVE> | undefined>;
  for (const m of MODULOS_PERMISO) {
    const editar = !!src[m.key]?.editar;
    out[m.key] = { ver: editar || !!src[m.key]?.ver, editar };
  }
  return out;
}

/** Permisos que entrega el perfil de la cuenta (lista fija por email o perfil asignado en Personal). */
export function permisosPorEmail(email: string | null | undefined, perfil?: RolType | null): PermisosPersona {
  const rol = (RMAP[email ?? ''] ?? perfil ?? undefined) as RolType | undefined;
  const out: PermisosPersona = {};
  for (const m of MODULOS_PERMISO) {
    const p = rol ? PERMISOS[rol][m.key] : null;
    const ver = !!p?.ver && !!rol && RUTAS_ROL[rol].includes(m.href);
    out[m.key] = { ver, editar: ver && !!(p?.registrar || p?.editar || p?.eliminar) };
  }
  return out;
}

export function areaDesdeRol(rol: string | null | undefined): Area | null {
  const r = String(rol ?? '').toLowerCase();
  if (r === 'economo') return 'economato';
  return (AREAS.some(a => a.value === r) ? r : null) as Area | null;
}

export function nivelPorEmail(email: string | null | undefined): NivelAcceso {
  const rol = RMAP[email ?? ''];
  if (rol === 'admin') return 'administrador';
  if (rol === 'jefatura' || rol === 'gerencia') return 'jefatura';
  if (rol === 'finanzas') return 'usuario';
  return 'operativo';
}

/** Valor para la columna `rol` heredada al crear personal (se sigue usando en Historial). */
export function rolDesdeArea(area: Area | null): string {
  if (area === 'economato') return 'economo';
  if (area === 'pasteleria') return 'PASTELERIA';
  return area ?? 'cocina';
}

export function tieneAccesoSistema(email: string | null | undefined) {
  return !!RMAP[email ?? ''];
}

export interface PersonaAdmin {
  id: string;
  nombre: string;
  email: string | null;
  rol: string;
  activo: boolean;
  color_hex: string | null;
  iniciales: string | null;
  area: Area | null;
  nivel_acceso: NivelAcceso;
  permisos: PermisosPersona;
  permisos_personalizados: boolean;
  con_acceso: boolean;
  /** Existe una cuenta de ingreso (Supabase Auth) para su email. */
  cuenta_existe: boolean;
  /** Perfil del sistema con el que ingresa (define los modulos reales). */
  perfil: RolType | null;
  /** El perfil viene de la lista fija del codigo (lib/roles.ts) y no se cambia desde Personal. */
  perfil_fijo: boolean;
  /** Cantidad de personas que comparten este email (p. ej. la cuenta de cocina). */
  comparten_email: number;
  ultima_actividad: string | null;
}

export type ResponsableRow = {
  id: string; nombre: string; email: string | null; rol: string; activo: boolean;
  color_hex: string | null; iniciales: string | null;
  area?: string | null; nivel_acceso?: string | null; permisos?: unknown;
};

export function columnaFaltante(error: { message?: string } | null) {
  const m = (error?.message ?? '').toLowerCase();
  return (m.includes('area') || m.includes('nivel_acceso') || m.includes('permisos')) && (m.includes('column') || m.includes('does not exist'));
}

export function inicialesDe(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : partes[0]?.[1] ?? '')).toUpperCase();
}

export interface CuentaResumen { rol: RolType | null; fijo: boolean }

export function aPersona(r: ResponsableRow, ultima: Map<string, string>, cuenta?: CuentaResumen | null, compartenEmail = 1): PersonaAdmin {
  const perfil = RMAP[r.email ?? ''] ?? cuenta?.rol ?? null;
  const area = (AREAS.some(a => a.value === r.area) ? r.area : areaDesdeRol(r.rol)) as Area | null;
  const nivel = (NIVELES.some(n => n.value === r.nivel_acceso) ? r.nivel_acceso : nivelPorEmail(r.email)) as NivelAcceso;
  const personalizados = r.permisos != null && typeof r.permisos === 'object';
  return {
    id: r.id, nombre: r.nombre, email: r.email, rol: r.rol, activo: r.activo,
    color_hex: r.color_hex, iniciales: r.iniciales,
    area, nivel_acceso: nivel,
    permisos: personalizados ? normalizarPermisos(r.permisos) : permisosPorEmail(r.email, perfil),
    permisos_personalizados: personalizados,
    con_acceso: !!perfil && (!!cuenta || tieneAccesoSistema(r.email)),
    cuenta_existe: !!cuenta,
    perfil,
    perfil_fijo: !!RMAP[r.email ?? ''],
    comparten_email: compartenEmail,
    ultima_actividad: ultima.get(r.id) ?? null,
  };
}
