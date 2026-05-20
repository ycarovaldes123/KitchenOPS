'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCLP } from '@/lib/calculos';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
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
interface DiaTendencia {
  fecha:          string;
  kg_produccion:  number;
  clp_produccion: number;
  clp_mermas:     number;
  clp_colacion:   number;
}
interface TopMotivo { motivo: string; count: number }

type Periodo = '7d' | '30d' | '90d';
const PERIODOS: { id: Periodo; label: string; dias: number }[] = [
  { id: '7d',  label: '7 días',  dias: 7 },
  { id: '30d', label: '30 días', dias: 30 },
  { id: '90d', label: '90 días', dias: 90 },
];

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
function TooltipKg({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>
      <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--ts)' }}>{label}</p>
      <p style={{ margin: 0, color: '#6366F1', fontWeight: 700 }}>{payload[0]?.value} kg</p>
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
  const [periodo,   setPeriodo]   = useState<Periodo>('30d');
  const [kpis,      setKpis]      = useState<KPIData | null>(null);
  const [tendencia, setTendencia] = useState<DiaTendencia[]>([]);
  const [motivos,   setMotivos]   = useState<TopMotivo[]>([]);
  const [loading,   setLoading]   = useState(false);

  const cargar = useCallback(async (p: Periodo) => {
    const dias  = PERIODOS.find(x => x.id === p)?.dias ?? 30;
    const desde = restarDias(dias);
    const hasta = hoyChile();
    setLoading(true);
    try {
      const [resKpis, resTend] = await Promise.all([
        fetch(`/api/kpis?desde=${desde}&hasta=${hasta}`),
        fetch(`/api/tendencia?desde=${desde}&hasta=${hasta}`),
      ]);
      if (resKpis.ok) setKpis(await resKpis.json());
      if (resTend.ok) {
        const td = await resTend.json();
        setTendencia(td.dias ?? []);
        setMotivos(td.top_motivos ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(periodo); }, [periodo, cargar]);

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

  // Aggregate trend data by week if period > 14 days to avoid overcrowding
  const chartData = periodo === '7d' ? tendencia : (() => {
    if (tendencia.length <= 20) return tendencia;
    // Group by week
    const weeks = new Map<string, DiaTendencia>();
    for (const d of tendencia) {
      const date  = new Date(d.fecha);
      const day   = date.getDay();
      const diff  = date.getDate() - day + (day === 0 ? -6 : 1);
      const mon   = new Date(date.setDate(diff));
      const key   = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
      const prev  = weeks.get(key) ?? { fecha: key, kg_produccion: 0, clp_produccion: 0, clp_mermas: 0, clp_colacion: 0 };
      weeks.set(key, {
        fecha: key,
        kg_produccion:  Math.round((prev.kg_produccion + d.kg_produccion) * 10) / 10,
        clp_produccion: prev.clp_produccion + d.clp_produccion,
        clp_mermas:     prev.clp_mermas + d.clp_mermas,
        clp_colacion:   prev.clp_colacion + d.clp_colacion,
      });
    }
    return Array.from(weeks.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  })();

  return (
    <div className="page">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 2px' }}>Dashboard</h1>
          <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>Vista ejecutiva · tendencias y distribución de costos</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {PERIODOS.map(p => (
            <button key={p.id} type="button" onClick={() => setPeriodo(p.id)}
              style={{
                padding: '7px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px',
                fontFamily: 'DM Sans, sans-serif', fontWeight: periodo === p.id ? 700 : 400,
                border: `2px solid ${periodo === p.id ? 'var(--ac)' : 'var(--bo)'}`,
                background: periodo === p.id ? 'var(--al)' : 'var(--bg)',
                color: periodo === p.id ? 'var(--ac)' : 'var(--ts)',
                transition: 'all 0.15s',
              }}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '80px', textAlign: 'center', color: 'var(--ts)', fontSize: '14px' }}>Cargando...</div>
      ) : kpis ? (
        <>
          {/* KPI summary row */}
          <div className="dash-kpi-row">
            <KpiCard label="Turnos producción" value={String(kpis.total_informes)} sub="informes registrados" accent="var(--ac)" />
            <KpiCard label="Costo de insumos" value={(kpis.total_produccion_clp ?? 0) > 0 ? formatCLP(kpis.total_produccion_clp!) : '—'} sub={(kpis.costo_por_orden ?? 0) > 0 ? `≈ ${formatCLP(kpis.costo_por_orden!)} / turno` : 'consumo materia prima'} color="var(--tl)" accent="var(--tl)" />
            <KpiCard label="Costos hundidos" value={totalHundido > 0 ? formatCLP(totalHundido) : '—'} sub="mermas + colación" accent="#DC2626" color="#DC2626" />
            <KpiCard
              label="Merma promedio"
              value={kpis.merma_pct_promedio != null ? `${kpis.merma_pct_promedio}%` : '—'}
              sub={kpis.merma_pct_promedio != null ? (kpis.merma_pct_promedio > 25 ? 'Alto — revisar' : kpis.merma_pct_promedio > 15 ? 'Medio' : 'Óptimo') : 'sin registros'}
              color={mermaColor}
              accent={mermaColor}
            />
          </div>

          {/* Charts row */}
          <div className="dash-chart-row" style={{ marginBottom: '12px' }}>

            {/* Área chart — Producción KG */}
            <ChartCard title="Producción diaria (KG)">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradKg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6366F1" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="fecha" tickFormatter={labelFecha} tick={{ fontSize: 11, fill: 'var(--ts)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--ts)' }} axisLine={false} tickLine={false} width={40} unit=" kg" />
                    <Tooltip content={<TooltipKg />} />
                    <Area type="monotone" dataKey="kg_produccion" stroke="#6366F1" strokeWidth={2} fill="url(#gradKg)" dot={false} name="Producción" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ts)', fontSize: '13px' }}>
                  Sin registros en el período
                </div>
              )}
            </ChartCard>

            {/* Pie chart — Costos hundidos */}
            <ChartCard title="Costos hundidos (mermas + colación)">
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

          {/* Bottom row */}
          <div className="dash-chart-row">

            {/* Stacked bar — Costos por día */}
            <ChartCard title="Costos del período (producción · colación · mermas)">
              {chartData.some(d => d.clp_produccion + d.clp_mermas + d.clp_colacion > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="fecha" tickFormatter={labelFecha} tick={{ fontSize: 11, fill: 'var(--ts)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--ts)' }} axisLine={false} tickLine={false} width={55}
                      tickFormatter={(v: number) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
                    />
                    <Tooltip content={<TooltipCLP />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="clp_produccion" name="Producción" stackId="a" fill="#6366F1" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="clp_colacion"   name="Colación"   stackId="a" fill="#CA8A04" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="clp_mermas"     name="Mermas"     stackId="a" fill="#DC2626" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ts)', fontSize: '13px' }}>
                  Sin costos en el período
                </div>
              )}
            </ChartCard>

            {/* Top motivos de merma */}
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
