'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCLP, formatPct } from '@/lib/calculos';

function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}
function mesInicio() {
  const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function restarMeses(n: number) {
  const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }));
  d.setMonth(d.getMonth() - n);
  return new Intl.DateTimeFormat('en-CA').format(d);
}

interface KPIData {
  total_informes:           number;
  total_produccion_kg:      number;
  total_produccion_clp:     number | null;
  costo_por_orden:          number | null;
  total_mermas_clp:         number | null;
  total_colacion_clp:       number | null;
  costo_por_plato_promedio: number | null;
  merma_pct_promedio:       number | null;
  total_colaciones:         number;
  total_mermas:             number;
}

function StatCard({ label, value, sub, color = 'var(--tx)' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)', padding: '20px 22px' }}>
      <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>{label}</p>
      <p style={{ fontSize: '26px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', color, margin: 0, lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ fontSize: '12px', color: 'var(--ts)', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}

function Semaforo({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: 'var(--ts)' }}>—</span>;
  const color = pct > 25 ? 'var(--rd)' : pct > 15 ? 'var(--am)' : 'var(--tl)';
  return <span style={{ color, fontWeight: 700 }}>{formatPct(pct)}</span>;
}

export default function KpisPage() {
  const [desde,   setDesde]   = useState(mesInicio());
  const [hasta,   setHasta]   = useState(hoyChile());
  const [data,    setData]    = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');

  const cargar = useCallback(async (d: string, h: string) => {
    setLoading(true); setErr('');
    try {
      const res = await fetch(`/api/kpis?desde=${d}&hasta=${h}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(desde, hasta); }, [desde, hasta, cargar]);

  const shortcuts = [
    { label: 'Mes',     desde: mesInicio(),     hasta: hoyChile() },
    { label: '3 meses', desde: restarMeses(3),  hasta: hoyChile() },
    { label: '6 meses', desde: restarMeses(6),  hasta: hoyChile() },
    { label: 'Año',     desde: restarMeses(12), hasta: hoyChile() },
  ];

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 2px' }}>KPIs</h1>
          <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>Indicadores financieros y operacionales por período</p>
        </div>
        <div className="page-header-controls">
          <div className="date-row">
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="field-input" style={{ padding: '6px 10px', fontSize: '13px', minHeight: 'unset' }} />
            <span style={{ color: 'var(--ts)', fontSize: '13px' }}>→</span>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="field-input" style={{ padding: '6px 10px', fontSize: '13px', minHeight: 'unset' }} />
          </div>
          <div className="tab-row">
            {shortcuts.map(s => (
              <button key={s.label} type="button" onClick={() => { setDesde(s.desde); setHasta(s.hasta); }} className="pill-btn">
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {err && <div style={{ color: 'var(--rd)', fontSize: '13px', marginBottom: '16px' }}>⚠ {err}</div>}

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ts)' }}>Cargando...</div>
      ) : data ? (
        <>
          <div className="kpi-grid">
            <StatCard label="Turnos registrados" value={String(data.total_informes)} sub="informes de producción" />
            <StatCard label="Costo de insumos" value={(data.total_produccion_clp ?? 0) > 0 ? formatCLP(data.total_produccion_clp!) : '—'} sub="consumo materia prima estimado" color="var(--tl)" />
            <StatCard label="Costo promedio / turno" value={(data.costo_por_orden ?? 0) > 0 ? formatCLP(data.costo_por_orden!) : '—'} sub="costo de consumo por orden" color="var(--ac)" />
            <StatCard label="Mermas" value={(data.total_mermas_clp ?? 0) > 0 ? formatCLP(data.total_mermas_clp!) : '—'} sub={`${data.total_mermas} registro${data.total_mermas !== 1 ? 's' : ''}`} color="var(--rd)" />
            <StatCard label="Colación personal" value={(data.total_colacion_clp ?? 0) > 0 ? formatCLP(data.total_colacion_clp!) : '—'} sub={`${data.total_colaciones} registro${data.total_colaciones !== 1 ? 's' : ''}`} />
            <StatCard label="Costo por plato" value={(data.costo_por_plato_promedio ?? 0) > 0 ? formatCLP(data.costo_por_plato_promedio!) : '—'} sub="promedio colación" color="#D97706" />
            <div style={{ background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)', padding: '20px 22px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Merma promedio</p>
              <p style={{ fontSize: '26px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1 }}>
                <Semaforo pct={data.merma_pct_promedio} />
              </p>
              <p style={{ fontSize: '12px', color: 'var(--ts)', margin: '4px 0 0' }}>
                {data.merma_pct_promedio != null
                  ? (data.merma_pct_promedio > 25 ? 'Alto — revisar procesos' : data.merma_pct_promedio > 15 ? 'Medio — dentro de rango' : 'Óptimo')
                  : 'sin registros de rendimiento'}
              </p>
            </div>
          </div>

          {data.total_informes === 0 && (
            <div style={{ background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)', padding: '40px', textAlign: 'center', color: 'var(--ts)', marginTop: '16px' }}>
              No hay registros en el período seleccionado.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
