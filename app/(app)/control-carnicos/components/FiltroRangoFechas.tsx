'use client';

import type { CSSProperties } from 'react';
import type { ModoRangoFecha } from '@/lib/config-carnicos';

const field: CSSProperties = {
  border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '8px 11px', fontSize: '13.5px',
  background: 'var(--bg)', color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif',
};
const label: CSSProperties = {
  fontSize: '11.5px', fontWeight: 600, color: 'var(--ts)', whiteSpace: 'nowrap',
};
const divider: CSSProperties = {
  width: '1px', alignSelf: 'stretch', background: 'var(--bo)', minHeight: '30px',
};

const MODOS: { value: ModoRangoFecha; label: string }[] = [
  { value: 'dia', label: 'Dia' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'personalizado', label: 'Rango personalizado' },
];

export default function FiltroRangoFechas({
  modo, desde, hasta, loading, onModo, onDesde, onHasta, onConsultar, consultarLabel = 'Consultar', ocultarSemana = false,
}: {
  modo: ModoRangoFecha;
  desde: string;
  hasta: string;
  loading: boolean;
  onModo: (modo: ModoRangoFecha) => void;
  onDesde: (value: string) => void;
  onHasta: (value: string) => void;
  onConsultar: () => void;
  consultarLabel?: string;
  /** Oculta el pill "Semana" solo en la vista que lo pida (ej. Tabla Resumen); el resto sigue mostrando las 4 opciones. */
  ocultarSemana?: boolean;
}) {
  const modosVisibles = ocultarSemana ? MODOS.filter(m => m.value !== 'semana') : MODOS;
  return (
    <section className="carnicos-toolbar" style={{
      background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', padding: '12px 18px',
      display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap', width: 'fit-content',
    }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {modosVisibles.map(m => (
          <button
            key={m.value}
            type="button"
            onClick={() => onModo(m.value)}
            style={{
              border: `1.5px solid ${modo === m.value ? 'var(--ac)' : 'var(--bo)'}`,
              background: modo === m.value ? 'var(--al)' : 'var(--bg)',
              color: modo === m.value ? 'var(--ac)' : 'var(--ts)',
              borderRadius: '20px', padding: '7px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div style={divider} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <label style={label}>Fecha desde</label>
          <input type="date" value={desde} onChange={e => onDesde(e.target.value)} style={field} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <label style={label}>Fecha hasta</label>
          <input type="date" value={hasta} onChange={e => onHasta(e.target.value)} style={field} />
        </div>
        <button type="button" onClick={onConsultar} disabled={loading} style={{ border: 'none', borderRadius: '8px', padding: '9px 18px', background: 'var(--ac)', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {loading ? 'Consultando...' : consultarLabel}
        </button>
      </div>
    </section>
  );
}
