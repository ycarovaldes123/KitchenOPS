'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CATEGORIA_CARNICO_LABEL, hoyChile, rangoParaModo, type ModoRangoFecha } from '@/lib/config-carnicos';
import type { CarnicoProducto, ResumenFila } from '@/types/carnicos';
import { useRol } from '@/components/RolProvider';
import FiltroRangoFechas from '../components/FiltroRangoFechas';

function fmtMoney(value: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
}

function normalizarTexto(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function KpiCard({ label, value, sub, color = 'var(--tx)', accent }: {
  label: string; value: string; sub?: string; color?: string; accent?: string;
}) {
  return (
    <div style={{ background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)', padding: '16px 20px', borderLeft: accent ? `4px solid ${accent}` : undefined }}>
      <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: '26px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', color, margin: 0, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: '12px', color: 'var(--ts)', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}

const thHead: CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)',
  textTransform: 'uppercase', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap',
};
const searchInput: CSSProperties = {
  marginTop: '5px', border: '1.5px solid var(--bo)', borderRadius: '6px', padding: '4px 7px 4px 21px',
  fontSize: '11px', fontWeight: 400, background: 'var(--bg)', color: 'var(--tx)', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', width: '150px',
};
const costoInput: CSSProperties = {
  border: '1.5px solid var(--bo)', borderRadius: '6px', padding: '5px 8px', fontSize: '13px',
  background: 'var(--bg)', color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif',
  width: '110px', textAlign: 'right',
};

export default function ValorizacionTab() {
  const { puede } = useRol();
  const puedeEditarCostos = puede('controlCarnicos', 'editar');
  const hoy = hoyChile();

  const [modo, setModo] = useState<ModoRangoFecha>('dia');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [rangoConsultado, setRangoConsultado] = useState<{ desde: string; hasta: string } | null>(null);
  const [filas, setFilas] = useState<ResumenFila[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [buscarImpacto, setBuscarImpacto] = useState('');

  async function fetchResumen(d: string, h: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/control-carnicos/resumen?desde=${d}&hasta=${h}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error consultando resumen');
      setFilas(data.filas ?? []);
      setRangoConsultado({ desde: data.desde ?? d, hasta: data.hasta ?? h });
    } catch (e) {
      setFilas(null);
      setError(e instanceof Error ? e.message : 'Error consultando resumen');
    } finally {
      setLoading(false);
    }
  }

  function aplicarModo(nuevoModo: ModoRangoFecha) {
    setModo(nuevoModo);
    if (nuevoModo === 'personalizado') return;
    const { desde: d, hasta: h } = rangoParaModo(nuevoModo, hoy);
    setDesde(d);
    setHasta(h);
    fetchResumen(d, h);
  }

  function consultar() {
    if (desde > hasta) { setError('La fecha "desde" no puede ser posterior a "hasta".'); return; }
    fetchResumen(desde, hasta);
  }

  const totales = useMemo(() => {
    if (!filas) return { perdida: 0, sobrante: 0, neto: 0, conDiferencia: 0 };
    let perdida = 0, sobrante = 0, conDiferencia = 0;
    for (const f of filas) {
      if (f.diferencia_valor === null || Math.abs(f.diferencia_valor) < 0.5) continue;
      conDiferencia++;
      if (f.diferencia_valor < 0) perdida += f.diferencia_valor;
      else sobrante += f.diferencia_valor;
    }
    return { perdida, sobrante, neto: perdida + sobrante, conDiferencia };
  }, [filas]);

  const ranking = useMemo(() => {
    if (!filas) return [];
    const query = normalizarTexto(buscarImpacto.trim());
    return [...filas]
      .filter(f => f.diferencia_valor !== null && Math.abs(f.diferencia_valor) >= 0.5)
      .filter(f => !query || normalizarTexto(f.producto_nombre).includes(query))
      .sort((a, b) => Math.abs(b.diferencia_valor ?? 0) - Math.abs(a.diferencia_valor ?? 0));
  }, [filas, buscarImpacto]);

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <FiltroRangoFechas
        modo={modo} desde={desde} hasta={hasta} loading={loading}
        onModo={aplicarModo}
        onDesde={v => { setDesde(v); setModo('personalizado'); }}
        onHasta={v => { setHasta(v); setModo('personalizado'); }}
        onConsultar={consultar}
      />

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', padding: '12px 14px', fontSize: '13px' }}>{error}</div>}

      {!filas && !error && !loading && (
        <div style={{ color: 'var(--ts)', fontSize: '13px' }}>Selecciona un rango y presiona Consultar para ver la valorizacion.</div>
      )}

      {filas && rangoConsultado && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <KpiCard label="Perdida (faltantes)" value={fmtMoney(totales.perdida)} sub="suma de diferencias negativas" color="#B91C1C" accent="#B91C1C" />
            <KpiCard label="Sobrante" value={fmtMoney(totales.sobrante)} sub="suma de diferencias positivas" color="#CA8A04" accent="#CA8A04" />
            <KpiCard label="Neto" value={fmtMoney(totales.neto)} sub={totales.neto < 0 ? 'impacto negativo del periodo' : totales.neto > 0 ? 'impacto positivo del periodo' : 'sin impacto'} accent="var(--ac)" />
            <KpiCard label="Productos con diferencia" value={String(totales.conDiferencia)} sub={`de ${filas.length} productos`} accent="var(--ts)" />
          </div>

          <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', fontSize: '12px', color: 'var(--ts)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
              <span>Ranking de impacto en $, ordenado de mayor a menor (rango consultado)</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="carnicos-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={thHead}>
                      Producto
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ts)', pointerEvents: 'none' }}>
                          <circle cx="11" cy="11" r="7" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input type="text" value={buscarImpacto} onChange={e => setBuscarImpacto(e.target.value)} placeholder="Buscar" aria-label="Buscar producto" style={searchInput} />
                      </div>
                    </th>
                    <th style={thHead}>Categoria</th>
                    <th style={thHead}>Diferencia</th>
                    <th style={thHead}>Costo unitario</th>
                    <th style={thHead}>Diferencia $</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Sin diferencias con impacto relevante en este rango.</td></tr>
                  ) : ranking.map(f => (
                    <tr key={f.producto_id} style={{ borderBottom: '1px solid var(--bo)' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700 }}>{f.producto_nombre}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--ts)' }}>{CATEGORIA_CARNICO_LABEL[f.categoria] ?? f.categoria}</td>
                      <td style={{ padding: '9px 12px' }}>{f.diferencia} {f.unidad_medida}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--ts)' }}>{fmtMoney(f.costo_unitario)}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 800, color: (f.diferencia_valor ?? 0) < 0 ? '#B91C1C' : '#CA8A04' }}>{fmtMoney(f.diferencia_valor ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {puedeEditarCostos && <EditorCostos />}
    </div>
  );
}

