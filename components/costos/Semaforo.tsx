import { formatPct } from '@/lib/calculos';
import type { ColorSemaforo } from '@/types/database';

// Colores suaves del semaforo de rentabilidad (mismos tonos que costos.css).
export const SEMAFORO: Record<ColorSemaforo, { bg: string; color: string; label: string; rango: string }> = {
  green:  { bg: '#ECFDF5', color: '#059669', label: 'Óptimo',    rango: 'Óptimo ≥30%' },
  yellow: { bg: '#FEF7E6', color: '#B45309', label: 'Medio',     rango: 'Medio 25–30%' },
  red:    { bg: '#FEF1F1', color: '#DC2626', label: 'Bajo',      rango: 'Bajo <25%' },
  gray:   { bg: '#F2F0ED', color: '#8A847D', label: 'Sin datos', rango: 'Sin datos' },
};

interface SemaforoProps {
  color:    ColorSemaforo;
  margen?:  number | null;
  compact?: boolean;
}

/** compact: chip "● 73,6%" para tarjetas y tablas. Normal: bloque "73,6% / Óptimo" del detalle. */
export default function Semaforo({ color, margen, compact = false }: SemaforoProps) {
  const cfg = SEMAFORO[color];

  if (compact) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px', height: '22px',
        background: cfg.bg, color: cfg.color, padding: '0 8px', borderRadius: '999px',
        fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
        {margen != null ? formatPct(margen) : cfg.label}
      </span>
    );
  }

  return (
    <div className="ck-margin-badge" style={{ background: cfg.bg, color: cfg.color }}>
      <strong>{margen != null ? formatPct(margen) : '—'}</strong>
      <span>{cfg.label}</span>
    </div>
  );
}
