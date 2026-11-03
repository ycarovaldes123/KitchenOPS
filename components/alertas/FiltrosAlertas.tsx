'use client';

import NavIcon from '@/components/layout/NavIcon';
import { INICIO_MODULO } from '@/lib/alertas/catalogo';
import { fmtFecha, type RangoFecha } from '@/lib/alertas/metricas';
import type { EstadoRevision, ModuloAlerta, NivelAlerta } from '@/lib/alertas/types';
import { ESTADO_LABEL } from './AlertasChips';

export interface Filtros {
  texto: string;
  modulo: ModuloAlerta | '';
  estado: EstadoRevision | '';
  nivel: NivelAlerta | '';
  rango: RangoFecha;
  desde: string;   // solo con rango PERSONALIZADO (YYYY-MM-DD)
  hasta: string;
}

// Por defecto: lo que falta revisar este mes
export const FILTROS_INICIALES: Filtros = { texto: '', modulo: '', estado: 'PENDIENTE', nivel: '', rango: 'MES', desde: '', hasta: '' };

export const RANGO_LABEL: Record<RangoFecha, string> = {
  HOY: 'Hoy', '7D': 'Últimos 7 días', MES: 'Este mes', MES_ANTERIOR: 'Mes anterior', TODO: 'Desde septiembre', PERSONALIZADO: 'Personalizado',
};

// Texto del período para los indicadores (ej. "01/10/2026 – 15/10/2026")
export function etiquetaRango(f: Filtros): string {
  if (f.rango !== 'PERSONALIZADO') return RANGO_LABEL[f.rango];
  const [a, b] = f.desde && f.hasta && f.desde > f.hasta ? [f.hasta, f.desde] : [f.desde, f.hasta];
  if (a && b) return a === b ? fmtFecha(a) : `${fmtFecha(a)} – ${fmtFecha(b)}`;
  if (a) return `desde ${fmtFecha(a)}`;
  if (b) return `hasta ${fmtFecha(b)}`;
  return 'Personalizado';
}
// Opciones visibles: el módulo parte en septiembre 2026, por eso no se ofrece "Mes anterior"
const RANGOS: RangoFecha[] = ['HOY', '7D', 'MES', 'TODO', 'PERSONALIZADO'];

interface Props {
  filtros: Filtros;
  onChange: (f: Filtros) => void;
  modulos: ModuloAlerta[];
  visibles: number;
  hoy: string;
}

export default function FiltrosAlertas({ filtros, onChange, modulos, visibles, hoy }: Props) {
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => onChange({ ...filtros, [k]: v });
  // Al pasar a Personalizado se parte del mes en curso para no mostrar la tabla vacía
  const cambiarRango = (rango: RangoFecha) => onChange(rango === 'PERSONALIZADO' && !filtros.desde && !filtros.hasta
    ? { ...filtros, rango, desde: hoy ? `${hoy.slice(0, 7)}-01` : '', hasta: hoy }
    : { ...filtros, rango });
  return (
    <div className="alr-filters">
      <div className="rpp-search">
        <NavIcon name="search" size={16} />
        <input
          value={filtros.texto}
          onChange={e => set('texto', e.target.value)}
          placeholder="Buscar producto, usuario, regla…"
          aria-label="Buscar alerta por producto, código, regla, módulo, usuario o detalle"
        />
        {filtros.texto && (
          <button type="button" className="rpp-search-clear" aria-label="Limpiar búsqueda" onClick={() => set('texto', '')}>
            <NavIcon name="x" size={14} />
          </button>
        )}
      </div>
      <select className="alr-select" aria-label="Módulo" value={filtros.modulo} onChange={e => set('modulo', e.target.value as Filtros['modulo'])}>
        <option value="">Todos los módulos</option>
        {modulos.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select className="alr-select" aria-label="Estado" value={filtros.estado} onChange={e => set('estado', e.target.value as Filtros['estado'])}>
        <option value="">Todos los estados</option>
        {(Object.keys(ESTADO_LABEL) as EstadoRevision[]).map(s => <option key={s} value={s}>{ESTADO_LABEL[s]}</option>)}
      </select>
      <select className="alr-select" aria-label="Fecha" value={filtros.rango} onChange={e => cambiarRango(e.target.value as RangoFecha)}>
        {RANGOS.map(r => <option key={r} value={r}>{RANGO_LABEL[r]}</option>)}
      </select>
      {filtros.rango === 'PERSONALIZADO' && (
        <div className="alr-rango" role="group" aria-label="Rango de fechas personalizado">
          <label>
            <span>Desde</span>
            <input type="date" className="alr-select alr-date" value={filtros.desde} min={INICIO_MODULO} max={filtros.hasta || hoy || undefined}
              onChange={e => set('desde', e.target.value)} />
          </label>
          <label>
            <span>Hasta</span>
            <input type="date" className="alr-select alr-date" value={filtros.hasta} min={filtros.desde || INICIO_MODULO} max={hoy || undefined}
              onChange={e => set('hasta', e.target.value)} />
          </label>
        </div>
      )}
      <span className="alr-count" aria-live="polite">{visibles} alerta{visibles !== 1 ? 's' : ''}</span>
    </div>
  );
}
