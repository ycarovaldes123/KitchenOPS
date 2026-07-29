'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { formatFechaCorta, hoyChile, rangoParaModo, type ModoRangoFecha } from '@/lib/config-carnicos';
import type { ResumenFila } from '@/types/carnicos';
import FiltroRangoFechas from '../components/FiltroRangoFechas';

function fmt(value: number) {
  const decimals = Math.abs(value) % 1 === 0 ? 0 : 2;
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: decimals }).format(value);
}

function normalizarTexto(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

const ESTADO_BADGE: Record<ResumenFila['estado'], { label: string; bg: string; color: string }> = {
  ok: { label: 'OK', bg: '#D1FAE5', color: '#065F46' },
  alerta: { label: 'Alerta', bg: '#FEE2E2', color: '#991B1B' },
  sin_conteo: { label: 'Sin conteo final', bg: '#F1F5F9', color: '#475569' },
};

type FiltroSigno = 'todos' | 'negativos' | 'positivos' | 'cero';

const OPCIONES_SIGNO: { value: FiltroSigno; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'negativos', label: 'Negativos' },
  { value: 'positivos', label: 'Positivos' },
  { value: 'cero', label: 'En cero' },
];

function cumpleFiltroSigno(valor: number | null, filtro: FiltroSigno): boolean {
  if (filtro === 'todos') return true;
  if (valor === null) return false;
  if (filtro === 'negativos') return valor < -0.0001;
  if (filtro === 'positivos') return valor > 0.0001;
  return Math.abs(valor) <= 0.0001; // cero
}

const thHead: CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)',
  textTransform: 'uppercase', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap',
};
const filtroInput: CSSProperties = {
  width: '100%', marginTop: '5px', border: '1.5px solid var(--bo)', borderRadius: '6px', padding: '4px 7px',
  fontSize: '11px', fontWeight: 400, textTransform: 'none', background: 'var(--bg)', color: 'var(--tx)',
  outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
};

export default function TablaResumenTab() {
  const hoy = hoyChile();
  const [modo, setModo] = useState<ModoRangoFecha>('dia');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [rangoConsultado, setRangoConsultado] = useState<{ desde: string; hasta: string } | null>(null);
  const [filas, setFilas] = useState<ResumenFila[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [buscarProducto, setBuscarProducto] = useState('');
  const [filtroCalculo, setFiltroCalculo] = useState<FiltroSigno>('todos');
  const [filtroDiferencia, setFiltroDiferencia] = useState<FiltroSigno>('todos');

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

  const filasFiltradas = useMemo(() => {
    if (!filas) return [];
    const query = normalizarTexto(buscarProducto.trim());
    return filas.filter(f =>
      (!query || normalizarTexto(f.producto_nombre).includes(query))
      && cumpleFiltroSigno(f.calculo, filtroCalculo)
      && cumpleFiltroSigno(f.diferencia, filtroDiferencia),
    );
  }, [filas, buscarProducto, filtroCalculo, filtroDiferencia]);

  const hayFiltrosActivos = Boolean(buscarProducto.trim()) || filtroCalculo !== 'todos' || filtroDiferencia !== 'todos';

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <FiltroRangoFechas
        modo={modo}
        desde={desde}
        hasta={hasta}
        loading={loading}
        onModo={aplicarModo}
        onDesde={v => { setDesde(v); setModo('personalizado'); }}
        onHasta={v => { setHasta(v); setModo('personalizado'); }}
        onConsultar={consultar}
      />

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', padding: '12px 14px', fontSize: '13px' }}>{error}</div>}

      {!filas && !error && !loading && (
        <div style={{ color: 'var(--ts)', fontSize: '13px' }}>Selecciona un rango y presiona Consultar para ver el cuadre.</div>
      )}

      {filas && rangoConsultado && (
        <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', fontSize: '12px', color: 'var(--ts)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
            <span>
              {rangoConsultado.desde === rangoConsultado.hasta
                ? <>Cuadre del <strong style={{ color: 'var(--tx)' }}>{formatFechaCorta(rangoConsultado.desde)}</strong></>
                : <>Cuadre consolidado del <strong style={{ color: 'var(--tx)' }}>{formatFechaCorta(rangoConsultado.desde)}</strong> al <strong style={{ color: 'var(--tx)' }}>{formatFechaCorta(rangoConsultado.hasta)}</strong> — Inv. Inicial al inicio del rango, Inv. Final al cierre, movimientos sumados en todo el rango.</>}
            </span>
            {hayFiltrosActivos && <span>Mostrando <strong style={{ color: 'var(--tx)' }}>{filasFiltradas.length}</strong> de {filas.length} productos</span>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1080px' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={thHead}>
                    Producto
                    <input
                      type="text" value={buscarProducto} onChange={e => setBuscarProducto(e.target.value)}
                      placeholder="Buscar..." style={filtroInput}
                    />
                  </th>
                  <th style={thHead}>Inv. Inicial</th>
                  <th style={thHead}>Ingresos</th>
                  <th style={thHead}>Ventas</th>
                  <th style={thHead}>Produccion</th>
                  <th style={thHead}>Mermas</th>
                  <th style={thHead}>Colacion</th>
                  <th style={thHead}>
                    Calculo
                    <select value={filtroCalculo} onChange={e => setFiltroCalculo(e.target.value as FiltroSigno)} style={filtroInput}>
                      {OPCIONES_SIGNO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </th>
                  <th style={thHead}>Inv. Final</th>
                  <th style={thHead}>
                    Diferencia
                    <select value={filtroDiferencia} onChange={e => setFiltroDiferencia(e.target.value as FiltroSigno)} style={filtroInput}>
                      {OPCIONES_SIGNO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </th>
                  <th style={thHead}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr><td colSpan={11} style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Sin productos configurados. Ejecuta el importador de Excel.</td></tr>
                ) : filasFiltradas.length === 0 ? (
                  <tr><td colSpan={11} style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Ningun producto coincide con los filtros.</td></tr>
                ) : filasFiltradas.map(f => {
                  const badge = ESTADO_BADGE[f.estado];
                  // El Calculo deberia dar 0 (cuadrado); cualquier desvio, positivo o negativo, se marca en rojo.
                  const calculoDesviado = Math.abs(f.calculo) > 0.0001;
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
                      <td style={{ padding: '9px 12px', fontWeight: 800, color: calculoDesviado ? '#B91C1C' : 'var(--tx)' }}>
                        {fmt(f.calculo)} {f.unidad_medida}
                      </td>
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
