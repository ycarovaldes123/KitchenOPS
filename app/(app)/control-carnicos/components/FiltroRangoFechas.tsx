'use client';

import type { CSSProperties } from 'react';
import type { ModoRangoFecha } from '@/lib/config-carnicos';

const field: CSSProperties = {
  border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '8px 11px', fontSize: '14px',
  background: 'var(--bg)', color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif',
};
const label: CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', marginBottom: '5px',
};

const MODOS: { value: ModoRangoFecha; label: string }[] = [
  { value: 'dia', label: 'Dia' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'personalizado', label: 'Rango personalizado' },
];

export default function FiltroRangoFechas({
  modo, desde, hasta, loading, onModo, onDesde, onHasta, onConsultar, consultarLabel = 'Consultar',
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
}) {
  return (
    <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {MODOS.map(m => (
          <button
            key={m.value}
            type="button"
            onClick={() => onModo(m.value)}
            style={{
              border: `1.5px solid ${modo === m.value ? 'var(--ac)' : 'var(--bo)'}`,
              background: modo === m.value ? 'var(--al)' : 'var(--bg)',
              color: modo === m.value ? 'var(--ac)' : 'var(--ts)',
              borderRadius: '20px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={label}>Fecha desde</label>
          <input type="date" value={desde} onChange={e => onDesde(e.target.value)} style={field} />
        </div>
        <div>
          <label style={label}>Fecha hasta</label>
          <input type="date" value={hasta} onChange={e => onHasta(e.target.value)} style={field} />
        </div>
        <button type="button" onClick={onConsultar} disabled={loading} style={{ border: 'none', borderRadius: '8px', padding: '10px 18px', background: 'var(--ac)', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
          {loading ? 'Consultando...' : consultarLabel}
        </button>
      </div>
    </section>
  );
}
