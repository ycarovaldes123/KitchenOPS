'use client';

import { useState, type CSSProperties } from 'react';
import { hoyChile } from '@/lib/config-carnicos';
import type { ResumenFila } from '@/types/carnicos';

const field: CSSProperties = {
  border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '8px 11px', fontSize: '14px',
  background: 'var(--bg)', color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif',
};

function fmt(value: number) {
  const decimals = Math.abs(value) % 1 === 0 ? 0 : 2;
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: decimals }).format(value);
}

const ESTADO_BADGE: Record<ResumenFila['estado'], { label: string; bg: string; color: string }> = {
  ok: { label: 'OK', bg: '#D1FAE5', color: '#065F46' },
  alerta: { label: 'Alerta', bg: '#FEE2E2', color: '#991B1B' },
  sin_conteo: { label: 'Sin conteo final', bg: '#F1F5F9', color: '#475569' },
};

export default function TablaResumenTab() {
  const [fecha, setFecha] = useState(hoyChile());
  const [filas, setFilas] = useState<ResumenFila[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function consultar() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/control-carnicos/resumen?fecha=${fecha}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error consultando resumen');
      setFilas(data.filas ?? []);
    } catch (e) {
      setFilas(null);
      setError(e instanceof Error ? e.message : 'Error consultando resumen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', marginBottom: '5px' }}>Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={field} />
        </div>
        <button type="button" onClick={consultar} disabled={loading} style={{ border: 'none', borderRadius: '8px', padding: '10px 18px', background: 'var(--ac)', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
          {loading ? 'Consultando...' : 'Consultar'}
        </button>
      </section>

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', padding: '12px 14px', fontSize: '13px' }}>{error}</div>}

      {!filas && !error && !loading && (
        <div style={{ color: 'var(--ts)', fontSize: '13px' }}>Selecciona una fecha y presiona Consultar para ver el cuadre diario.</div>
      )}

      {filas && (
        <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1080px' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Producto', 'Inv. Inicial', 'Ingresos', 'Ventas', 'Produccion', 'Mermas', 'Colacion', 'Calculo', 'Inv. Final', 'Diferencia', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr><td colSpan={11} style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Sin productos configurados. Ejecuta el importador de Excel.</td></tr>
                ) : filas.map(f => {
                  const badge = ESTADO_BADGE[f.estado];
                  return (
                    <tr key={f.producto_id} style={{ borderBottom: '1px solid var(--bo)' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700 }}>{f.producto_nombre}</td>
                      <td style={{ padding: '9px 12px' }}>
                        {fmt(f.inv_inicial)} {f.unidad_medida}
                        {f.inv_inicial_fuente === 'carry_forward' && <span title="Arrastrado del inventario final del dia anterior" style={{ marginLeft: '4px', color: 'var(--ac)' }}>&#8626;</span>}
                      </td>
                      <td style={{ padding: '9px 12px' }}>{fmt(f.ingresos)} {f.unidad_medida}</td>
                      <td style={{ padding: '9px 12px' }}>{fmt(f.ventas)} {f.unidad_medida}</td>
                      <td style={{ padding: '9px 12px' }}>{fmt(f.produccion)} {f.unidad_medida}</td>
                      <td style={{ padding: '9px 12px' }}>{fmt(f.mermas)} {f.unidad_medida}</td>
                      <td style={{ padding: '9px 12px' }}>{fmt(f.colacion)} {f.unidad_medida}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 800 }}>{fmt(f.calculo)} {f.unidad_medida}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 800 }}>{fmt(f.inv_final)} {f.unidad_medida}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 800, color: f.diferencia === null ? 'var(--ts)' : Math.abs(f.diferencia) < 0.0001 ? 'var(--ts)' : f.diferencia < 0 ? '#B91C1C' : '#047857' }}>
                        {f.diferencia === null ? '-' : `${fmt(f.diferencia)} ${f.unidad_medida}`}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: badge.bg, color: badge.color }}>{badge.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
