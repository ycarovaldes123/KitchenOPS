'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { formatFechaCompacta, formatFechaCorta, hoyChile, inicioMesISO, rangoParaModo, type ModoRangoFecha } from '@/lib/config-carnicos';
import type { ResumenFila } from '@/types/carnicos';
import { useRol } from '@/components/RolProvider';
import NavIcon from '@/components/layout/NavIcon';
import FiltroRangoFechas from '../components/FiltroRangoFechas';

function fmt(value: number) {
  const decimals = Math.abs(value) % 1 === 0 ? 0 : 2;
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: decimals }).format(value);
}

function fmtMoney(value: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
}

function fmtPct(value: number) {
  return new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
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

function IconAlerta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconOk() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 17" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

function KpiCard({ label, value, unit, sub, color = 'var(--tx)', iconBg, iconColor, icon }: {
  label: string; value: string; unit?: string; sub?: string; color?: string; iconBg: string; iconColor: string; icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '10px',
      padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', minHeight: '80px',
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ts)', margin: '0 0 5px', whiteSpace: 'nowrap' }}>{label}</p>
        <p style={{ display: 'flex', alignItems: 'baseline', gap: '5px', margin: 0 }}>
          <span style={{ fontSize: '22px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', color, lineHeight: 1 }}>{value}</span>
          {unit && <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--ts)' }}>{unit}</span>}
        </p>
        {sub && <p style={{ fontSize: '11.5px', color: 'var(--ts)', margin: '4px 0 0' }}>{sub}</p>}
      </div>
      <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
    </div>
  );
}

// Lineas de tabla mas suaves que el borde de card (--bo): horizontales apenas visibles,
// verticales (separadores de grupo) casi imperceptibles, para que acompañen la lectura sin dominarla.
const BORDE_FILA = '#EFEBE3';
const BORDE_GRUPO = 'rgba(20,16,10,0.06)';
// Colores semanticos de la zona Cuadre: negativo (calculo/diferencia/impacto negativos) y
// positivo (diferencia/impacto positivos). Cero y sin-conteo quedan en negro/gris normal.
const COLOR_NEGATIVO = '#EF1B1B';
const COLOR_POSITIVO = '#FF6500';
const FONDO_CUADRE = '#FFF8F2';

// Anchos de columna (colgroup, table-layout fixed) para mantener siempre las mismas proporciones
// sin importar el largo del contenido, con scroll horizontal si no entran en la pantalla.
const COL_PRODUCTO = 240;
const COL_INICIAL = 118;
const COL_INGRESOS = 108;
const COL_VENTAS = 108;
const COL_PRODUCCION = 118;
const COL_MERMAS = 108;
const COL_COLACION = 108;
const COL_CALCULO = 128;
const COL_FINAL = 108;
const COL_DIFERENCIA = 112;
const COL_IMPACTO = 112;
const COL_ESTADO = 92;

const thHead: CSSProperties = {
  padding: '11px 12px', textAlign: 'center', fontSize: '10.5px', fontWeight: 600, color: 'var(--ts)',
  textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `1px solid ${BORDE_FILA}`, whiteSpace: 'nowrap',
};
const thHeadLeft: CSSProperties = { ...thHead, textAlign: 'left' };
const thGroup: CSSProperties = {
  padding: '9px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 600, color: 'var(--ts)',
  textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${BORDE_FILA}`, whiteSpace: 'nowrap',
};
const tdNum: CSSProperties = {
  padding: '10px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: '12.5px',
};
const tdProducto: CSSProperties = {
  padding: '10px 16px', fontWeight: 600, fontSize: '12.5px', lineHeight: 1.5,
};
const unidadSpan: CSSProperties = { color: 'var(--ts)', fontWeight: 400, fontSize: '11px', marginLeft: '3px' };

const filtroInlineLabel: CSSProperties = {
  fontSize: '12.5px', fontWeight: 600, color: 'var(--ts)', whiteSpace: 'nowrap',
};
const filtroBase: CSSProperties = {
  border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '7px 10px',
  fontSize: '12.5px', fontWeight: 400, background: 'var(--bg)', color: 'var(--tx)',
  outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
};
const filtroSelect: CSSProperties = { ...filtroBase, width: '140px' };
const filtroBusquedaInput: CSSProperties = { ...filtroBase, width: '220px', paddingLeft: '32px' };

const excelBtn: CSSProperties = {
  border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 800,
  background: 'var(--ac)', color: '#fff', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
  display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
};
const excelBtnDisabled: CSSProperties = { ...excelBtn, cursor: 'default', opacity: 0.5 };
const fechaConteoInput: CSSProperties = {
  border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '7px 10px', fontSize: '12px',
  background: 'var(--bg)', color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif',
};

const exportCard: CSSProperties = {
  background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', padding: '12px 18px',
  display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', width: 'fit-content',
};

function fmtFechaHora(d: Date): string {
  const fecha = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const hora = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${fecha} ${hora}`;
}

