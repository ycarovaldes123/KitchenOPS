'use client';

import { useEffect, useState, useMemo } from 'react';
import { formatCLP } from '@/lib/calculos';
import Semaforo from '@/components/costos/Semaforo';
import FichaTecnicaModal from '@/components/costos/FichaTecnicaModal';
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

interface Plato {
  id:                 string;
  nombre:             string;
  categoria:          string;
  precio_carta:       number | null;
  costo_neto:         number;
  costo_bruto:        number;
  margen_pct:         number | null;
  semaforo:           ColorSemaforo;
  foto_url:           string | null;
  carta_ingredientes: Ingrediente[];
}

const COLORES: { value: ColorSemaforo | 'all'; label: string }[] = [
  { value: 'all',    label: 'Todos' },
  { value: 'green',  label: 'Óptimo' },
  { value: 'yellow', label: 'Medio' },
  { value: 'red',    label: 'Bajo' },
  { value: 'gray',   label: 'Sin datos' },
];

const DOT: Record<ColorSemaforo, string> = {
  green:  '#16A34A',
  yellow: '#CA8A04',
  red:    '#DC2626',
  gray:   '#9CA3AF',
};

const SEM_BG: Record<ColorSemaforo, string> = {
  green:  '#DCFCE7',
  yellow: '#FEF9C3',
  red:    '#FEE2E2',
  gray:   '#F3F4F6',
};

function PlatoCard({ p, onClick }: { p: Plato; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)',
        overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.12s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '';
        (e.currentTarget as HTMLDivElement).style.transform = '';
      }}
    >
      {/* Photo */}
      <div style={{ height: '130px', background: 'var(--al)', position: 'relative', flexShrink: 0, overflow: 'hidden' }}>
        {p.foto_url ? (
          <img src={p.foto_url} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>🍽</div>
        )}
        {/* Margen badge */}
        <div style={{
          position: 'absolute', top: '8px', right: '8px',
          background: p.semaforo === 'gray' ? '#F3F4F6' : SEM_BG[p.semaforo],
          color: DOT[p.semaforo], fontWeight: 700, fontSize: '11px',
          padding: '3px 8px', borderRadius: '6px', fontFamily: 'Syne, sans-serif',
        }}>
          {p.margen_pct != null ? `${p.margen_pct.toFixed(0)}%` : 'Sin ficha'}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--tx)', lineHeight: 1.3 }}>{p.nombre}</p>
        <p style={{ margin: 0, fontSize: '11px', color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{p.categoria}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx)' }}>
            {p.precio_carta != null ? formatCLP(p.precio_carta) : '—'}
          </span>
          <Semaforo color={p.semaforo} margen={p.margen_pct} compact />
        </div>
      </div>
    </div>
  );
}

type Vista = 'lista' | 'mosaico';

