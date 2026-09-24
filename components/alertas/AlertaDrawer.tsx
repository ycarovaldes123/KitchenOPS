'use client';

import { useEffect } from 'react';
import NavIcon from '@/components/layout/NavIcon';
import { fmtFecha, fmtFechaHora } from '@/lib/alertas/metricas';
import type { Alerta, EstadoRevision } from '@/lib/alertas/types';
import { ESTADO_LABEL, EstadoChip, NivelChip } from './AlertasChips';

interface Props {
  alerta: Alerta;
  onClose: () => void;
  onEstado: (estado: EstadoRevision) => void;
}

// Revisar una alerta la marca; nunca la elimina (todo queda en el historial).
const ACCIONES: { estado: EstadoRevision; label: string; icono: string }[] = [
  { estado: 'ERROR_CONFIRMADO', label: 'Es error', icono: 'circle-alert' },
  { estado: 'DATO_CORRECTO', label: 'Dato correcto', icono: 'check' },
  { estado: 'CORREGIDO', label: 'Corregido', icono: 'circle-check' },
];
const MAX_EVIDENCIA = 3;

export default function AlertaDrawer({ alerta, onClose, onEstado }: Props) {
  const m = alerta.movimiento;
  const evidencia = [...alerta.evidencia].sort((a, b) => Number(!!b.destacado) - Number(!!a.destacado)).slice(0, MAX_EVIDENCIA);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="rpp-drawer-backdrop" onClick={onClose} />
      <aside className="rpp rpp-drawer alr-drawer" role="dialog" aria-modal="true" aria-label={`${alerta.titulo}: ${alerta.registro}`}>
        <div className="rpp-drawer-bar">
          <span className="alr-d-kicker" style={{ margin: 0 }}>{alerta.titulo}</span>
          <button type="button" className="rpp-icon-btn" aria-label="Cerrar detalle" onClick={onClose}>
            <NavIcon name="x" size={18} />
          </button>
        </div>

        <div className="alr-drawer-body">
          <header>
            <h2 className="alr-d-title">{alerta.registro}</h2>
            <p className="alr-d-meta">{alerta.modulo} · {fmtFecha(m.fecha_movimiento)} · {m.created_by}</p>
            <div className="alr-d-chips"><NivelChip nivel={alerta.nivel} /><EstadoChip estado={alerta.estado} /></div>
          </header>

          <p className="alr-d-expl">{alerta.explicacion}</p>

          <div className="alr-evid">
            {evidencia.map(e => (
              <div key={e.label} className={e.destacado ? 'is-key' : undefined}>
                <small>{e.label}</small>
                <b>{e.valor}</b>
              </div>
            ))}
          </div>

          <div className="alr-d-actions-row" role="group" aria-label="Revisar alerta">
            {ACCIONES.map(a => (
              <button
                key={a.estado}
                type="button"
                className={`rpp-btn rpp-btn-sm${alerta.estado === a.estado ? ' is-current' : ''}`}
                onClick={() => onEstado(a.estado)}
                aria-pressed={alerta.estado === a.estado}
              >
                <NavIcon name={a.icono} size={14} /> {a.label}
              </button>
            ))}
          </div>

          <details className="alr-details">
            <summary><NavIcon name="eye" size={15} /> Ver movimiento e historial</summary>
            <dl className="alr-kv">
              <dt>Fecha movimiento</dt><dd>{fmtFecha(m.fecha_movimiento)}</dd>
              <dt>Registrado</dt><dd>{fmtFechaHora(m.created_at)}</dd>
              <dt>Por</dt><dd>{m.created_by}</dd>
              {m.cantidad && (<><dt>Cantidad</dt><dd className="mono">{m.cantidad}</dd></>)}
              {m.motivo && (<><dt>Motivo</dt><dd>{m.motivo}</dd></>)}
              {m.observacion && (<><dt>Observación</dt><dd>“{m.observacion}”</dd></>)}
              <dt>Registro</dt><dd className="mono">{m.id}</dd>
              <dt>Regla</dt><dd className="mono">{alerta.regla} · Observar</dd>
            </dl>
            <ul className="alr-hist">
              {alerta.historial.map((h, i) => (
                <li key={i}>
                  <div>{ESTADO_LABEL[h.estado]}<small>{fmtFechaHora(h.fecha)} · {h.usuario}</small></div>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </aside>
    </>
  );
}
