'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCLP } from '@/lib/calculos';
import { useRol } from '@/components/RolProvider';
import { getToteatCanonicalCategory, getToteatCanonicalName, FOOD_SUBCATEGORIAS } from '@/lib/toteat-catalog';

interface ToteatItem {
  fecha: string;
  product_code: string | null;
  product_name: string;
  category: string | null;
  quantity: number;
  gross_amount: number | null;
}

interface ToteatResponse {
  count: number;
  scope: 'comida' | 'todo';
  chunks: { ini: string; end: string; count: number }[];
  items: ToteatItem[];
}

interface CartaItem {
  id: string;
  nombre: string;
  categoria: string;
  precio_carta: number | null;
  costo_neto?: number | null;
}

const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const IVA_FACTOR = 1.19;

function inicioMes() {
  const hoy = hoyChile();
  return `${hoy.slice(0, 8)}01`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value * 100)}%`;
}

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .trim()
    .toUpperCase();
}

export default function VentasPage() {
  const { rol } = useRol();
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoyChile());
  const [data, setData] = useState<ToteatResponse | null>(null);
  const [carta, setCarta] = useState<CartaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [subcategoriaSeleccionada, setSubcategoriaSeleccionada] = useState<string | null>(null);

  const recipeMap = useMemo(() => {
    const map = new Map<string, CartaItem>();
    for (const item of carta) {
      map.set(normalizeKey(item.nombre), item);
    }
    return map;
  }, [carta]);

  const resumen = useMemo(() => {
    const map = new Map<string, {
      key: string;
      nombre: string;
      codigo: string | null;
      categoria: string | null;
      categoria_toteat: string | null;
      cantidad: number;
      total: number;
      receta: CartaItem | null;
      costo_unitario: number | null;
      costo_total: number | null;
      costo_bruto_total: number | null;
      pct_costo: number | null;
      margen: number | null;
      matched: boolean;
    }>();

    for (const item of data?.items ?? []) {
      const categoriaCanonica = getToteatCanonicalCategory(item.product_code, item.category);
      if (subcategoriaSeleccionada && normalizeKey(categoriaCanonica ?? item.category ?? '') !== normalizeKey(subcategoriaSeleccionada)) {
        continue;
      }

      const key = item.product_code || item.product_name;
      const canonicalName = getToteatCanonicalName(item.product_code, item.product_name);
      const receta = recipeMap.get(normalizeKey(canonicalName)) ?? recipeMap.get(normalizeKey(item.product_name)) ?? null;
      const prev = map.get(key) ?? {
        key,
        nombre: canonicalName,
        codigo: item.product_code,
        categoria: categoriaCanonica,
        categoria_toteat: item.category,
        cantidad: 0,
        total: 0,
        receta,
        costo_unitario: receta?.costo_neto ?? null,
        costo_total: null,
        costo_bruto_total: null,
        pct_costo: null,
        margen: null,
        matched: !!receta,
      };

      prev.cantidad += Number(item.quantity) || 0;
      prev.total += Number(item.gross_amount) || 0;
      prev.nombre = canonicalName;
      prev.categoria = categoriaCanonica;
      prev.categoria_toteat = item.category ?? prev.categoria_toteat;
      prev.receta = receta ?? prev.receta;
      prev.costo_unitario = prev.receta?.costo_neto ?? prev.costo_unitario;
      prev.costo_total = prev.costo_unitario != null ? prev.costo_unitario * prev.cantidad : null;
      prev.costo_bruto_total = prev.costo_total != null ? prev.costo_total * IVA_FACTOR : null;
      prev.pct_costo = prev.costo_bruto_total != null && prev.total > 0 ? prev.costo_bruto_total / prev.total : null;
      prev.margen = prev.costo_bruto_total != null ? prev.total - prev.costo_bruto_total : null;
      prev.matched = !!prev.receta;
      map.set(key, prev);
    }

    return Array.from(map.values()).sort((a, b) => b.cantidad - a.cantidad).slice(0, 30);
  }, [data, recipeMap, subcategoriaSeleccionada]);

  const subcategoriaPorClave = useMemo(() => {
    const map = new Map<string, string>();
    for (const sub of FOOD_SUBCATEGORIAS) map.set(normalizeKey(sub), sub);
    return map;
  }, []);

  const porSubcategoria = useMemo(() => {
    const OTROS = 'OTROS PRODUCTOS ALIMENTOS';
    const map = new Map<string, { subcategoria: string; cantidad: number; total: number }>();
    for (const sub of FOOD_SUBCATEGORIAS) map.set(sub, { subcategoria: sub, cantidad: 0, total: 0 });

    for (const item of data?.items ?? []) {
      const categoriaCanonica = getToteatCanonicalCategory(item.product_code, item.category) ?? item.category ?? '';
      const sub = subcategoriaPorClave.get(normalizeKey(categoriaCanonica)) ?? OTROS;
      const acc = map.get(sub) ?? map.get(OTROS)!;
      acc.cantidad += Number(item.quantity) || 0;
      acc.total += Number(item.gross_amount) || 0;
    }

    return Array.from(map.values());
  }, [data, subcategoriaPorClave]);

  const puedeSincronizar = rol === 'admin' || rol === 'finanzas' || rol === 'economo';
  const ventaTotal = resumen.reduce((sum, row) => sum + row.total, 0);
  const ventaConReceta = resumen.reduce((sum, row) => sum + (row.costo_total != null ? row.total : 0), 0);
  const costoBrutoTotal = resumen.reduce((sum, row) => sum + (row.costo_bruto_total ?? 0), 0);
  const pctCostoTotal = ventaConReceta > 0 ? costoBrutoTotal / ventaConReceta : null;
  const sinReceta = resumen.filter(row => !row.matched).length;

  async function cargarMaestros() {
    try {
      const res = await fetch('/api/maestros');
      const json = await res.json();
      if (res.ok) setCarta(json.carta ?? []);
    } catch {
      // No bloquea la pantalla si el maestro no responde.
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarMaestros();
  }, []);

  async function consultar() {
    setErr('');
    setOk('');
    setLoading(true);
    try {
      const res = await fetch(`/api/toteat/ventas?desde=${desde}&hasta=${hasta}&soloComida=1`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error consultando TOTEAT');
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }

  async function sincronizar() {
    setErr('');
    setOk('');
    setSyncing(true);
    try {
      const res = await fetch('/api/toteat/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desde, hasta, soloComida: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error sincronizando TOTEAT');
      setOk(`Ventas de comida sincronizadas: ${json.inserted_or_updated ?? 0} lineas.`);
      await consultar();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setSyncing(false);
    }
  }

  const inp: React.CSSProperties = {
    border: '1.5px solid var(--bo)',
    borderRadius: '8px',
    padding: '8px 11px',
    fontSize: '14px',
    background: 'var(--bg)',
    color: 'var(--tx)',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
  };

  const button: React.CSSProperties = {
    background: 'var(--ac)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
  };

  return (
    <div className="page" style={{ paddingBottom: '48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 3px' }}>Ventas</h1>
          <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>
            Ventas de comida TOTEAT cruzadas con recetas y costos.
          </p>
        </div>
        {data && (
          <span style={{ fontSize: '13px', fontWeight: 700, background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '5px 14px', borderRadius: '20px', color: '#047857' }}>
            {data.count} lineas comida
          </span>
        )}
      </div>

      {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: '8px', padding: '12px 16px', marginBottom: '14px', fontSize: '14px' }}>{err}</div>}
      {ok && <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46', borderRadius: '8px', padding: '12px 16px', marginBottom: '14px', fontSize: '14px' }}>{ok}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(130px, 1fr))', gap: '1px', background: 'var(--bo)', border: '1px solid var(--bo)', borderRadius: '8px', overflow: 'hidden', marginBottom: '14px' }}>
        <KpiCell label="Productos TOTEAT" value={String(resumen.length)} />
        <KpiCell label="Venta TOTEAT" value={ventaTotal ? formatCLP(Math.round(ventaTotal)) : '-'} />
        <KpiCell label="Venta con receta" value={ventaConReceta ? formatCLP(Math.round(ventaConReceta)) : '-'} tone="ok" />
        <KpiCell label="% costo" value={formatPercent(pctCostoTotal)} tone={pctCostoTotal != null && pctCostoTotal > 0.35 ? 'warn' : 'ok'} />
        <KpiCell label="Sin receta" value={String(sinReceta)} tone={sinReceta > 0 ? 'warn' : 'ok'} />
      </div>

      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '8px', padding: '18px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '16px', margin: '0 0 4px', fontWeight: 800 }}>Ventas TOTEAT comida</h2>
            <p style={{ color: 'var(--ts)', fontSize: '12px', margin: 0 }}>Solo se muestran y sincronizan platos/productos de comida.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', marginBottom: '5px' }}>Desde</label>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', marginBottom: '5px' }}>Hasta</label>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inp} />
            </div>
            <button type="button" onClick={consultar} disabled={loading || syncing} style={{ ...button, cursor: loading ? 'wait' : 'pointer' }}>
              {loading ? 'Consultando...' : 'Consultar'}
            </button>
            {puedeSincronizar && (
              <button type="button" onClick={sincronizar} disabled={loading || syncing} style={{ ...button, background: '#0D9373', cursor: syncing ? 'wait' : 'pointer' }}>
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            )}
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '8px', overflow: 'hidden', marginBottom: '14px' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ts)', textTransform: 'uppercase' }}>Ventas por subcategoria (Alimentos)</span>
          <div style={{ fontSize: '12px', color: 'var(--ts)', marginTop: '4px' }}>
            Jerarquia TOTEAT para el rango de fechas consultado. Selecciona una fila para ver el detalle de esa subcategoria abajo.
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Subcategoria', 'Cantidad', 'Venta TOTEAT'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <tr><td colSpan={3} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Selecciona un rango de fechas y presiona Consultar.</td></tr>
              ) : porSubcategoria.map(row => (
                <tr
                  key={row.subcategoria}
                  onClick={() => setSubcategoriaSeleccionada(prev => prev === row.subcategoria ? null : row.subcategoria)}
                  style={{
                    borderBottom: '1px solid var(--bo)',
                    cursor: 'pointer',
                    background: subcategoriaSeleccionada === row.subcategoria ? '#F8FAFC' : undefined,
                  }}
                >
                  <td style={{ padding: '9px 12px', fontSize: '13px', fontWeight: 600 }}>{row.subcategoria}</td>
                  <td style={{ padding: '9px 12px', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: row.cantidad > 0 ? 'var(--tx)' : 'var(--ts)' }}>{row.cantidad > 0 ? formatQty(row.cantidad) : '-'}</td>
                  <td style={{ padding: '9px 12px', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: row.total > 0 ? 'var(--tx)' : 'var(--ts)' }}>{row.total > 0 ? formatCLP(Math.round(row.total)) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ts)', textTransform: 'uppercase' }}>
            Ventas de comida con costo de receta{subcategoriaSeleccionada ? ` — ${subcategoriaSeleccionada}` : ''}
          </span>
          <div style={{ fontSize: '12px', color: 'var(--ts)', marginTop: '4px' }}>
            {subcategoriaSeleccionada
              ? 'Mostrando solo esta subcategoria. Vuelve a hacer clic en la fila para ver todas.'
              : 'Cruce con el maestro de cartas para estimar el costo de cada plato vendido.'}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1080px' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Cod. TOTEAT', 'Nombre', 'Categoria TOTEAT', 'Cantidad', 'Venta TOTEAT', 'Costo receta bruto', '% costo', 'Margen'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resumen.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '34px 16px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Sin ventas consultadas</td></tr>
              ) : resumen.map(row => (
                <tr
                  key={`${row.codigo ?? ''}-${row.nombre}`}
                  style={{ borderBottom: '1px solid var(--bo)' }}
                >
                  <td style={{ padding: '9px 12px', fontSize: '12px', color: 'var(--ts)', fontWeight: 700 }}>{row.codigo ?? '-'}</td>
                  <td style={{ padding: '9px 12px', fontSize: '13px', fontWeight: 600 }}>{row.nombre}</td>
                  <td style={{ padding: '9px 12px', fontSize: '12px', color: 'var(--ts)' }}>{row.categoria_toteat ?? row.categoria ?? '-'}</td>
                  <td style={{ padding: '9px 12px', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{formatQty(row.cantidad)}</td>
                  <td style={{ padding: '9px 12px', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{row.total ? formatCLP(Math.round(row.total)) : '-'}</td>
                  <td style={{ padding: '9px 12px', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: row.costo_bruto_total != null ? '#0F766E' : 'var(--ts)' }}>{row.costo_bruto_total != null ? formatCLP(Math.round(row.costo_bruto_total)) : '-'}</td>
                  <td style={{ padding: '9px 12px', fontSize: '13px', fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: row.pct_costo != null && row.pct_costo > 0.35 ? '#B45309' : '#047857' }}>{formatPercent(row.pct_costo)}</td>
                  <td style={{ padding: '9px 12px', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: row.margen != null && row.margen >= 0 ? '#047857' : '#B91C1C' }}>{row.margen != null ? formatCLP(Math.round(row.margen)) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCell({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div style={{ background: 'var(--sf)', padding: '12px 16px' }}>
      <div style={{ fontSize: '11px', color: 'var(--ts)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, color: tone === 'warn' ? '#B45309' : tone === 'ok' ? '#047857' : 'var(--tx)' }}>{value}</div>
    </div>
  );
}
