'use client';

import NavIcon from '@/components/layout/NavIcon';
import { formatCostoUnitario, formatCantidad } from '@/lib/costo-receta-pp';
import type { PPReceta } from './types';

// Ficha de la receta seleccionada: códigos → nombre → estado → acciones → KPIs → ingredientes → total.
// Se usa en el panel lateral (escritorio) y en el drawer (tablet / móvil).

export function RecetaEstadoChip({ receta }: { receta: Pick<PPReceta, 'estado' | 'activo'> }) {
  if (receta.activo === false) return <span className="rpp-chip rpp-chip-off">Inactivo</span>;
  if (receta.estado === 'ACTIVO') return <span className="rpp-chip rpp-chip-ok">Activo</span>;
  if (receta.estado === 'INCOMPLETO') return <span className="rpp-chip rpp-chip-error" title="Hay ingredientes sin producto vinculado">Incompleto</span>;
  return <span className="rpp-chip rpp-chip-warn" title="Hay ingredientes con costo 0">Pendiente</span>;
}

interface Props {
  receta: PPReceta;
  duplicada: boolean;
  busy: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

export default function RecetaPPFicha({ receta, duplicada, busy, onEdit, onCopy, onToggle, onDelete }: Props) {
  const ingredientes = [...(receta.ingredientes ?? [])].sort((a, b) => a.orden - b.orden);
  const um = receta.unidad_rendimiento;

  return (
    <article className="rpp-card rpp-ficha" aria-label={`Ficha ${receta.nombre}`}>
      <header className="rpp-ficha-head">
        <p className="rpp-ficha-codes">
          <span>{receta.codigo_receta}</span>
          {receta.codigo_pp && (<><span aria-hidden="true">→</span><span title="Código PP (Softland)">{receta.codigo_pp}</span></>)}
        </p>
        <h2 className="rpp-ficha-title">{receta.nombre}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <RecetaEstadoChip receta={receta} />
          {duplicada && <span className="rpp-tag" style={{ marginLeft: 0 }} title="Otra receta activa tiene el mismo nombre o código PP">Posible duplicada</span>}
        </div>

        <div className="rpp-ficha-actions">
          <button type="button" className="rpp-btn rpp-btn-sm rpp-btn-accent" onClick={onEdit}>
            <NavIcon name="edit" size={14} /> Editar
          </button>
          <button type="button" className="rpp-btn rpp-btn-sm" onClick={onCopy}>
            <NavIcon name="copy" size={14} /> Copiar
          </button>
          <button type="button" className="rpp-btn rpp-btn-sm" onClick={onToggle} disabled={busy}>
            <NavIcon name={receta.activo === false ? 'check' : 'ban'} size={14} />
            {receta.activo === false ? 'Activar' : 'Desactivar'}
          </button>
          <button type="button" className="rpp-btn rpp-btn-sm rpp-btn-danger" onClick={onDelete} disabled={busy}>
            <NavIcon name="trash" size={14} /> Eliminar
          </button>
        </div>
      </header>

      <div className="rpp-ficha-body">
        <div className="rpp-kpis">
          <div className="rpp-kpi">
            <p className="rpp-kpi-label">Rendimiento</p>
            <p className="rpp-kpi-value">{formatCantidad(receta.rendimiento)}<small>{um}</small></p>
          </div>
          <div className="rpp-kpi">
            <p className="rpp-kpi-label">Costo unitario</p>
            <p className="rpp-kpi-value is-accent">
              {receta.costo_unitario_calculado > 0
                ? <>{formatCostoUnitario(receta.costo_unitario_calculado)}<small>/ {um}</small></>
                : <span className="rpp-muted">Sin calcular</span>}
            </p>
          </div>
        </div>

        <p className="rpp-section-title">Ingredientes ({ingredientes.length})</p>
        {ingredientes.length === 0 ? (
          <p className="rpp-muted">Sin ingredientes.</p>
        ) : (
          <ul className="rpp-ing-list">
            {ingredientes.map(ing => (
              <li key={ing.id} className={`rpp-ing${ing.sin_codigo ? ' is-error' : ''}`}>
                <div className="rpp-ing-main">
                  <p className="rpp-ing-name" title={ing.nombre_ingrediente}>{ing.nombre_ingrediente}</p>
                  <p className="rpp-ing-meta">
                    {formatCantidad(ing.cantidad)} {ing.unidad_medida}
                    {ing.codigo_ingrediente && <span> · {ing.codigo_ingrediente}</span>}
                    {ing.sin_codigo && <span className="rpp-flag is-error">Sin producto</span>}
                    {!ing.sin_codigo && ing.sin_costo && <span className="rpp-flag is-warn">Sin costo</span>}
                  </p>
                </div>
                <span className="rpp-ing-cost">
                  {ing.costo_linea_calculado > 0 ? `$${Math.round(ing.costo_linea_calculado).toLocaleString('es-CL')}` : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="rpp-total">
          <span>Costo total receta</span>
          <span>{receta.costo_total_calculado > 0 ? `$${Math.round(receta.costo_total_calculado).toLocaleString('es-CL')}` : '—'}</span>
        </div>
      </div>
    </article>
  );
}