function fmtFechaBarra(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-');
  return `${d}/${m}/${y}`;
}

async function descargarArchivo(url: string, filename: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Error al generar el archivo');
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
    return e instanceof Error ? e.message : 'Error al generar el archivo';
  }
}

export default function TablaResumenTab({ onRangoTexto }: { onRangoTexto?: (texto: string | null) => void }) {
  const { puede } = useRol();
  const puedeExportar = puede('controlCarnicos', 'exportar');
  const verCostos = puede('controlCarnicos', 'verCostos');
  const hoy = hoyChile();
  // Rango inicial: primer dia del mes actual hasta hoy (se recalcula en cada carga real del componente,
  // nunca queda fijo en una fecha) -- no corresponde a ninguno de los pills Dia/Semana/Mes, asi que arranca
  // en "Rango personalizado".
  const [modo, setModo] = useState<ModoRangoFecha>('personalizado');
  const [desde, setDesde] = useState(() => inicioMesISO(hoy));
  const [hasta, setHasta] = useState(hoy);
  const [rangoConsultado, setRangoConsultado] = useState<{ desde: string; hasta: string } | null>(null);
  const [filas, setFilas] = useState<ResumenFila[] | null>(null);
  // Venta Toteat "solo cocina" (sin Cafeteria) del rango consultado, para el KPI de % diferencia $ vs
  // venta. Se pide aparte (no bloquea la tabla): consulta Toteat en vivo y puede tardar bastante en
  // rangos largos (no hay nada sincronizado todavia en ventas_toteat). null = aun no se sabe / error.
  const [ventaCocinaTotal, setVentaCocinaTotal] = useState<number | null>(null);
  const [cargandoVenta, setCargandoVenta] = useState(false);
  // Arranca en true: se auto-consulta al montar, asi que nunca debe mostrarse el mensaje
  // "Selecciona un rango" antes de que la carga automatica dispare.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [buscarProducto, setBuscarProducto] = useState('');
  const [filtroCalculo, setFiltroCalculo] = useState<FiltroSigno>('todos');
  const [filtroDiferencia, setFiltroDiferencia] = useState<FiltroSigno>('todos');
  const [mostrarCantidad, setMostrarCantidad] = useState<'25' | '50' | '100' | 'todos'>('todos');
  const [ordenarPor, setOrdenarPor] = useState<'ninguno' | 'diferencia' | 'diferencia_valor'>('ninguno');

  const [fechaConteo, setFechaConteo] = useState(hoy);
  const [descargandoConteo, setDescargandoConteo] = useState(false);
  const [descargandoReporte, setDescargandoReporte] = useState(false);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);

  useEffect(() => () => onRangoTexto?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function descargarConteo() {
    setDescargandoConteo(true);
    const err = await descargarArchivo(`/api/control-carnicos/resumen/conteo?fecha=${fechaConteo}`, `Conteo_Carnes_${formatFechaCompacta(fechaConteo)}.xlsx`);
    if (err) setError(err);
    setDescargandoConteo(false);
  }

  async function descargarReporte() {
    if (!rangoConsultado) return;
    setDescargandoReporte(true);
    const { desde: d, hasta: h } = rangoConsultado;
    const filename = d === h ? `Reporte_${formatFechaCompacta(d)}.xlsx` : `Reporte_${formatFechaCompacta(d)}_${formatFechaCompacta(h)}.xlsx`;
    const err = await descargarArchivo(`/api/control-carnicos/resumen/reporte?desde=${d}&hasta=${h}`, filename);
    if (err) setError(err);
    setDescargandoReporte(false);
  }

  async function fetchVentaCocina(d: string, h: string) {
    if (!verCostos) return;
    setCargandoVenta(true);
    setVentaCocinaTotal(null);
    try {
      const res = await fetch(`/api/control-carnicos/resumen/venta-cocina?desde=${d}&hasta=${h}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error consultando venta');
      setVentaCocinaTotal(Number(data.ventaCocinaTotal) || 0);
    } catch {
      setVentaCocinaTotal(null);
    } finally {
      setCargandoVenta(false);
    }
  }

  async function fetchResumen(d: string, h: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/control-carnicos/resumen?desde=${d}&hasta=${h}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error consultando resumen');
      setFilas(data.filas ?? []);
      const nuevoRango = { desde: data.desde ?? d, hasta: data.hasta ?? h };
      setRangoConsultado(nuevoRango);
      fetchVentaCocina(nuevoRango.desde, nuevoRango.hasta);
      if (nuevoRango.desde !== d || nuevoRango.hasta !== h) {
        setDesde(nuevoRango.desde);
        setHasta(nuevoRango.hasta);
        setModo('personalizado');
      }
      setUltimaActualizacion(new Date());
      onRangoTexto?.(nuevoRango.desde === nuevoRango.hasta
        ? fmtFechaBarra(nuevoRango.desde)
        : `${fmtFechaBarra(nuevoRango.desde)} - ${fmtFechaBarra(nuevoRango.hasta)}`);
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

  // Carga automatica al montar (entrar al modulo o refrescar la pagina): consulta una sola vez el
  // rango inicial (mes actual -> hoy) reutilizando fetchResumen, la misma funcion del boton Consultar.
  // Se difiere a un microtask para no llamar setState de forma sincrona dentro del efecto. No bloquea
  // la interaccion posterior: el usuario sigue pudiendo cambiar fechas/filtros y volver a consultar.
  useEffect(() => {
    Promise.resolve().then(() => fetchResumen(desde, hasta));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filasFiltradas = useMemo(() => {
    if (!filas) return [];
    const query = normalizarTexto(buscarProducto.trim());
    return filas.filter(f =>
      (!query || normalizarTexto(f.producto_nombre).includes(query))
      && cumpleFiltroSigno(f.calculo, filtroCalculo)
      && cumpleFiltroSigno(f.diferencia, filtroDiferencia),
    );
  }, [filas, buscarProducto, filtroCalculo, filtroDiferencia]);

  const filasOrdenadas = useMemo(() => {
    if (ordenarPor === 'ninguno') return filasFiltradas;
    const campo = ordenarPor === 'diferencia' ? 'diferencia' : 'diferencia_valor';
    // Mayor a menor; los productos sin conteo final (valor null) quedan siempre al final.
    return [...filasFiltradas].sort((a, b) => {
      const va = a[campo];
      const vb = b[campo];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return vb - va;
    });
  }, [filasFiltradas, ordenarPor]);

  const filasVisibles = useMemo(() => (
    mostrarCantidad === 'todos' ? filasOrdenadas : filasOrdenadas.slice(0, Number(mostrarCantidad))
  ), [filasOrdenadas, mostrarCantidad]);

  const hayFiltrosActivos = Boolean(buscarProducto.trim()) || filtroCalculo !== 'todos' || filtroDiferencia !== 'todos' || ordenarPor !== 'ninguno';

  // KPIs sobre el total del rango consultado (no sobre los filtros de busqueda de la tabla).
  const kpis = useMemo(() => {
    if (!filas) return null;
    const total = filas.length;
    const conDiferencia = filas.filter(f => f.diferencia !== null && Math.abs(f.diferencia) > 0.0001).length;
    const diferenciaValor = filas.filter(f => f.diferencia_valor !== null).reduce((acc, f) => acc + (f.diferencia_valor ?? 0), 0);
    const alertas = filas.filter(f => f.estado === 'alerta').length;
    const ok = filas.filter(f => f.estado === 'ok').length;
    // % que representa la Diferencia total ($) sobre la venta Toteat "solo cocina" (sin Cafeteria)
    // del mismo rango. null si todavia no se conoce la venta (cargando o fallo la consulta a Toteat).
    const pctVsVentaCocina = ventaCocinaTotal !== null && ventaCocinaTotal > 0.001 ? (diferenciaValor / ventaCocinaTotal) * 100 : null;
    // Desglose de la Diferencia ($) por unidad de medida (UN/KG/GR/PR/...), para ver que tipo de
    // producto explica mas el cuadre en plata (sumar KG con UN en fisico no tiene sentido, pero en $ si).
    const diferenciaValorPorUnidad = new Map<string, number>();
    for (const f of filas) {
      if (f.diferencia_valor === null) continue;
      diferenciaValorPorUnidad.set(f.unidad_medida, (diferenciaValorPorUnidad.get(f.unidad_medida) ?? 0) + f.diferencia_valor);
    }
    const desgloseUnidad = [...diferenciaValorPorUnidad.entries()]
      .filter(([, valor]) => Math.abs(valor) > 0.5)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    return { total, conDiferencia, pctConDiferencia: total > 0 ? (conDiferencia / total) * 100 : 0, diferenciaValor, alertas, ok, pctVsVentaCocina, desgloseUnidad };
  }, [filas, ventaCocinaTotal]);

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'stretch' }}>
        <FiltroRangoFechas
          modo={modo}
          desde={desde}
          hasta={hasta}
          loading={loading}
          onModo={aplicarModo}
          onDesde={v => { setDesde(v); setModo('personalizado'); }}
          onHasta={v => { setHasta(v); setModo('personalizado'); }}
          onConsultar={consultar}
          ocultarSemana
        />

        {puedeExportar && (
          <div className="carnicos-toolbar" style={exportCard}>
            <button type="button" onClick={descargarConteo} disabled={descargandoConteo} style={descargandoConteo ? excelBtnDisabled : excelBtn} title="Fecha del conteo (toma el inventario final del dia anterior)">
              {descargandoConteo ? 'Generando...' : <>Excel Conteo <span aria-hidden style={{ fontSize: '10px' }}>▾</span></>}
            </button>
            <input
              type="date" value={fechaConteo} onChange={e => setFechaConteo(e.target.value)}
              aria-label="Fecha del conteo" title="Fecha del conteo (toma el inventario final del dia anterior)"
              style={fechaConteoInput}
            />
            <button type="button" onClick={descargarReporte} disabled={descargandoReporte || !rangoConsultado} style={descargandoReporte || !rangoConsultado ? excelBtnDisabled : excelBtn}>
              {descargandoReporte ? 'Generando...' : <>Excel Reporte <span aria-hidden style={{ fontSize: '10px' }}>▾</span></>}
            </button>
          </div>
        )}
      </div>

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', padding: '12px 14px', fontSize: '13px' }}>{error}</div>}

      {!filas && !error && !loading && (
        <div style={{ color: 'var(--ts)', fontSize: '13px' }}>Selecciona un rango y presiona Consultar para ver el cuadre.</div>
      )}

      {filas && rangoConsultado && kpis && (
        <>
          <div className="carn-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '12px' }}>
            <KpiCard label="Productos totales" value={String(kpis.total)} unit="productos" iconBg="var(--al)" iconColor="var(--ac)" icon={<NavIcon name="grid" size={18} />} />
            <KpiCard label="Con diferencia" value={String(kpis.conDiferencia)} sub={`${fmt(kpis.pctConDiferencia)}% del total`} iconBg="#FEF3C7" iconColor="#CA8A04" icon={<NavIcon name="trending" size={18} />} />
            {verCostos && (
              <KpiCard label="Diferencia total ($)" value={fmtMoney(kpis.diferenciaValor)} color={kpis.diferenciaValor < 0 ? COLOR_NEGATIVO : kpis.diferenciaValor > 0 ? COLOR_POSITIVO : 'var(--tx)'} iconBg="#FEE2E2" iconColor="#B91C1C" icon={<NavIcon name="dollar" size={18} />} />
            )}
            {verCostos && (cargandoVenta || kpis.pctVsVentaCocina !== null) && (
              <KpiCard
                label="% Dif. $ vs Venta Cocina"
                value={cargandoVenta ? '…' : `${kpis.pctVsVentaCocina! > 0 ? '+' : ''}${fmtPct(kpis.pctVsVentaCocina!)}`}
                unit={cargandoVenta ? undefined : '%'}
                sub={cargandoVenta ? 'Consultando venta Toteat...' : 'Venta Toteat cocina, sin Cafeteria'}
                color={cargandoVenta ? 'var(--tx)' : kpis.pctVsVentaCocina! < 0 ? COLOR_NEGATIVO : kpis.pctVsVentaCocina! > 0 ? COLOR_POSITIVO : 'var(--tx)'}
                iconBg="#FEE2E2" iconColor="#B91C1C" icon={<NavIcon name="dollar" size={18} />}
              />
            )}
            <KpiCard label="Alertas" value={String(kpis.alertas)} unit="productos" iconBg="#FEE2E2" iconColor="#DC2626" icon={<IconAlerta />} />
            <KpiCard label="OK" value={String(kpis.ok)} unit="productos" iconBg="#D1FAE5" iconColor="#059669" icon={<IconOk />} />
          </div>

          {verCostos && kpis.desgloseUnidad.length > 0 && (
            <div style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '10px', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 22px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Diferencia ($) por unidad de medida
              </span>
              {kpis.desgloseUnidad.map(([unidad, valor]) => (
                <span key={unidad} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px', fontSize: '13px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--tx)' }}>{unidad}</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: valor < 0 ? COLOR_NEGATIVO : COLOR_POSITIVO }}>
                    {fmtMoney(valor)}
                  </span>
                </span>
              ))}
            </div>
          )}

          <div style={{ background: '#F3F7FC', border: '1px solid #E1E9F3', borderRadius: '10px', padding: '7px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '11.5px', color: '#5B6B80' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span aria-hidden style={{ fontSize: '13px' }}>&#9432;</span>
              {rangoConsultado.desde === rangoConsultado.hasta
                ? <>Cuadre del <strong style={{ color: 'var(--tx)' }}>{formatFechaCorta(rangoConsultado.desde)}</strong></>
                : <>Cuadre consolidado del <strong style={{ color: 'var(--tx)' }}>{formatFechaCorta(rangoConsultado.desde)}</strong> al <strong style={{ color: 'var(--tx)' }}>{formatFechaCorta(rangoConsultado.hasta)}</strong> — Inv. Inicial al inicio del rango, Inv. Final al cierre, movimientos sumados en todo el rango.</>}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              {ultimaActualizacion && <span>Última actualización: {fmtFechaHora(ultimaActualizacion)}</span>}
              <button
                type="button"
                onClick={() => fetchResumen(rangoConsultado.desde, rangoConsultado.hasta)}
                disabled={loading}
                aria-label="Actualizar"
                title="Actualizar"
                style={{ border: 'none', background: 'none', color: '#5B6B80', cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', padding: '2px', opacity: loading ? 0.5 : 1 }}
              >
                <IconRefresh />
              </button>
            </span>
          </div>

          <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden' }}>
          <div className="carn-filtros" style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDE_FILA}`, display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="carn-buscar" style={{ position: 'relative' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ts)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text" value={buscarProducto} onChange={e => setBuscarProducto(e.target.value)}
                placeholder="Buscar producto..." aria-label="Buscar producto" style={filtroBusquedaInput}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="filtro-calculo" style={filtroInlineLabel}>Cálculo</label>
              <select id="filtro-calculo" value={filtroCalculo} onChange={e => setFiltroCalculo(e.target.value as FiltroSigno)} style={filtroSelect}>
                {OPCIONES_SIGNO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="filtro-diferencia" style={filtroInlineLabel}>Diferencia</label>
              <select id="filtro-diferencia" value={filtroDiferencia} onChange={e => setFiltroDiferencia(e.target.value as FiltroSigno)} style={filtroSelect}>
                {OPCIONES_SIGNO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="filtro-orden" style={filtroInlineLabel}>Ordenar por</label>
              <select id="filtro-orden" value={ordenarPor} onChange={e => setOrdenarPor(e.target.value as typeof ordenarPor)} style={{ ...filtroSelect, width: '165px' }}>
                <option value="ninguno">Sin ordenar</option>
                <option value="diferencia">Diferencia (mayor a menor)</option>
                {verCostos && <option value="diferencia_valor">Diferencia $ (mayor a menor)</option>}
              </select>
            </div>
            {hayFiltrosActivos && (
              <button
                type="button"
                onClick={() => { setBuscarProducto(''); setFiltroCalculo('todos'); setFiltroDiferencia('todos'); setOrdenarPor('ninguno'); }}
                style={{ border: 'none', background: 'none', color: 'var(--ac)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: '7px 4px' }}
              >
                Limpiar filtros
              </button>
            )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{ fontSize: '12.5px', color: 'var(--ts)' }}>{filasFiltradas.length} productos</span>
              <select
                aria-label="Productos por pagina" value={mostrarCantidad}
                onChange={e => setMostrarCantidad(e.target.value as typeof mostrarCantidad)}
                style={{ ...filtroBase, width: '128px' }}
              >
                <option value="25">25 por página</option>
                <option value="50">50 por página</option>
                <option value="100">100 por página</option>
                <option value="todos">Todos</option>
              </select>
            </div>
          </div>

          <div className="carn-tabla-wrap" style={{ overflowX: 'auto' }}>
            <table className="carnicos-table" style={{
              width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed',
              minWidth: `${COL_PRODUCTO + COL_INICIAL + COL_INGRESOS + COL_VENTAS + COL_PRODUCCION + COL_MERMAS + COL_COLACION + COL_CALCULO + COL_FINAL + COL_DIFERENCIA + (verCostos ? COL_IMPACTO : 0) + COL_ESTADO}px`,
            }}>
              <colgroup>
                <col className="cc-col-producto" style={{ width: `${COL_PRODUCTO}px` }} />
                <col className="cc-col-inicial" style={{ width: `${COL_INICIAL}px` }} />
                <col className="cc-col-mov" style={{ width: `${COL_INGRESOS}px` }} />
                <col className="cc-col-mov" style={{ width: `${COL_VENTAS}px` }} />
                <col className="cc-col-mov" style={{ width: `${COL_PRODUCCION}px` }} />
                <col className="cc-col-mov" style={{ width: `${COL_MERMAS}px` }} />
                <col className="cc-col-mov" style={{ width: `${COL_COLACION}px` }} />
                <col className="cc-col-calculo" style={{ width: `${COL_CALCULO}px` }} />
                <col className="cc-col-final" style={{ width: `${COL_FINAL}px` }} />
                <col className="cc-col-difkg" style={{ width: `${COL_DIFERENCIA}px` }} />
                {verCostos && <col className="cc-col-dif" style={{ width: `${COL_IMPACTO}px` }} />}
                <col className="cc-col-estado" style={{ width: `${COL_ESTADO}px` }} />
              </colgroup>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ ...thHeadLeft, position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>Producto</th>
                  <th style={{ ...thHead, position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>Inventario</th>
                  <th colSpan={5} style={{ ...thGroup, borderLeft: `1px solid ${BORDE_GRUPO}`, position: 'sticky', top: 0, zIndex: 1 }}>Movimientos del período</th>
                  <th colSpan={3} style={{ ...thGroup, borderLeft: `1px solid ${BORDE_GRUPO}`, background: FONDO_CUADRE, position: 'sticky', top: 0, zIndex: 1 }}>Cuadre</th>
                  {verCostos && (
                    <th rowSpan={2} className="cc-money" style={{ ...thHead, verticalAlign: 'middle', borderLeft: `1px solid ${BORDE_GRUPO}`, background: FONDO_CUADRE, position: 'sticky', top: 0, zIndex: 1 }}>
                      <span className="cc-lg">Diferencia ($)</span><span className="cc-sm">Dif. $</span>
                    </th>
                  )}
                  <th rowSpan={2} style={{ ...thHead, verticalAlign: 'middle', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>Estado</th>
                </tr>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ ...thHeadLeft, position: 'sticky', top: '37px', background: 'var(--bg)', zIndex: 1 }}>U/M</th>
                  <th style={{ ...thHead, position: 'sticky', top: '37px', background: 'var(--bg)', zIndex: 1 }}>Inicial</th>
                  <th style={{ ...thHead, borderLeft: `1px solid ${BORDE_GRUPO}`, position: 'sticky', top: '37px', background: 'var(--bg)', zIndex: 1 }}>Ingresos</th>
                  <th style={{ ...thHead, position: 'sticky', top: '37px', background: 'var(--bg)', zIndex: 1 }}>Ventas</th>
                  <th style={{ ...thHead, position: 'sticky', top: '37px', background: 'var(--bg)', zIndex: 1 }}>Producción</th>
                  <th style={{ ...thHead, position: 'sticky', top: '37px', background: 'var(--bg)', zIndex: 1 }}>Mermas</th>
                  <th style={{ ...thHead, position: 'sticky', top: '37px', background: 'var(--bg)', zIndex: 1 }}>Colación</th>
                  <th style={{ ...thHead, borderLeft: `1px solid ${BORDE_GRUPO}`, background: FONDO_CUADRE, position: 'sticky', top: '37px', zIndex: 1 }}>Cálculo</th>
                  <th style={{ ...thHead, background: FONDO_CUADRE, position: 'sticky', top: '37px', zIndex: 1 }}>Final</th>
                  <th style={{ ...thHead, background: FONDO_CUADRE, position: 'sticky', top: '37px', zIndex: 1 }}>
                    <span className="cc-lg">Diferencia</span><span className="cc-sm">Dif.</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr><td colSpan={verCostos ? 12 : 11} style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Sin productos configurados. Ejecuta el importador de Excel.</td></tr>
                ) : filasFiltradas.length === 0 ? (
                  <tr><td colSpan={verCostos ? 12 : 11} style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Ningun producto coincide con los filtros.</td></tr>
                ) : filasVisibles.map(f => {
                  const badge = ESTADO_BADGE[f.estado];
                  // Calculo: solo los valores negativos se marcan en rojo; cero y positivos en negro.
                  const calculoNegativo = f.calculo < -0.0001;
                  // Diferencia: naranja para positivos (> 0), rojo para negativos (< 0), neutro en cero/sin conteo.
                  const diferenciaColor = f.diferencia === null || Math.abs(f.diferencia) < 0.0001
                    ? 'var(--tx)'
                    : f.diferencia < 0 ? COLOR_NEGATIVO : COLOR_POSITIVO;
                  // Diferencia ($): color solo en el numero — naranja si es positiva (revisar), rojo si es
                  // negativa, neutro en cero / sin conteo. Se calcula sobre el valor monetario real.
                  const impactoColor = f.diferencia_valor === null || Math.abs(f.diferencia_valor) < 0.5
                    ? 'var(--tx)'
                    : f.diferencia_valor < 0 ? COLOR_NEGATIVO : COLOR_POSITIVO;
                  // Movimientos en 0 se muestran como "—" (sin informacion) en vez de "0 KG", para no saturar
                  // la lectura -- el valor real sigue siendo 0 para todos los calculos.
                  const movCell = (valor: number) => (
                    Math.abs(valor) < 0.0001
                      ? <span style={{ color: 'var(--ts)' }}>—</span>
                      : <>{fmt(valor)}<span className="carn-um-mov" style={unidadSpan}>{f.unidad_medida}</span></>
                  );
                  return (
                    <tr key={f.producto_id} style={{ borderBottom: `1px solid ${BORDE_FILA}` }}>
                      <td style={tdProducto}>
                        <div>{f.producto_nombre}</div>
                        <div className="cc-um" style={{ fontWeight: 400, fontSize: '11px', color: 'var(--ts)' }}>{f.unidad_medida}</div>
                      </td>
                      <td style={tdNum}>
                        {fmt(f.inv_inicial)}<span className="carn-um-keep" style={unidadSpan}>{f.unidad_medida}</span>
                        {f.inv_inicial_fuente === 'carry_forward' && <span title="Arrastrado del inventario final del dia anterior" style={{ marginLeft: '4px', color: 'var(--ac)' }}>&#8626;</span>}
                      </td>
                      <td style={{ ...tdNum, borderLeft: `1px solid ${BORDE_GRUPO}` }}>{movCell(f.ingresos)}</td>
                      <td style={tdNum}>{movCell(f.ventas)}</td>
                      <td style={tdNum}>{movCell(f.produccion)}</td>
                      <td style={tdNum}>{movCell(f.mermas)}</td>
                      <td style={tdNum}>{movCell(f.colacion)}</td>
                      <td style={{ ...tdNum, borderLeft: `1px solid ${BORDE_GRUPO}`, background: FONDO_CUADRE, fontWeight: 700, color: calculoNegativo ? COLOR_NEGATIVO : 'var(--tx)' }}>
                        {fmt(f.calculo)}<span className="carn-um-mov" style={unidadSpan}>{f.unidad_medida}</span>
                      </td>
                      <td style={{ ...tdNum, background: FONDO_CUADRE, fontWeight: 700 }}>{fmt(f.inv_final)}<span className="carn-um-mov" style={unidadSpan}>{f.unidad_medida}</span></td>
                      <td style={{ ...tdNum, background: FONDO_CUADRE, fontWeight: 700, color: diferenciaColor }}>
                        {f.diferencia === null ? '—' : <>{f.diferencia > 0 ? '+' : ''}{fmt(f.diferencia)}<span className="carn-um-keep" style={unidadSpan}>{f.unidad_medida}</span></>}
                      </td>
                      {verCostos && (
                        <td className="cc-money" style={{ ...tdNum, background: FONDO_CUADRE, fontWeight: 700, color: impactoColor }}>
                          {f.diferencia_valor === null ? '—' : fmtMoney(f.diferencia_valor)}
                        </td>
                      )}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span className="carn-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 11px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>
                          <span aria-hidden className="carn-badge-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: badge.color, flexShrink: 0 }} />
                          <span>{badge.label}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </section>
        </>
      )}

      <style>{`
        /* ── Control Cárnicos · Tabla Resumen — optimización para tablet vertical (≈768–1023px) ──
           Todo selector de tabla va prefijado con .carn-tabla-wrap (exclusivo de esta pestaña) para
           NO afectar las otras tablas .carnicos-table del módulo. Desktop y móvil (<600px) intactos. */
        .carn-tabla-wrap .cc-sm { display: none; }

        @media (min-width: 600px) and (max-width: 1023px) {
          /* Etiquetas de encabezado compactas solo en tablet */
          .carn-tabla-wrap .cc-lg { display: none !important; }
          .carn-tabla-wrap .cc-sm { display: inline !important; }

          /* La tabla encaja las 12 columnas en el ancho disponible: sin scroll horizontal */
          .carn-tabla-wrap                 { overflow-x: hidden !important; }
          .carn-tabla-wrap > table         { min-width: 0 !important; width: 100% !important; }

          .carn-tabla-wrap col.cc-col-producto { width: 16.5% !important; }
          .carn-tabla-wrap col.cc-col-inicial  { width: 8%    !important; }
          .carn-tabla-wrap col.cc-col-mov      { width: 6.7%  !important; }
          .carn-tabla-wrap col.cc-col-calculo  { width: 7.3%  !important; }
          .carn-tabla-wrap col.cc-col-final    { width: 6.4%  !important; }
          .carn-tabla-wrap col.cc-col-difkg    { width: 7%    !important; }
          .carn-tabla-wrap col.cc-col-dif      { width: 8.8%  !important; }
          .carn-tabla-wrap col.cc-col-estado   { width: 11.7% !important; }

          /* Padding compacto: horizontal general reducido, filas de ~60px */
          .carn-tabla-wrap th,
          .carn-tabla-wrap td                   { padding-left: 6px !important; padding-right: 6px !important; }
          .carn-tabla-wrap tbody td             { padding-top: 9px !important; padding-bottom: 9px !important; }
          .carn-tabla-wrap td:first-child,
          .carn-tabla-wrap thead th:first-child { padding-left: 10px !important; overflow-wrap: anywhere; }
          .carn-tabla-wrap thead th             { padding-top: 7px !important; padding-bottom: 7px !important;
                                                  position: static !important; font-size: 9px !important;
                                                  letter-spacing: 0.01em !important; }

          /* Tipografía compacta (nada por debajo de 9px) */
          .carn-tabla-wrap tbody td              { font-size: 11px !important; }
          .carn-tabla-wrap td:first-child        { font-size: 12px !important; line-height: 1.15 !important; }
          .carn-tabla-wrap td:first-child .cc-um { font-size: 9px !important; }

          /* U/M: se oculta dentro de los 5 movimientos y del cuadre (ya está bajo el nombre del
             producto); se CONSERVA siempre en Inventario Inicial y en Dif. KG, incluso en 0 */
          .carn-tabla-wrap .carn-um-mov  { display: none !important; }
          .carn-tabla-wrap .carn-um-keep { font-size: 8.8px !important; margin-left: 2px !important; }

          /* Diferencia ($): alineada a la derecha, números tabulares */
          .carn-tabla-wrap td.cc-money,
          .carn-tabla-wrap th.cc-money  { text-align: right !important; }

          /* Separadores principales sutiles: tras Producto y antes de Estado
             (los de Inventario→Movimientos y Colación→Cuadre ya existen) */
          .carn-tabla-wrap td:first-child,
          .carn-tabla-wrap thead th:first-child             { border-right: 1px solid #e3ddd4; }
          .carn-tabla-wrap tbody td:last-child,
          .carn-tabla-wrap thead tr:first-child th:last-child { border-left: 1px solid #e3ddd4; }

          /* Badge de Estado: puede envolver a 2 líneas sin ensanchar la columna */
          .carn-tabla-wrap .carn-badge {
            white-space: normal !important;
            max-width: 82px;
            padding: 4px 7px !important;
            border-radius: 11px !important;
            line-height: 1.05 !important;
            align-items: flex-start !important;
            font-size: 9.3px !important;
            text-align: left;
          }
          .carn-tabla-wrap .carn-badge .carn-badge-dot { margin-top: 2px; }

          /* KPIs compactos: 3 por fila (3+3 ó 3+2), sin cards altas */
          .carn-kpis       { grid-template-columns: repeat(3, 1fr) !important; gap: 9px !important; }
          .carn-kpis > div { padding: 12px 13px !important; min-height: 76px !important; }

          /* Filtros en dos niveles: el buscador ocupa toda la primera fila,
             el resto (Cálculo · Diferencia · Ordenar · conteo · por página) fluye debajo */
          .carn-filtros       { align-items: center !important; justify-content: flex-start !important;
                                padding: 12px 14px !important; row-gap: 10px !important; }
          .carn-filtros > div { display: contents !important; }
          .carn-buscar        { flex: 1 1 100% !important; }
          .carn-buscar input  { width: 100% !important; padding-left: 32px !important; }
          .carn-filtros select { width: auto !important; min-width: 96px !important; max-width: 168px; }
        }
      `}</style>
    </div>
  );
}
