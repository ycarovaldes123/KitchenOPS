'use client';

import { useEffect, useRef } from 'react';
import { formatCLP } from '@/lib/calculos';
import Semaforo from './Semaforo';
import type { ColorSemaforo } from '@/types/database';

interface Ingrediente {
  id:              string;
  nombre:          string | null;
  cantidad:        number;
  unidad_medida:   string | null;
  precio_unitario: number | null;
  costo_total:     number | null;
  codigo_producto: string | null;
  pp_id:           string | null;
}

interface FichaData {
  id:           string;
  nombre:       string;
  categoria:    string;
  precio_carta: number | null;
  costo_neto:   number;
  costo_bruto:  number;
  margen_pct:   number | null;
  semaforo:     ColorSemaforo;
  foto_url:     string | null;
  carta_ingredientes: Ingrediente[];
}

interface Props {
  plato:    FichaData;
  onClose:  () => void;
}

export default function FichaTecnicaModal({ plato, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar con Escape o click fuera
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const ings = plato.carta_ingredientes ?? [];

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 500, padding: '20px',
      }}
    >
      <div
        ref={ref}
        style={{
          background: 'var(--sf)', borderRadius: '16px', width: '100%',
          maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        {/* Foto portada */}
        {plato.foto_url && (
          <div style={{ position: 'relative', width: '100%', height: '200px', overflow: 'hidden', borderRadius: '16px 16px 0 0' }}>
            <img
              src={plato.foto_url}
              alt={plato.nombre}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)' }} />
            <button
              onClick={onClose}
              style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(0,0,0,0.4)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '20px', lineHeight: 1, padding: '4px 8px', borderRadius: '6px', backdropFilter: 'blur(4px)' }}
            >×</button>
          </div>
        )}

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--bo)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>
              {plato.categoria}
            </p>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--tx)' }}>
              {plato.nombre}
            </h2>
          </div>
          <Semaforo color={plato.semaforo} margen={plato.margen_pct} />
          {!plato.foto_url && (
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '22px', lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
            >×</button>
          )}
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'var(--bo)', borderBottom: '1px solid var(--bo)' }}>
          {[
            { label: 'Precio carta',  value: formatCLP(plato.precio_carta), sub: 'con IVA' },
            { label: 'Costo bruto',   value: formatCLP(plato.costo_bruto),  sub: 'costo neto × 1.19' },
            { label: 'Margen',        value: plato.margen_pct != null ? `${plato.margen_pct.toFixed(1)}%` : '—', sub: plato.margen_pct != null ? (plato.margen_pct >= 30 ? 'Óptimo ≥30%' : plato.margen_pct >= 25 ? 'Medio 25–30%' : 'Bajo <25%') : 'Sin datos' },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ background: 'var(--sf)', padding: '14px 18px' }}>
              <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>{label}</p>
              <p style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'Syne, sans-serif', color: 'var(--tx)', margin: 0 }}>{value}</p>
              <p style={{ fontSize: '11px', color: 'var(--ts)', margin: '2px 0 0' }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* Ingredientes */}
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
            Ingredientes ({ings.length})
          </p>

          {ings.length === 0 ? (
            <p style={{ color: 'var(--ts)', fontSize: '13px' }}>Sin ingredientes cargados.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Ingrediente', 'Cantidad', 'Costo unitario', 'Costo total'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', padding: '0 8px 8px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ings.map(ing => (
                  <tr key={ing.id} style={{ borderTop: '1px solid var(--bo)' }}>
                    <td style={{ padding: '8px', fontSize: '13px', color: 'var(--tx)' }}>
                      {ing.nombre ?? '—'}
                      {ing.pp_id && <span style={{ fontSize: '10px', color: 'var(--ts)', marginLeft: '6px', background: 'var(--al)', padding: '1px 5px', borderRadius: '3px' }}>PP</span>}
                    </td>
                    <td style={{ padding: '8px', fontSize: '13px', color: 'var(--ts)', whiteSpace: 'nowrap' }}>
                      {ing.cantidad} {ing.unidad_medida ?? ''}
                    </td>
                    <td style={{ padding: '8px', fontSize: '13px', color: 'var(--ts)', whiteSpace: 'nowrap' }}>
                      {ing.precio_unitario != null ? formatCLP(ing.precio_unitario) : '—'}
                    </td>
                    <td style={{ padding: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--tx)', whiteSpace: 'nowrap' }}>
                      {ing.costo_total != null ? formatCLP(ing.costo_total) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--bo)' }}>
                  <td colSpan={3} style={{ padding: '10px 8px', fontSize: '12px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Costo neto total
                  </td>
                  <td style={{ padding: '10px 8px', fontSize: '15px', fontWeight: 800, fontFamily: 'Syne, sans-serif', color: 'var(--tx)' }}>
                    {formatCLP(plato.costo_neto)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
