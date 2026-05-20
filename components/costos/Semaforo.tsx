import type { ColorSemaforo } from '@/types/database';

const CONFIG: Record<ColorSemaforo, { bg: string; color: string; label: string }> = {
  green:  { bg: '#DCFCE7', color: '#16A34A', label: 'Óptimo'    },
  yellow: { bg: '#FEF9C3', color: '#CA8A04', label: 'Medio'     },
  red:    { bg: '#FEE2E2', color: '#DC2626', label: 'Bajo'      },
  gray:   { bg: '#F3F4F6', color: '#9CA3AF', label: 'Sin datos' },
};

interface SemaforoProps {
  color:    ColorSemaforo;
  margen?:  number | null;
  compact?: boolean;
}

export default function Semaforo({ color, margen, compact = false }: SemaforoProps) {
  const cfg = CONFIG[color];

  if (compact) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        background: cfg.bg, color: cfg.color,
        padding: '3px 8px', borderRadius: '20px',
        fontSize: '11px', fontWeight: 700,
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
        {margen != null ? `${margen.toFixed(1)}%` : cfg.label}
      </span>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
      background: cfg.bg, borderRadius: '8px', padding: '8px 12px',
    }}>
      <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: cfg.color }} />
      <span style={{ fontSize: '11px', fontWeight: 700, color: cfg.color }}>
        {margen != null ? `${margen.toFixed(1)}%` : cfg.label}
      </span>
      <span style={{ fontSize: '10px', color: cfg.color, opacity: 0.8 }}>{cfg.label}</span>
    </div>
  );
}
