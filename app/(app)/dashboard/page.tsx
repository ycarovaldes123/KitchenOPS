'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCLP } from '@/lib/calculos';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}
function mesInicio() {
  const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function restarDias(n: number) {
  const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }));
  d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat('en-CA').format(d);
}
function labelFecha(s: string) {
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
}

interface KPIData {
  total_informes:           number;
  total_produccion_clp:     number | null;
  costo_por_orden:          number | null;
  total_mermas_clp:         number | null;
  total_colacion_clp:       number | null;
  costo_por_plato_promedio: number | null;
  merma_pct_promedio:       number | null;
  total_colaciones:         number;
  total_mermas:             number;
}
interface DiaTendencia {
  fecha:           string;
  informes_count:  number;
  clp_produccion:  number | null;
  clp_mermas:      number | null;
  clp_colacion:    number | null;
}
interface TopMotivo { motivo: string; count: number }
type VistaCosto = 'todos' | 'produccion' | 'colacion' | 'mermas';

const PRESETS: { label: string; desde: () => string; hasta: () => string }[] = [
  { label: '7 días',  desde: () => restarDias(7),  hasta: () => hoyChile() },
  { label: '30 días', desde: () => restarDias(30), hasta: () => hoyChile() },
  { label: '90 días', desde: () => restarDias(90), hasta: () => hoyChile() },
  { label: 'Mes',     desde: () => mesInicio(),    hasta: () => hoyChile() },
];

const VISTAS_COSTO: { id: VistaCosto; label: string }[] = [
  { id: 'todos',      label: 'Todos' },
  { id: 'produccion', label: 'Producción' },
  { id: 'colacion',   label: 'Colación' },
  { id: 'mermas',     label: 'Mermas' },
];

const COSTO_COLORS = {
  produccion: '#6366F1',
  colacion: '#CA8A04',
  mermas: '#DC2626',
};

const PIE_COLORS = ['#DC2626', '#CA8A04'];

