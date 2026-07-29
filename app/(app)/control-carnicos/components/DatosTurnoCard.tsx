'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { Responsable } from '@/types/database';

const field: CSSProperties = {
  width: '100%', border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '8px 11px',
  fontSize: '14px', background: 'var(--bg)', color: 'var(--tx)', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
};

const label: CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ts)',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px',
};

export default function DatosTurnoCard({
  title = 'Datos del turno',
  fecha, onFecha, responsableId, onResponsable, responsables,
  children,
  showObservacion = true, observacion = '', onObservacion, observacionRequerida = false,
}: {
  title?: string;
  fecha: string;
  onFecha: (value: string) => void;
  responsableId: string;
  onResponsable: (value: string) => void;
  responsables: Responsable[];
  /** Campos adicionales especificos de cada pestana (ej. Bodega, Movimiento, Subtipo, Tipo). Se renderizan despues de Responsable y antes de Observacion. */
  children?: ReactNode;
  showObservacion?: boolean;
  observacion?: string;
  onObservacion?: (value: string) => void;
  observacionRequerida?: boolean;
}) {
  const respActual = responsables.find(r => r.id === responsableId);

  return (
    <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <p style={{ fontFamily: 'Syne, sans-serif', fontSize: '12px', fontWeight: 800, color: 'var(--ts)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
        {title}
      </p>

      <div>
        <label style={label}>Fecha</label>
        <input type="date" value={fecha} onChange={e => onFecha(e.target.value)} style={field} />
      </div>

      <div>
        <label style={label}>Responsable <span style={{ color: 'var(--rd)' }}>*</span></label>
        {respActual ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '9px', border: '1.5px solid var(--tl)', background: '#ECFDF5' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, background: respActual.color_hex ?? 'var(--ac)', color: '#fff', fontSize: '11px', fontWeight: 700 }}>
              {respActual.iniciales ?? respActual.nombre.slice(0, 2)}
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600, flex: 1, color: '#065F46', minWidth: 0 }}>{respActual.nombre}</span>
            <button type="button" onClick={() => onResponsable('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6EE7B7', fontSize: '16px', padding: '2px' }}>x</button>
          </div>
        ) : (
          <select value={responsableId} onChange={e => onResponsable(e.target.value)} style={{ ...field, color: responsableId ? 'var(--tx)' : 'var(--ts)' }}>
            <option value="">Seleccionar responsable...</option>
            {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        )}
      </div>

      {children}

      {showObservacion && (
        <div>
          <label style={label}>
            Observacion {observacionRequerida ? <span style={{ color: 'var(--rd)' }}>*</span> : <span style={{ textTransform: 'none', fontWeight: 400 }}>(opcional)</span>}
          </label>
          <textarea
            value={observacion}
            onChange={e => onObservacion?.(e.target.value)}
            rows={2}
            style={{ ...field, resize: 'vertical', minHeight: '64px', lineHeight: 1.45 }}
            placeholder={observacionRequerida ? 'Describe el turno (obligatorio)' : 'Opcional'}
          />
        </div>
      )}
    </section>
  );
}
