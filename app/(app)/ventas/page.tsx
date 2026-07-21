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
  const [busqueda, setBusqueda] = useState('');

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
      // La categoria real de TOTEAT (jerarquia) manda; el catalogo solo rellena si falta.
      const categoriaCanonica = item.category ?? getToteatCanonicalCategory(item.product_code, null);
      if (subcategoriaSeleccionada && normalizeKey(categoriaCanonica ?? '') !== normalizeKey(subcategoriaSeleccionada)) {
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

    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [data, recipeMap, subcategoriaSeleccionada]);

  const resumenVisible = useMemo(() => {
    if (!busqueda.trim()) return resumen;
    const q = normalizeKey(busqueda);
    return resumen.filter(row => normalizeKey(row.nombre).includes(q) || normalizeKey(row.codigo ?? '').includes(q));
  }, [resumen, busqueda]);

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
      // La categoria real de TOTEAT (jerarquia) manda; el catalogo solo rellena si falta.
      const categoriaCanonica = item.category ?? getToteatCanonicalCategory(item.product_code, null) ?? '';
      const sub = subcategoriaPorClave.get(normalizeKey(categoriaCanonica)) ?? OTROS;
      const acc = map.get(sub) ?? map.get(OTROS)!;
      acc.cantidad += Number(item.quantity) || 0;
      acc.total += Number(item.gross_amount) || 0;
    }

    // Solo subcategorias con movimiento en el rango consultado.
    return Array.from(map.values()).filter(row => row.cantidad > 0 || row.total > 0);
  }, [data, subcategoriaPorClave]);

  const puedeSincronizar = rol === 'admin' || rol === 'finanzas' || rol === 'economo';
  const ventaTotal = resumenVisible.reduce((sum, row) => sum + row.total, 0);
  const costoBrutoTotal = resumenVisible.reduce((sum, row) => sum + (row.costo_bruto_total ?? 0), 0);
  const ventaConRecetaTotal = resumenVisible.reduce((sum, row) => sum + (row.costo_total != null ? row.total : 0), 0);
  const pctCostoTotal = ventaConRecetaTotal > 0 ? costoBrutoTotal / ventaConRecetaTotal : null;
  const sinReceta = resumenVisible.filter(row => !row.matched).length;
  const masVendido = resumenVisible
    .filter(row => row.codigo && normalizeKey(row.codigo).startsWith('K'))
    .reduce<typeof resumenVisible[number] | null>((top, row) => (
      !top || row.cantidad > top.cantidad ? row : top
    ), null);

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '14px' }}>
        <KpiCell label="Productos TOTEAT" value={String(resumenVisible.length)} accent="#2563EB" />
        <KpiCell label="Venta TOTEAT" value={ventaTotal ? formatCLP(Math.round(ventaTotal)) : '-'} accent="var(--ac)" />
        <KpiCell
          label="Mas vendido"
          value={masVendido ? masVendido.nombre : '-'}
          sub={masVendido ? `${formatQty(masVendido.cantidad)} uds · ${formatCLP(Math.round(masVendido.total))}` : undefined}
          tone="ok"
          accent="#059669"
        />
        <KpiCell
          label="% costo"
          value={formatPercent(pctCostoTotal)}
          tone={pctCostoTotal != null && pctCostoTotal > 0.35 ? 'warn' : 'ok'}
          accent={pctCostoTotal != null && pctCostoTotal > 0.35 ? '#DC2626' : '#059669'}
        />
        <KpiCell
          label="Sin receta"
          value={String(sinReceta)}
          tone={sinReceta > 0 ? 'warn' : 'ok'}
          accent={sinReceta > 0 ? '#DC2626' : '#059669'}
        />
      </div>

      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderLeft: '4px solid var(--ac)', borderRadius: '8px', padding: '18px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '16px', margin: '0 0 4px', fontWeight: 800, color: 'var(--ac)' }}>Ventas TOTEAT comida</h2>
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
              <button type="button" onClick={sincronizar} disabled={loading || syncing} style={{ ...button, background: '#2563EB', cursor: syncing ? 'wait' : 'pointer' }}>
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            )}
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderLeft: '4px solid #2563EB', borderRadius: '8px', overflow: 'hidden', marginBottom: '14px' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase' }}>Ventas por subcategoria (Alimentos)</span>
            <div style={{ fontSize: '12px', color: 'var(--ts)', marginTop: '4px' }}>
              Jerarquia TOTEAT para el rango de fechas consultado. Selecciona una fila para ver el detalle de esa subcategoria abajo, o busca un plato directamente.
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--ts)', pointerEvents: 'none' }}>
              🔍
            </span>
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar plato o producto (ej: crudo, ave)..."
              style={{
                border: '1.5px solid var(--bo)',
                borderRadius: '8px',
                padding: '8px 12px 8px 30px',
                fontSize: '13px',
                background: 'var(--bg)',
                color: 'var(--tx)',
                outline: 'none',
                fontFamily: 'DM Sans, sans-serif',
                minWidth: '260px',
              }}
            />
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
              ) : porSubcategoria.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Sin ventas ni movimiento en el rango seleccionado.</td></tr>
              ) : porSubcategoria.map(row => (
                <tr
                  key={row.subcategoria}
                  onClick={() => setSubcategoriaSeleccionada(prev => prev === row.subcategoria ? null : row.subcategoria)}
                  style={{
                    borderBottom: '1px solid var(--bo)',
                    cursor: 'pointer',
                    background: subcategoriaSeleccionada === row.subcategoria ? '#EFF6FF' : undefined,
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

      {!subcategoriaSeleccionada && !busqueda.trim() ? (
        <section style={{ background: '#FFF7ED', border: '1px dashed #FDBA74', borderRadius: '8px', padding: '32px 18px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: '#9A3412', margin: 0, fontWeight: 600 }}>
            👆 Selecciona una subcategoria arriba, o busca un plato/producto, para ver el detalle de ventas.
          </p>
        </section>
      ) : (
      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderLeft: '4px solid #DC2626', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#DC2626', textTransform: 'uppercase' }}>
            Ventas de comida con costo de receta
            {subcategoriaSeleccionada ? ` — ${subcategoriaSeleccionada}` : ''}
            {busqueda.trim() ? ` — resultados de "${busqueda.trim()}"` : ''}
          </span>
          <div style={{ fontSize: '12px', color: 'var(--ts)', marginTop: '4px' }}>
            {subcategoriaSeleccionada
              ? 'Vuelve a hacer clic en la fila de la subcategoria para cerrar este detalle. '
              : ''}
            Orden alfabetico.
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
              {resumenVisible.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '34px 16px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>{busqueda.trim() ? 'Sin resultados para la busqueda' : 'Sin ventas consultadas'}</td></tr>
              ) : resumenVisible.map(row => (
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
      )}
    </div>
  );
}

function KpiCell({ label, value, sub, tone, accent }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn'; accent?: string }) {
  return (
    <div style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderLeft: `4px solid ${accent ?? 'var(--bo)'}`, borderRadius: '8px', padding: '12px 16px' }}>
      <div style={{ fontSize: '11px', color: 'var(--ts)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '17px', fontWeight: 800, lineHeight: 1.2, wordBreak: 'break-word', color: tone === 'warn' ? '#B45309' : tone === 'ok' ? '#047857' : 'var(--tx)' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--ts)', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}