function KpiCard({ label, value, sub, color = 'var(--tx)', accent }: {
  label: string; value: string; sub?: string; color?: string; accent?: string;
}) {
  return (
    <div style={{
      background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)',
      padding: '16px 20px', borderLeft: accent ? `4px solid ${accent}` : undefined,
    }}>
      <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: '28px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', color, margin: 0, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: '12px', color: 'var(--ts)', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)', padding: '20px', ...style }}>
      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 16px' }}>{title}</p>
      {children}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TooltipCLP({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>
      <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--ts)' }}>{label}</p>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <p key={i} style={{ margin: '2px 0', color: p.color, fontWeight: 600 }}>
          {p.name}: {formatCLP(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [desde,     setDesde]     = useState(restarDias(30));
  const [hasta,     setHasta]     = useState(hoyChile());
  const [vistaCosto, setVistaCosto] = useState<VistaCosto>('todos');
  const [kpis,      setKpis]      = useState<KPIData | null>(null);
  const [tendencia, setTendencia] = useState<DiaTendencia[]>([]);
  const [motivos,   setMotivos]   = useState<TopMotivo[]>([]);
  const [loading,   setLoading]   = useState(false);

  const cargar = useCallback(async (d: string, h: string) => {
    if (!d || !h || d > h) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?desde=${d}&hasta=${h}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cargando dashboard');
      setKpis(data.kpis ?? null);
      setTendencia(data.dias ?? []);
      setMotivos(data.top_motivos ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- este efecto sincroniza el rango con la carga de datos
  useEffect(() => { cargar(desde, hasta); }, [desde, hasta, cargar]);

  const mermaColor = kpis?.merma_pct_promedio == null ? 'var(--ts)'
    : kpis.merma_pct_promedio > 25 ? 'var(--rd)'
    : kpis.merma_pct_promedio > 15 ? 'var(--am)'
    : 'var(--tl)';

  // Costos hundidos = mermas + colación (la producción es producto en proceso, no costo perdido)
  const costoPie = kpis ? [
    { name: 'Mermas',   value: kpis.total_mermas_clp   ?? 0 },
    { name: 'Colación', value: kpis.total_colacion_clp ?? 0 },
  ].filter(x => x.value > 0) : [];

  const totalHundido = costoPie.reduce((s, x) => s + x.value, 0);

  const rangoDias = desde && hasta
    ? Math.max(1, Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1)
    : 0;

  // Aggregate trend data by week if the selected range is wide enough to avoid overcrowding
  const chartData = rangoDias <= 14 ? tendencia : (() => {
    if (tendencia.length <= 20) return tendencia;
    const weeks = new Map<string, DiaTendencia>();
    for (const d of tendencia) {
      const date  = new Date(d.fecha);
      const day   = date.getDay();
      const diff  = date.getDate() - day + (day === 0 ? -6 : 1);
      const mon   = new Date(date.setDate(diff));
      const key   = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
      const prev  = weeks.get(key) ?? { fecha: key, informes_count: 0, clp_produccion: null, clp_mermas: null, clp_colacion: null };
      weeks.set(key, {
        fecha: key,
        informes_count:  prev.informes_count + d.informes_count,
        clp_produccion:  prev.clp_produccion != null && d.clp_produccion != null ? prev.clp_produccion + d.clp_produccion : (prev.clp_produccion ?? d.clp_produccion),
        clp_mermas:      prev.clp_mermas != null && d.clp_mermas != null ? prev.clp_mermas + d.clp_mermas : (prev.clp_mermas ?? d.clp_mermas),
        clp_colacion:    prev.clp_colacion != null && d.clp_colacion != null ? prev.clp_colacion + d.clp_colacion : (prev.clp_colacion ?? d.clp_colacion),
      });
    }
    return Array.from(weeks.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  })();

  const costoDiarioReal = tendencia.map(d => ({
    fecha: d.fecha,
    costo_produccion: d.clp_produccion ?? 0,
    costo_colacion: d.clp_colacion ?? 0,
    costo_mermas: d.clp_mermas ?? 0,
    costo_total: (d.clp_produccion ?? 0) + (d.clp_colacion ?? 0) + (d.clp_mermas ?? 0),
  }));

  const chartDataCosto = chartData.map(d => ({
    ...d,
    costo_produccion: d.clp_produccion ?? 0,
    costo_colacion: d.clp_colacion ?? 0,
    costo_mermas: d.clp_mermas ?? 0,
    costo_total: (d.clp_produccion ?? 0) + (d.clp_colacion ?? 0) + (d.clp_mermas ?? 0),
  }));

  const totalDiario = chartDataCosto.map(d => ({
    fecha: d.fecha,
    costo_total: d.costo_total,
  }));

  const costoPeriodoTotal = costoDiarioReal.reduce((s, d) => s + d.costo_total, 0);
  const costoPromedioDiario = rangoDias > 0 ? costoPeriodoTotal / rangoDias : 0;
  const costoPicoDiario = costoDiarioReal.reduce((max, d) => Math.max(max, d.costo_total), 0);

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 2px' }}>Dashboard</h1>
          <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>Vista ejecutiva · tendencias y distribución de costos</p>
        </div>
        <div className="page-header-controls">
          <div className="date-row">
            <input
              type="date"
              value={desde}
              onChange={e => {
                const next = e.target.value;
                setDesde(next);
                if (hasta && next > hasta) setHasta(next);
              }}
              className="field-input"
              style={{ padding: '6px 10px', fontSize: '13px', minHeight: 'unset' }}
            />
            <span style={{ color: 'var(--ts)', fontSize: '13px' }}>→</span>
            <input
              type="date"
              value={hasta}
              onChange={e => {
                const next = e.target.value;
                setHasta(next);
                if (desde && next < desde) setDesde(next);
              }}
              className="field-input"
              style={{ padding: '6px 10px', fontSize: '13px', minHeight: 'unset' }}
            />
          </div>
          <div className="tab-row">
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setDesde(p.desde()); setHasta(p.hasta()); }}
                className="pill-btn"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '80px', textAlign: 'center', color: 'var(--ts)', fontSize: '14px' }}>Cargando...</div>
      ) : kpis ? (
        <>
          <div className="dash-kpi-row">
            <KpiCard label="Turnos producción" value={String(kpis.total_informes)} sub="informes registrados" accent="var(--ac)" />
            <KpiCard label="Costo de insumos" value={(kpis.total_produccion_clp ?? 0) > 0 ? formatCLP(kpis.total_produccion_clp!) : '—'} sub={(kpis.costo_por_orden ?? 0) > 0 ? `≈ ${formatCLP(kpis.costo_por_orden!)} / turno` : 'consumo materia prima'} color="var(--tl)" accent="var(--tl)" />
            <KpiCard label="Costos no productivos" value={totalHundido > 0 ? formatCLP(totalHundido) : '—'} sub="mermas + colación" accent="#DC2626" color="#DC2626" />
            <KpiCard label="Costo total período" value={costoPeriodoTotal > 0 ? formatCLP(costoPeriodoTotal) : '—'} sub={rangoDias > 0 ? `acumulado en ${rangoDias} día${rangoDias !== 1 ? 's' : ''}` : 'sin rango'} color="var(--ac)" accent="var(--ac)" />
            <KpiCard label="Promedio diario" value={costoPromedioDiario > 0 ? formatCLP(costoPromedioDiario) : '—'} sub="costo total / día seleccionado" color="#0F766E" accent="#0F766E" />
            <KpiCard label="Pico diario" value={costoPicoDiario > 0 ? formatCLP(costoPicoDiario) : '—'} sub="día de mayor costo total" color="#7C3AED" accent="#7C3AED" />
            <KpiCard
              label="Rendimiento verduras"
              value={kpis.merma_pct_promedio != null ? `${kpis.merma_pct_promedio}%` : '—'}
              sub={kpis.merma_pct_promedio != null ? (kpis.merma_pct_promedio > 25 ? 'Alto — revisar' : kpis.merma_pct_promedio > 15 ? 'Medio' : 'Óptimo') : 'sin registros de rendimiento'}
              color={mermaColor}
              accent={mermaColor}
            />
          </div>

          <div className="dash-chart-row" style={{ marginBottom: '12px' }}>
            <ChartCard title="Costos diarios por tipo">
              <div className="tab-row" style={{ marginBottom: '12px' }}>
                {VISTAS_COSTO.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVistaCosto(v.id)}
                    className="pill-btn"
                    style={{
                      borderColor: vistaCosto === v.id ? 'var(--ac)' : 'var(--bo)',
                      background: vistaCosto === v.id ? 'var(--al)' : 'var(--bg)',
                      color: vistaCosto === v.id ? 'var(--ac)' : 'var(--ts)',
                      fontWeight: vistaCosto === v.id ? 700 : 500,
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {chartDataCosto.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  {vistaCosto === 'todos' ? (
                    <BarChart data={chartDataCosto} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <XAxis dataKey="fecha" tickFormatter={labelFecha} tick={{ fontSize: 11, fill: 'var(--ts)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--ts)' }} axisLine={false} tickLine={false} width={60}
                        tickFormatter={(v: number) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
                      />
                      <Tooltip content={<TooltipCLP />} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="costo_produccion" name="Producción" stackId="a" fill={COSTO_COLORS.produccion} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="costo_colacion"   name="Colación"   stackId="a" fill={COSTO_COLORS.colacion} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="costo_mermas"     name="Mermas"     stackId="a" fill={COSTO_COLORS.mermas} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  ) : (
                    <AreaChart data={chartDataCosto} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`grad-${vistaCosto}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COSTO_COLORS[vistaCosto]} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={COSTO_COLORS[vistaCosto]} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="fecha" tickFormatter={labelFecha} tick={{ fontSize: 11, fill: 'var(--ts)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--ts)' }} axisLine={false} tickLine={false} width={60}
                        tickFormatter={(v: number) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
                      />
                      <Tooltip content={<TooltipCLP />} />
                      <Area
                        type="monotone"
                        dataKey={vistaCosto === 'produccion' ? 'costo_produccion' : vistaCosto === 'colacion' ? 'costo_colacion' : 'costo_mermas'}
                        stroke={COSTO_COLORS[vistaCosto]}
                        strokeWidth={2}
                        fill={`url(#grad-${vistaCosto})`}
                        dot={false}
                        name={vistaCosto === 'produccion' ? 'Producción' : vistaCosto === 'colacion' ? 'Colación' : 'Mermas'}
                      />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ts)', fontSize: '13px' }}>
                  Sin registros en el período
                </div>
              )}
            </ChartCard>

            <ChartCard title="Costos no productivos (mermas + colación)">
              {costoPie.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={costoPie} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                        {costoPie.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? formatCLP(v) : String(v ?? ''))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                    {costoPie.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: PIE_COLORS[i], flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{item.name}</span>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx)' }}>
                          {totalHundido > 0 ? `${Math.round((item.value / totalHundido) * 100)}%` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ts)', fontSize: '13px' }}>
                  Sin costos en el período
                </div>
              )}
            </ChartCard>
          </div>

          <div className="dash-chart-row">
            <ChartCard title="Costo total diario">
              {totalDiario.some(d => d.costo_total > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={totalDiario} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="fecha" tickFormatter={labelFecha} tick={{ fontSize: 11, fill: 'var(--ts)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--ts)' }} axisLine={false} tickLine={false} width={60}
                      tickFormatter={(v: number) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
                    />
                    <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? formatCLP(v) : String(v ?? ''))} />
                    <Line type="monotone" dataKey="costo_total" name="Costo total" stroke="var(--ac)" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ts)', fontSize: '13px' }}>
                  Sin costos en el período
                </div>
              )}
            </ChartCard>

            <ChartCard title="Top motivos de merma">
              {motivos.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
                  {motivos.map((m, i) => {
                    const maxCount = motivos[0].count;
                    const pct = Math.round((m.count / maxCount) * 100);
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--tx)', fontWeight: 500 }}>{m.motivo}</span>
                          <span style={{ fontSize: '12px', color: 'var(--ts)', fontWeight: 600 }}>{m.count}</span>
                        </div>
                        <div style={{ height: '4px', background: 'var(--bo)', borderRadius: '2px' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#DC2626', borderRadius: '2px', transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ts)', fontSize: '13px' }}>
                  Sin mermas en el período
                </div>
              )}
            </ChartCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