export default function CostosPage() {
  const [platos,    setPlatos]    = useState<Plato[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [catFiltro, setCatFiltro] = useState('all');
  const [semFiltro, setSemFiltro] = useState<ColorSemaforo | 'all'>('all');
  const [modal,     setModal]     = useState<Plato | null>(null);
  const [vista,     setVista]     = useState<Vista>('lista');

  useEffect(() => {
    fetch('/api/carta')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setPlatos(data);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const categorias = useMemo(() => {
    const cats = Array.from(new Set(platos.map(p => p.categoria))).sort();
    return [{ value: 'all', label: 'Todas las categorías' }, ...cats.map(c => ({ value: c, label: c }))];
  }, [platos]);

  const filtrados = useMemo(() =>
    platos.filter(p =>
      (catFiltro === 'all' || p.categoria === catFiltro) &&
      (semFiltro === 'all' || p.semaforo  === semFiltro)
    ),
  [platos, catFiltro, semFiltro]);

  const grupos = useMemo(() => {
    const map = new Map<string, Plato[]>();
    for (const p of filtrados) {
      const grupo = map.get(p.categoria) ?? [];
      grupo.push(p);
      map.set(p.categoria, grupo);
    }
    return map;
  }, [filtrados]);

  const resumen = useMemo(() => ({
    optimo:    platos.filter(p => p.semaforo === 'green').length,
    medio:     platos.filter(p => p.semaforo === 'yellow').length,
    bajo:      platos.filter(p => p.semaforo === 'red').length,
    sin_datos: platos.filter(p => p.semaforo === 'gray').length,
  }), [platos]);

  if (loading) return (
    <div style={{ padding: '32px 28px', color: 'var(--ts)', fontSize: '14px' }}>Cargando carta...</div>
  );

  if (error) return (
    <div style={{ padding: '32px 28px' }}>
      <div style={{ background: '#FEF2F2', border: '1px solid var(--rd)', borderRadius: '10px', padding: '16px', color: 'var(--rd)', fontSize: '14px' }}>
        ⚠ {error}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '20px 32px', maxWidth: '1280px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: 0 }}>Costos</h1>
          <p style={{ color: 'var(--ts)', marginTop: '2px', fontSize: '13px', marginBottom: 0 }}>
            Semáforo de rentabilidad por plato · {platos.length} platos activos
          </p>
        </div>
        {/* Vista toggle */}
        <div style={{ display: 'flex', background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
          {([
            { v: 'lista'   as Vista, icon: '☰', label: 'Lista' },
            { v: 'mosaico' as Vista, icon: '⊞', label: 'Mosaico' },
          ]).map(({ v, icon, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              style={{
                padding: '7px 14px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: '5px',
                background: vista === v ? 'var(--ac)' : 'transparent',
                color: vista === v ? '#fff' : 'var(--ts)',
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: '14px' }}>{icon}</span> {label}
            </button>
          ))}
        </div>
      </div>

      {resumen.sin_datos > 0 && (
        <div style={{ background: '#FEF9C3', border: '1px solid #CA8A04', borderRadius: '10px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: '#854D0E', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700 }}>⚠</span>
          <span>
            <strong>{resumen.sin_datos} plato{resumen.sin_datos !== 1 ? 's' : ''}</strong> sin ficha técnica completa — el costo no puede calcularse hasta que se ingresen los ingredientes.
          </span>
        </div>
      )}

      {/* Resumen semáforo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {([
          { key: 'green'  as ColorSemaforo, label: 'Óptimo ≥30%',  count: resumen.optimo,    color: '#16A34A', bg: '#DCFCE7' },
          { key: 'yellow' as ColorSemaforo, label: 'Medio 25–30%', count: resumen.medio,     color: '#CA8A04', bg: '#FEF9C3' },
          { key: 'red'    as ColorSemaforo, label: 'Bajo <25%',    count: resumen.bajo,      color: '#DC2626', bg: '#FEE2E2' },
          { key: 'gray'   as ColorSemaforo, label: 'Sin datos',    count: resumen.sin_datos,  color: '#9CA3AF', bg: '#F3F4F6' },
        ] as const).map(s => (
          <div
            key={s.key}
            onClick={() => setSemFiltro(prev => prev === s.key ? 'all' : s.key)}
            style={{
              background: s.bg, borderRadius: '10px', padding: '12px 16px', cursor: 'pointer',
              border: `2px solid ${semFiltro === s.key ? s.color : 'transparent'}`,
              transition: 'border-color 0.15s',
            }}
          >
            <p style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'Syne, sans-serif', color: s.color, margin: 0 }}>{s.count}</p>
            <p style={{ fontSize: '11px', color: s.color, margin: '2px 0 0', fontWeight: 600 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
        <select
          value={catFiltro}
          onChange={e => setCatFiltro(e.target.value)}
          style={{ border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', background: 'var(--bg)', color: 'var(--tx)', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' }}
        >
          {categorias.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        <div style={{ display: 'flex', gap: '4px' }}>
          {COLORES.map(c => (
            <button
              key={c.value}
              onClick={() => setSemFiltro(c.value as ColorSemaforo | 'all')}
              style={{
                padding: '6px 14px', borderRadius: '20px', border: '1.5px solid',
                borderColor: semFiltro === c.value ? 'var(--ac)' : 'var(--bo)',
                background: semFiltro === c.value ? 'var(--al)' : 'var(--bg)',
                color: semFiltro === c.value ? 'var(--ac)' : 'var(--ts)',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {c.value !== 'all' && (
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: DOT[c.value as ColorSemaforo], flexShrink: 0 }} />
              )}
              {c.label}
            </button>
          ))}
        </div>

        {(catFiltro !== 'all' || semFiltro !== 'all') && (
          <button
            onClick={() => { setCatFiltro('all'); setSemFiltro('all'); }}
            style={{ padding: '6px 12px', borderRadius: '20px', border: '1.5px solid var(--bo)', background: 'none', color: 'var(--ts)', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
          >
            × Limpiar
          </button>
        )}
      </div>

      {filtrados.length === 0 && (
        <div style={{ background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)', padding: '40px 24px', textAlign: 'center', color: 'var(--ts)', fontSize: '14px' }}>
          No hay platos que coincidan con los filtros.
        </div>
      )}

      {/* ── VISTA LISTA ─────────────────────────────── */}
      {vista === 'lista' && Array.from(grupos.entries()).map(([cat, items]) => (
        <div key={cat} style={{ background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)', marginBottom: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 18px', background: 'var(--al)', borderBottom: '1px solid var(--bo)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {cat} · {items.length} plato{items.length !== 1 ? 's' : ''}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: '48px', borderBottom: '1px solid var(--bo)' }} />
                {['Plato', 'Precio carta', 'Costo bruto', 'Margen', 'Estado'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', padding: '8px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--bo)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((p, i) => (
                <tr
                  key={p.id}
                  onClick={() => setModal(p)}
                  style={{
                    borderTop: i > 0 ? '1px solid var(--bo)' : undefined,
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--al)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                >
                  <td style={{ padding: '8px 8px 8px 16px', width: '48px' }}>
                    {p.foto_url ? (
                      <img src={p.foto_url} alt={p.nombre} style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--al)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🍽</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--tx)', fontWeight: 500 }}>{p.nombre}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--ts)', whiteSpace: 'nowrap' }}>
                    {p.precio_carta != null ? formatCLP(p.precio_carta) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--ts)', whiteSpace: 'nowrap' }}>
                    {p.semaforo === 'gray'
                      ? <span style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', background: '#F3F4F6', padding: '2px 7px', borderRadius: '4px' }}>Sin ficha</span>
                      : formatCLP(p.costo_bruto)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', whiteSpace: 'nowrap', fontWeight: 600, color: DOT[p.semaforo] }}>
                    {p.margen_pct != null ? `${p.margen_pct.toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Semaforo color={p.semaforo} margen={p.margen_pct} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* ── VISTA MOSAICO ───────────────────────────── */}
      {vista === 'mosaico' && Array.from(grupos.entries()).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: '24px' }}>
          <div style={{ padding: '6px 0 12px', borderBottom: '2px solid var(--bo)', marginBottom: '14px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {cat} · {items.length} plato{items.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            {items.map(p => (
              <PlatoCard key={p.id} p={p} onClick={() => setModal(p)} />
            ))}
          </div>
        </div>
      ))}

      {modal && <FichaTecnicaModal plato={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
