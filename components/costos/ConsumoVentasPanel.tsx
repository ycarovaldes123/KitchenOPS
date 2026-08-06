'use client';

import { useState } from 'react';

interface DetalleRow {
  codigo_toteat: string;
  plato: string;
  ventas: number;
  codigo_producto: string | null;
  producto: string;
  cantidad_por_plato: number;
  unidad_medida: string | null;
  total_por_venta: number;
}

interface ConsolidadoRow {
  codigo_producto: string | null;
  producto: string;
  unidad_medida: string | null;
  total_consumido: number;
}

interface ConsumoResponse {
  desde: string;
  hasta: string;
  ventasLeidas: number;
  detalle: DetalleRow[];
  consolidado: ConsolidadoRow[];
  validaciones: {
    platosSinCodigoToteat: { id: string; plato: string }[];
    codigosDuplicados: { codigo_toteat: string; platos: string[] }[];
    recetasIncompletas: { codigo_toteat: string | null; plato: string; motivo: string }[];
    ventasSinReceta: { codigo_toteat: string | null; plato: string; ventas: number }[];
  };
}

const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

function inicioMes() {
  const hoy = hoyChile();
  return `${hoy.slice(0, 8)}01`;
}

function fmt(value: number) {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 }).format(value);
}

async function descargarArchivo(url: string, filename: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Error generando Excel');
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Error generando Excel';
  }
}

export default function ConsumoVentasPanel() {
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoyChile());
  const [data, setData] = useState<ConsumoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const totalWarnings = data
    ? data.validaciones.platosSinCodigoToteat.length
      + data.validaciones.codigosDuplicados.length
      + data.validaciones.recetasIncompletas.length
      + data.validaciones.ventasSinReceta.length
    : 0;

  async function consultar() {
    if (desde > hasta) {
      setError('La fecha desde no puede ser posterior a hasta.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/carta/consumo-ventas?desde=${desde}&hasta=${hasta}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error consultando consumo ventas');
      setData(json);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Error consultando consumo ventas');
    } finally {
      setLoading(false);
    }
  }

  async function exportar() {
    setExporting(true);
    setError('');
    const err = await descargarArchivo(
      `/api/carta/consumo-ventas?desde=${desde}&hasta=${hasta}&export=1`,
      `Consumo_ventas_${desde}_${hasta}.xlsx`,
    );
    if (err) setError(err);
    setExporting(false);
  }

  const inputStyle: React.CSSProperties = {
    border: '1.5px solid var(--bo)',
    borderRadius: '8px',
    padding: '8px 11px',
    fontSize: '13px',
    background: 'var(--bg)',
    color: 'var(--tx)',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
  };
  const buttonStyle: React.CSSProperties = {
    border: 'none',
    borderRadius: '8px',
    padding: '9px 15px',
    fontSize: '13px',
    fontWeight: 800,
    background: 'var(--ac)',
    color: '#fff',
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', marginBottom: '5px' }}>Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', marginBottom: '5px' }}>Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputStyle} />
          </div>
          <button type="button" onClick={consultar} disabled={loading || exporting} style={{ ...buttonStyle, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Consultando...' : 'Consultar'}
          </button>
          <button type="button" onClick={exportar} disabled={loading || exporting} style={{ ...buttonStyle, background: '#2563EB', cursor: exporting ? 'wait' : 'pointer' }}>
            {exporting ? 'Exportando...' : 'Exportar Excel'}
          </button>
          {data && (
            <span style={{ fontSize: '12px', color: 'var(--ts)', fontWeight: 700 }}>
              {data.detalle.length} linea(s) de consumo · {data.consolidado.length} producto(s)
            </span>
          )}
        </div>
      </section>

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', padding: '12px 14px', fontSize: '13px' }}>{error}</div>}

      {!data && !error && !loading && (
        <div style={{ color: 'var(--ts)', fontSize: '13px' }}>Selecciona un rango y presiona Consultar para calcular consumo por ventas TOTEAT.</div>
      )}

      {data && totalWarnings > 0 && (
        <section style={{ background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: '8px', padding: '12px 14px', color: '#92400E', fontSize: '12px' }}>
          <strong>{totalWarnings} validacion(es) pendientes.</strong>
          <div style={{ display: 'grid', gap: '4px', marginTop: '8px' }}>
            {data.validaciones.platosSinCodigoToteat.slice(0, 5).map(p => <span key={`sin-${p.id}`}>Sin Codigo TOTEAT: {p.plato}</span>)}
            {data.validaciones.codigosDuplicados.slice(0, 5).map(d => <span key={`dup-${d.codigo_toteat}`}>Codigo duplicado {d.codigo_toteat}: {d.platos.join(', ')}</span>)}
            {data.validaciones.recetasIncompletas.slice(0, 5).map((r, idx) => <span key={`rec-${idx}`}>Receta incompleta {r.codigo_toteat ?? '-'} {r.plato}: {r.motivo}</span>)}
            {data.validaciones.ventasSinReceta.slice(0, 5).map((v, idx) => <span key={`venta-${idx}`}>Venta sin receta {v.codigo_toteat ?? '-'} {v.plato}: {fmt(v.ventas)}</span>)}
          </div>
        </section>
      )}

      {data && (
        <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--bo)', fontSize: '12px', fontWeight: 800, color: 'var(--ac)', textTransform: 'uppercase' }}>
            Detalle por plato
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Codigo TOTEAT', 'Plato', 'Ventas', 'Codigo producto', 'Producto', 'Cantidad por plato', 'Total por venta'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.detalle.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '28px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Sin consumos calculados para el rango.</td></tr>
                ) : data.detalle.map((row, idx) => (
                  <tr key={`${row.codigo_toteat}-${row.codigo_producto ?? row.producto}-${idx}`} style={{ borderBottom: '1px solid var(--bo)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>{row.codigo_toteat}</td>
                    <td style={{ padding: '9px 12px' }}>{row.plato}</td>
                    <td style={{ padding: '9px 12px' }}>{fmt(row.ventas)}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--ts)' }}>{row.codigo_producto ?? '-'}</td>
                    <td style={{ padding: '9px 12px' }}>{row.producto}</td>
                    <td style={{ padding: '9px 12px' }}>{fmt(row.cantidad_por_plato)} {row.unidad_medida ?? ''}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 800 }}>{fmt(row.total_por_venta)} {row.unidad_medida ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && (
        <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--bo)', fontSize: '12px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase' }}>
            Consolidado final por producto
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Codigo producto', 'Producto', 'Unidad', 'Total consumido'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.consolidado.map(row => (
                  <tr key={`${row.codigo_producto ?? row.producto}-${row.unidad_medida ?? ''}`} style={{ borderBottom: '1px solid var(--bo)' }}>
                    <td style={{ padding: '9px 12px', color: 'var(--ts)' }}>{row.codigo_producto ?? '-'}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>{row.producto}</td>
                    <td style={{ padding: '9px 12px' }}>{row.unidad_medida ?? '-'}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 800 }}>{fmt(row.total_consumido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
