// Cálculos del módulo Alertas: funciones puras, se derivan siempre de los datos (nunca valores fijos).

import type { Alerta, EstadoRevision, GrupoCategoria, VolumenUsuario } from './types';
import { CATEGORIA_GRUPO } from './catalogo';

export const GRUPOS: GrupoCategoria[] = ['Cantidad / Unidad', 'Fechas', 'Datos maestros', 'Otros'];

export function contarPorGrupo(alertas: Alerta[]): Record<GrupoCategoria, number> {
  const out = Object.fromEntries(GRUPOS.map(g => [g, 0])) as Record<GrupoCategoria, number>;
  for (const a of alertas) out[CATEGORIA_GRUPO[a.categoria]]++;
  return out;
}

export function contarPorEstado(alertas: Alerta[]): Record<EstadoRevision, number> {
  const out: Record<EstadoRevision, number> = { PENDIENTE: 0, ERROR_CONFIRMADO: 0, DATO_CORRECTO: 0, CORREGIDO: 0 };
  for (const a of alertas) out[a.estado]++;
  return out;
}

export interface MetricaUsuario {
  usuario: string;
  alertas: number;
  movimientos: number | null;
  tasa: number | null;      // alertas / movimientos × 100
}

// Dato operacional con contexto de volumen (no es un ranking de desempeño)
export function metricasPorUsuario(alertas: Alerta[], volumen: VolumenUsuario[]): MetricaUsuario[] {
  const conteo = new Map<string, number>();
  for (const a of alertas) conteo.set(a.movimiento.created_by, (conteo.get(a.movimiento.created_by) ?? 0) + 1);
  return [...conteo].map(([usuario, n]) => {
    const mov = volumen.find(v => v.usuario === usuario)?.movimientos ?? null;
    return { usuario, alertas: n, movimientos: mov, tasa: mov ? (n / mov) * 100 : null };
  }).sort((a, b) => a.usuario.localeCompare(b.usuario, 'es'));
}

// ── Rango de fechas de los filtros (relativo al "hoy" del escenario) ──
export type RangoFecha = 'HOY' | '7D' | 'MES' | 'MES_ANTERIOR' | 'TODO';

export function enRango(fecha: string, rango: RangoFecha, hoy: string): boolean {
  if (rango === 'TODO') return true;
  if (rango === 'HOY') return fecha === hoy;
  const [y, m, dia] = hoy.split('-').map(Number);
  if (rango === 'MES') return fecha.startsWith(hoy.slice(0, 7));
  if (rango === 'MES_ANTERIOR') {
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    return fecha.startsWith(prev);
  }
  // Últimos 7 días (en UTC para no correr el día por zona horaria)
  const desde = new Date(Date.UTC(y, m - 1, dia - 6)).toISOString().slice(0, 10);
  return fecha >= desde && fecha <= hoy;
}

// Formatos locales (dd/mm/aaaa)
export function fmtFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function fmtFechaHora(iso: string): string {
  return `${fmtFecha(iso)} ${iso.slice(11, 16)}`;
}

export function fmtPct(n: number | null): string {
  return n == null ? '—' : `${n.toLocaleString('es-CL', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}
