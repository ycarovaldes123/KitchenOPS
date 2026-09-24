'use client';

import NavIcon from '@/components/layout/NavIcon';
import type { RangoFecha } from '@/lib/alertas/metricas';
import type { EstadoRevision, ModuloAlerta, NivelAlerta } from '@/lib/alertas/types';
import { ESTADO_LABEL } from './AlertasChips';

export interface Filtros {
  texto: string;
  modulo: ModuloAlerta | '';
  estado: EstadoRevision | '';
  nivel: NivelAlerta | '';
  rango: RangoFecha;
}

// Por defecto: lo que falta revisar este mes
export const FILTROS_INICIALES: Filtros = { texto: '', modulo: '', estado: 'PENDIENTE', nivel: '', rango: 'MES' };

export const RANGO_LABEL: Record<RangoFecha, string> = {
  HOY: 'Hoy', '7D': 'Últimos 7 días', MES: 'Este mes', MES_ANTERIOR: 'Mes anterior', TODO: 'Desde septiembre',
};
// Opciones visibles: el módulo parte en septiembre 2026, por eso no se ofrece "Mes anterior"
const RANGOS: RangoFecha[] = ['HOY', '7D', 'MES', 'TODO'];

interface Props {
  filtros: Filtros;
  onChange: (f: Filtros) => void;
  modulos: ModuloAlerta[];
  visibles: number;
}

export default function FiltrosAlertas({ filtros, onChange, modulos, visibles }: Props) {
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => onChange({ ...filtros, [k]: v });
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
      <select className="alr-select" aria-label="Fecha" value={filtros.rango} onChange={e => set('rango', e.target.value as RangoFecha)}>
        {RANGOS.map(r => <option key={r} value={r}>{RANGO_LABEL[r]}</option>)}
      </select>
      <span className="alr-count" aria-live="polite">{visibles} alerta{visibles !== 1 ? 's' : ''}</span>
    </div>
  );
}
