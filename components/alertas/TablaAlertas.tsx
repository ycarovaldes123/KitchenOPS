'use client';

import { useState } from 'react';
import NavIcon from '@/components/layout/NavIcon';
import { fmtFecha } from '@/lib/alertas/metricas';
import type { Alerta } from '@/lib/alertas/types';
import { EstadoChip, NivelChip } from './AlertasChips';

const POR_PAGINA = 50;

interface Props {
  alertas: Alerta[];
  seleccionada: string | null;
  onSelect: (a: Alerta) => void;
}

// Columnas mínimas: nivel · qué pasó · dónde · cuándo · estado. El resto está en el panel de detalle.
export default function TablaAlertas({ alertas, seleccionada, onSelect }: Props) {
  const [limite, setLimite] = useState(POR_PAGINA);
  const visibles = alertas.slice(0, limite);

  return (
    <div className="rpp-card rpp-table-wrap">
      <table className="rpp-table alr-table">
        <thead>
          <tr>
            <th scope="col">Nivel</th>
            <th scope="col">Alerta</th>
            <th scope="col" className="col-opt">Módulo</th>
            <th scope="col">Fecha</th>
            <th scope="col" className="col-opt">Estado</th>
            <th className="rpp-chevron" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {alertas.length === 0 && (
            <tr><td colSpan={6} className="rpp-empty">Sin alertas para los filtros seleccionados</td></tr>
          )}
          {visibles.map(a => {
            const sel = a.id === seleccionada;
            return (
              <tr
                key={a.id}
                tabIndex={0}
                aria-selected={sel}
                className={`rpp-row${sel ? ' is-selected' : ''}`}
                onClick={() => onSelect(a)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(a); } }}
              >
                <td><NivelChip nivel={a.nivel} /></td>
                <td className="alr-registro">
                  {a.registro}
                  <span className="alr-sub-line">{a.detalle}</span>
                </td>
                <td className="col-opt">{a.modulo}</td>
                <td className="rpp-num">{fmtFecha(a.fecha)}</td>
                <td className="col-opt"><EstadoChip estado={a.estado} /></td>
                <td className="rpp-chevron"><NavIcon name="chevron" size={16} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {alertas.length > limite && (
        <div className="alr-more">
          <button type="button" className="rpp-btn rpp-btn-sm" onClick={() => setLimite(l => l + POR_PAGINA)}>
            Mostrar {Math.min(POR_PAGINA, alertas.length - limite)} más · quedan {alertas.length - limite}
          </button>
        </div>
      )}
    </div>
  );
}
