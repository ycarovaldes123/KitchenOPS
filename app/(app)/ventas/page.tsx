'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCLP } from '@/lib/calculos';
import { useRol } from '@/components/RolProvider';
import { getToteatCanonicalCategory, getToteatCanonicalName } from '@/lib/toteat-catalog';

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

interface CartaIngrediente {
  id: string;
  codigo_producto: string | null;
  pp_id: string | null;
  nombre: string | null;
  cantidad: number;
  unidad_medida: string | null;
  precio_unitario: number | null;
  costo_total: number | null;
}

interface CartaItem {
  id: string;
  nombre: string;
  categoria: string;
  precio_carta: number | null;
  costo_neto?: number | null;
  carta_ingredientes?: CartaIngrediente[] | null;
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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
      const key = item.product_code || item.product_name;
      const canonicalName = getToteatCanonicalName(item.product_code, item.product_name);
      const receta = recipeMap.get(normalizeKey(canonicalName)) ?? recipeMap.get(normalizeKey(item.product_name)) ?? null;
      const categoriaCanonica = getToteatCanonicalCategory(item.product_code, item.category);
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
  }, [data, recipeMap]);

  const activeKey = selectedKey && resumen.some(r => r.key === selectedKey) ? selectedKey : resumen[0]?.key ?? null;
  const selectedSale = resumen.find(row => row.key === activeKey) ?? resumen[0] ?? null;
  const selectedRecipe = selectedSale?.receta ?? null;
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

      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ts)', textTransform: 'uppercase' }}>Ventas de comida con costo de receta</span>
          <div style={{ fontSize: '12px', color: 'var(--ts)', marginTop: '4px' }}>Cruce con el maestro de cartas para estimar el costo de cada plato vendido.</div>
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
                  onClick={() => setSelectedKey(row.key)}
                  style={{
                    borderBottom: '1px solid var(--bo)',
                    cursor: 'pointer',
                    background: activeKey === row.key ? '#F8FAFC' : '#FFFFFF',
                  }}
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
        <div style={{ borderTop: '1px solid var(--bo)', background: '#FAFAFA', padding: '16px 18px' }}>
          {selectedSale ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(240px, 1fr)', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ts)', textTransform: 'uppercase', marginBottom: '8px' }}>Detalle de receta</div>
                <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '4px' }}>{selectedSale.nombre}</div>
                <div style={{ fontSize: '13px', color: 'var(--ts)', marginBottom: '12px' }}>
                  Cod. TOTEAT {selectedSale.codigo ?? '-'} - {selectedSale.categoria_toteat ?? selectedSale.categoria ?? '-'} - Vendido {formatQty(selectedSale.cantidad)} - Venta TOTEAT {selectedSale.total ? formatCLP(Math.round(selectedSale.total)) : '-'}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '540px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        {['Insumo', 'Cant/receta', 'Costo unit.', 'Costo bruto total'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRecipe?.carta_ingredientes?.length ? (
                        selectedRecipe.carta_ingredientes.map(ing => (
                          <tr key={ing.id} style={{ borderBottom: '1px solid var(--bo)' }}>
                            <td style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 600 }}>{ing.nombre ?? '-'}</td>
                            <td style={{ padding: '8px 10px', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>{ing.cantidad} {ing.unidad_medida ?? ''}</td>
                            <td style={{ padding: '8px 10px', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>{ing.precio_unitario != null ? formatCLP(Math.round(ing.precio_unitario)) : '-'}</td>
                            <td style={{ padding: '8px 10px', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>{ing.costo_total != null ? formatCLP(Math.round(ing.costo_total * selectedSale.cantidad * IVA_FACTOR)) : '-'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} style={{ padding: '18px 10px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>
                            No se encontro receta vinculada en carta para este producto.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ background: '#FFFFFF', border: '1px solid var(--bo)', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ts)', textTransform: 'uppercase', marginBottom: '10px' }}>Resumen economico</div>
                <Metric label="Cod. TOTEAT" value={selectedSale.codigo ?? '-'} />
                <Metric label="Categoria TOTEAT" value={selectedSale.categoria_toteat ?? selectedSale.categoria ?? '-'} />
                <Metric label="Venta bruta" value={selectedSale.total ? formatCLP(Math.round(selectedSale.total)) : '-'} />
                <Metric label="Costo receta bruto" value={selectedSale.costo_bruto_total != null ? formatCLP(Math.round(selectedSale.costo_bruto_total)) : '-'} />
                <Metric label="% costo" value={formatPercent(selectedSale.pct_costo)} tone={selectedSale.pct_costo != null && selectedSale.pct_costo > 0.35 ? 'warn' : 'ok'} />
                <Metric label="Margen estimado" value={selectedSale.margen != null ? formatCLP(Math.round(selectedSale.margen)) : '-'} tone={selectedSale.margen != null && selectedSale.margen >= 0 ? 'ok' : 'warn'} />
                <Metric label="Estado receta" value={selectedSale.matched ? 'Vinculada' : 'No encontrada'} tone={selectedSale.matched ? 'ok' : 'warn'} />
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--ts)', fontSize: '13px' }}>Sin plato seleccionado.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '9px 0', borderBottom: '1px solid #E2E8F0' }}>
      <div style={{ fontSize: '12px', color: 'var(--ts)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 800, color: tone === 'warn' ? '#B45309' : tone === 'ok' ? '#047857' : 'var(--tx)' }}>{value}</div>
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