function EditorCostos() {
  const [productos, setProductos] = useState<CarnicoProducto[] | null>(null);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [guardando, setGuardando] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/control-carnicos/productos/costo')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        const lista: CarnicoProducto[] = data.productos ?? [];
        setProductos(lista);
        setValores(Object.fromEntries(lista.map(p => [p.id, String(p.costo_unitario ?? 0)])));
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Error cargando costos'));
  }, []);

  async function guardar(id: string) {
    const nuevo = Number(valores[id]);
    if (!Number.isFinite(nuevo) || nuevo < 0) { setError('El costo debe ser un numero mayor o igual a 0'); return; }
    setGuardando(id);
    setError('');
    try {
      const res = await fetch('/api/control-carnicos/productos/costo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, costo_unitario: nuevo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando costo');
      setProductos(prev => prev ? prev.map(p => (p.id === id ? { ...p, costo_unitario: nuevo } : p)) : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando costo');
    } finally {
      setGuardando(null);
    }
  }

  const productosFiltrados = useMemo(() => {
    if (!productos) return [];
    const query = normalizarTexto(buscar.trim());
    return productos.filter(p => !query || normalizarTexto(p.nombre).includes(query));
  }, [productos, buscar]);

  return (
    <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 800 }}>Costos unitarios</p>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--ts)' }}>Base cargada desde &quot;Costo unitario.xlsx&quot;. Los productos en $0 no fueron encontrados ahi y deben completarse manualmente.</p>
        </div>
        <input type="text" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" style={{ ...searchInput, marginTop: 0, width: '180px' }} />
      </div>

      {error && <div style={{ margin: '12px 20px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}>{error}</div>}

      {!productos ? (
        <div style={{ padding: '24px', color: 'var(--ts)', fontSize: '13px' }}>Cargando costos...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="carnicos-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                <th style={thHead}>Producto</th>
                <th style={thHead}>Unidad</th>
                <th style={thHead}>Costo unitario ($)</th>
                <th style={thHead}></th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Ningun producto coincide con la busqueda.</td></tr>
              ) : productosFiltrados.map(p => {
                const cambiado = valores[p.id] !== String(p.costo_unitario ?? 0);
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--bo)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700 }}>{p.nombre}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--ts)' }}>{p.unidad_medida}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <input
                        type="number" min="0" step="1"
                        value={valores[p.id] ?? ''}
                        onChange={e => setValores(v => ({ ...v, [p.id]: e.target.value }))}
                        style={costoInput}
                      />
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <button
                        type="button"
                        onClick={() => guardar(p.id)}
                        disabled={!cambiado || guardando === p.id}
                        style={{
                          border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 700,
                          background: cambiado ? 'var(--ac)' : 'var(--bo)', color: cambiado ? '#fff' : 'var(--ts)',
                          cursor: cambiado && guardando !== p.id ? 'pointer' : 'default',
                        }}
                      >
                        {guardando === p.id ? 'Guardando...' : 'Guardar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
