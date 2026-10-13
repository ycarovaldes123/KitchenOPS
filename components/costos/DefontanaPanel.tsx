'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import NavIcon from '@/components/layout/NavIcon';
import { formatCantidad } from '@/lib/costo-receta-pp';
import type { EstadoDefontana, LineaConsumo, MateriaPrimaPP } from '@/lib/defontana-consumo';

interface PlatoDefontana {
  id: string;
  codigo_toteat: string | null;
  cod_softland: string | null;
  nombre: string;
  categoria: string;
  estado: EstadoDefontana;
  codigo_duplicado: boolean;
  pp: number;
  directos: number;
  con_defontana: number;
  lineas_receta: number;
  vendidos: number;
  receta: LineaConsumo[];
  consumo: (LineaConsumo & { materias_primas: MateriaPrimaPP[] | null })[];
}

interface DefontanaResponse {
  desde: string;
  hasta: string;
  ventasError: string | null;
  resumen: { vinculados: number; sin_vincular: number; pendientes: number; pp_utilizados: number; productos_directos: number };
  platos: PlatoDefontana[];
}

const ESTADOS: Record<EstadoDefontana, { label: string; ayuda: string }> = {
  vinculado:  { label: 'Vinculado',  ayuda: 'Código Toteat, receta y códigos Defontana completos' },
  pendiente:  { label: 'Pendiente',  ayuda: 'Falta código Defontana en algún producto/PP, o el código Toteat está repetido' },
  incompleto: { label: 'Incompleto', ayuda: 'Sin receta, o líneas sin código de producto / cantidad' },
  sin_codigo: { label: 'Sin código', ayuda: 'El plato no tiene Código TOTEAT: sus ventas no se pueden cruzar' },
};

const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

function fechaCorta(iso: string | null) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function normalizar(value: unknown) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function EstadoChip({ estado }: { estado: EstadoDefontana }) {
  return (
    <span className={`ck-status ck-status--${estado}`} title={ESTADOS[estado].ayuda}>
      <span className="ck-dot" style={{ background: 'currentColor' }} />
      {ESTADOS[estado].label}
    </span>
  );
}

export default function DefontanaPanel() {
  const [desde, setDesde] = useState(() => `${hoyChile().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoyChile);
  const [data, setData] = useState<DefontanaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoDefontana | 'all'>('all');
  const [catFiltro, setCatFiltro] = useState('all');
  const [ventasFiltro, setVentasFiltro] = useState<'all' | 'con' | 'sin'>('all');
  const [detalle, setDetalle] = useState<PlatoDefontana | null>(null);

  const consultar = useCallback(async (d: string, h: string) => {
    if (d > h) {
      setError('La fecha desde no puede ser posterior a hasta.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/carta/defontana?desde=${d}&hasta=${h}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error cargando Defontana');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando Defontana');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial del periodo por defecto (mes en curso)
    void consultar(`${hoyChile().slice(0, 8)}01`, hoyChile());
  }, [consultar]);

  const categorias = useMemo(
    () => Array.from(new Set((data?.platos ?? []).map(p => p.categoria))).sort(),
    [data],
  );

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda);
    return (data?.platos ?? []).filter(p =>
      (estadoFiltro === 'all' || p.estado === estadoFiltro) &&
      (catFiltro === 'all' || p.categoria === catFiltro) &&
      (ventasFiltro === 'all' || (ventasFiltro === 'con' ? p.vendidos > 0 : p.vendidos === 0)) &&
      (!q || normalizar([p.nombre, p.codigo_toteat, p.cod_softland, ...p.receta.flatMap(l => [l.nombre, l.codigo_producto, l.codigo_defontana])].join(' ')).includes(q)),
    );
  }, [data, busqueda, estadoFiltro, catFiltro, ventasFiltro]);

  const r = data?.resumen;

  return (
    <div>
      <div className="ck-df-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="ck-banner__icon"><NavIcon name="layers" size={20} /></span>
          <div>
            <h2>DEFONTANA</h2>
            <p>Homologación de ventas Toteat y consumo de inventario</p>
          </div>
        </div>
        <div className="ck-df-period">
          <label>Desde<input type="date" className="ck-input" value={desde} onChange={e => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" className="ck-input" value={hasta} onChange={e => setHasta(e.target.value)} /></label>
          <button type="button" className="ck-btn" onClick={() => void consultar(desde, hasta)} disabled={loading}>
            <NavIcon name="refresh" size={14} /> {loading ? 'Calculando...' : 'Calcular'}
          </button>
          <button
            type="button"
            className="ck-btn ck-btn--primary"
            disabled
            title="Modo revisión: el envío de consumos a Defontana se habilitará cuando la integración esté validada. Hoy no se mueve stock."
          >
            Generar consumo
          </button>
        </div>
      </div>

      {error && <div className="ck-error">{error}</div>}
      {data?.ventasError && (
        <div className="ck-warn">No se pudieron leer las ventas Toteat ({data.ventasError}). La homologación se muestra igual; el consumo queda en 0.</div>
      )}

      <div className="ck-kpis ck-kpis--5">
        {[
          { label: 'Platos vinculados', value: r?.vinculados, color: '#059669' },
          { label: 'Sin vincular', value: r?.sin_vincular, color: '#B91C1C' },
          { label: 'PP utilizados', value: r?.pp_utilizados, color: 'var(--ac)' },
          { label: 'Productos directos', value: r?.productos_directos, color: 'var(--tx)' },
          { label: 'Pendientes', value: r?.pendientes, color: '#B45309' },
        ].map(k => (
          <div key={k.label} className="ck-kpi ck-kpi--plain">
            <strong style={{ color: k.color }}>{k.value ?? '—'}</strong>
            <span>{k.label}</span>
          </div>
        ))}
      </div>

      <div className="ck-toolbar" style={{ marginBottom: '16px' }}>
        <div className="ck-search">
          <NavIcon name="search" size={16} />
          <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar código, plato o producto..." />
        </div>
        <select className="ck-select" value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value as EstadoDefontana | 'all')} aria-label="Estado">
          <option value="all">Todos los estados</option>
          {(Object.keys(ESTADOS) as EstadoDefontana[]).map(k => <option key={k} value={k}>{ESTADOS[k].label}</option>)}
        </select>
        <select className="ck-select" value={catFiltro} onChange={e => setCatFiltro(e.target.value)} aria-label="Categoría">
          <option value="all">Todas las categorías</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="ck-select" value={ventasFiltro} onChange={e => setVentasFiltro(e.target.value as 'all' | 'con' | 'sin')} aria-label="Vinculación con ventas">
          <option value="all">Toda vinculación</option>
          <option value="con">Con ventas en el período</option>
          <option value="sin">Sin ventas en el período</option>
        </select>
        {data && <span className="ck-hint">{filtrados.length} de {data.platos.length} platos</span>}
      </div>

      {loading && !data ? (
        <div className="ck-empty">Calculando homologación y ventas Toteat...</div>
      ) : filtrados.length === 0 ? (
        <div className="ck-empty">No hay platos que coincidan con los filtros.</div>
      ) : (
        <div className="ck-panel" style={{ opacity: loading ? 0.6 : 1 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="ck-table ck-table--click" style={{ minWidth: '1040px' }}>
              <thead>
                <tr>
                  <th>Código Toteat</th>
                  <th>Plato</th>
                  <th>Código plato</th>
                  <th>Estado</th>
                  <th className="num">PP</th>
                  <th className="num">Productos</th>
                  <th className="num">Cód. Defontana</th>
                  <th className="num">Vendidos</th>
                  <th>Consumo calculado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => (
                  <tr key={p.id} onClick={() => setDetalle(p)} className={detalle?.id === p.id ? 'is-selected' : undefined}>
                    <td><span className="ck-code">{p.codigo_toteat ?? '—'}</span></td>
                    <td style={{ fontWeight: 600 }}>{p.nombre}<div style={{ fontSize: '11px', color: 'var(--ts)', fontWeight: 400 }}>{p.categoria}</div></td>
                    <td><span className="ck-code">{p.cod_softland ?? '—'}</span></td>
                    <td><EstadoChip estado={p.estado} /></td>
                    <td className="num">{p.pp ? `${p.pp} PP` : '—'}</td>
                    <td className="num">{p.directos}</td>
                    <td className="num" style={{ color: p.con_defontana < p.lineas_receta ? '#B45309' : 'var(--tx)' }}>
                      {p.lineas_receta ? `${p.con_defontana}/${p.lineas_receta}` : '—'}
                    </td>
                    <td className="num">
                      {p.vendidos ? formatCantidad(p.vendidos) : <span className="muted">0</span>}
                    </td>
                    <td>
                      {p.consumo.length
                        ? <span className="ck-status ck-status--vinculado">Calculado · {p.consumo.length} línea{p.consumo.length !== 1 ? 's' : ''}</span>
                        : <span className="muted" style={{ fontSize: '12px' }}>{p.vendidos ? 'Sin receta' : 'Sin ventas'}</span>}
                    </td>
                    <td>
                      <button type="button" className="ck-btn ck-btn--sm" onClick={e => { e.stopPropagation(); setDetalle(p); }}>
                        <NavIcon name="eye" size={14} /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="ck-note" style={{ marginTop: '4px' }}>
        Se reutilizan las recetas de Carta y de Recetas PP; no se guarda una receta paralela para Defontana. Los PP (0502…) se
        descuentan como producto terminado con su propio código Defontana; sus materias primas se muestran solo como referencia
        porque ya se consumen al registrar la producción. <strong>Modo revisión:</strong> no se envían movimientos a Defontana.
      </p>

      {detalle && data && <DetalleDefontana plato={detalle} desde={data.desde} hasta={data.hasta} onClose={() => setDetalle(null)} />}
    </div>
  );
}

function DetalleDefontana({ plato, desde, hasta, onClose }: { plato: PlatoDefontana; desde: string; hasta: string; onClose: () => void }) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Sin ventas en el periodo se muestra la receta por plato, para revisar la homologacion igual.
  const conVentas = plato.vendidos > 0 && plato.consumo.length > 0;
  const lineas: (LineaConsumo & { materias_primas?: MateriaPrimaPP[] | null })[] = conVentas ? plato.consumo : plato.receta;
  const directos = lineas.filter(l => l.tipo === 'directo');
  const pps = lineas.filter(l => l.tipo === 'pp');
  const sinCodigo = lineas.filter(l => !l.codigo_defontana).length;

  return (
    <div className="ck-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ck-modal" style={{ maxWidth: '860px' }} role="dialog" aria-modal="true" aria-label={plato.nombre}>
        <div style={{ padding: '18px 22px 14px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="ck-eyebrow">Defontana · {plato.categoria}</p>
            <h2 style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: 700 }}>{plato.nombre}</h2>
          </div>
          <EstadoChip estado={plato.estado} />
          <button type="button" className="ck-close" onClick={onClose} aria-label="Cerrar"><NavIcon name="x" size={18} /></button>
        </div>

        <div className="ck-modal__scroll">
          <div className="ck-meta">
            {[
              { label: 'Código Toteat', value: plato.codigo_toteat ?? 'Sin código' },
              { label: 'Código KitchenOps', value: plato.cod_softland ?? '—' },
              { label: 'Cód. Defontana insumos', value: `${plato.con_defontana} de ${plato.lineas_receta}` },
              { label: `Vendidos ${fechaCorta(desde)}–${fechaCorta(hasta)}`, value: formatCantidad(plato.vendidos) },
            ].map(m => (
              <div key={m.label} className="ck-cost">
                <p className="ck-cost__label">{m.label}</p>
                <p className="ck-cost__value" style={{ fontSize: '17px' }}>{m.value}</p>
              </div>
            ))}
          </div>

          {plato.codigo_duplicado && (
            <div className="ck-block"><div className="ck-warn" style={{ margin: 0 }}>Este Código TOTEAT está asignado a más de un plato: no se calcula consumo hasta corregirlo.</div></div>
          )}

          <div className="ck-block">
            <p className="ck-block__title">
              <span>{conVentas ? 'Consumo calculado' : 'Receta por plato (sin ventas en el período)'}</span>
            </p>
            <TablaLineas titulo={`Productos directos (${directos.length})`} lineas={directos} conVentas={conVentas} />
            <div style={{ height: '12px' }} />
            <TablaLineas titulo={`PP (${pps.length})`} lineas={pps} conVentas={conVentas} />
          </div>

          <div className="ck-block">
            <div className="ck-note">
              <strong style={{ color: 'var(--tx)' }}>Total:</strong>{' '}
              {conVentas ? `${formatCantidad(plato.vendidos)} platos vendidos generan ` : 'La receta tiene '}
              {directos.length} línea(s) de productos directos y {pps.length} de PP.
              {sinCodigo > 0
                ? <> <strong style={{ color: '#B45309' }}>{sinCodigo} sin código Defontana</strong> (asignar en Maestros → Productos).</>
                : ' Todas tienen código Defontana.'}
            </div>
          </div>
        </div>

        <div className="ck-modal__foot">
          <span style={{ flex: 1, fontSize: '12px', color: 'var(--ts)' }}>Modo revisión — no se mueve stock en Defontana.</span>
          <button type="button" className="ck-btn" onClick={onClose}>Cerrar</button>
          <button type="button" className="ck-btn ck-btn--primary" disabled title="Disponible cuando la integración con Defontana esté validada">
            Generar consumo
          </button>
        </div>
      </div>
    </div>
  );
}

function TablaLineas({ titulo, lineas, conVentas }: { titulo: string; lineas: (LineaConsumo & { materias_primas?: MateriaPrimaPP[] | null })[]; conVentas: boolean }) {
  return (
    <div style={{ border: '1px solid var(--bo)', borderRadius: '10px', overflow: 'hidden' }}>
      <div className="ck-panel__head" style={{ color: 'var(--ts)' }}>{titulo}</div>
      {lineas.length === 0 ? (
        <p style={{ margin: 0, padding: '12px 14px', fontSize: '12.5px', color: 'var(--ts)' }}>Sin líneas.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="ck-table" style={{ minWidth: '620px' }}>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Código</th>
                <th>Cód. Defontana</th>
                <th className="num">Por plato</th>
                {conVentas && <th className="num">Total</th>}
              </tr>
            </thead>
            <tbody>
              {lineas.map(l => (
                <tr key={`${l.codigo_producto ?? l.nombre}-${l.unidad_medida ?? ''}`}>
                  <td>
                    {l.nombre}
                    {l.materias_primas && l.materias_primas.length > 0 && (
                      <ul className="ck-mp" title="Referencial: materias primas según la receta PP">
                        {l.materias_primas.map(mp => (
                          <li key={`${mp.codigo_producto ?? mp.nombre}-${mp.unidad_medida}`}>
                            ↳ {mp.nombre} · {formatCantidad(mp.total)} {mp.unidad_medida}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td><span className="ck-code">{l.codigo_producto ?? '—'}</span></td>
                  <td>{l.codigo_defontana ? <span className="ck-code">{l.codigo_defontana}</span> : <span className="ck-status ck-status--pendiente">Falta</span>}</td>
                  <td className="num">{formatCantidad(l.cantidad_por_plato)} {l.unidad_medida ?? ''}</td>
                  {conVentas && <td className="num" style={{ fontWeight: 700 }}>{formatCantidad(l.total)} {l.unidad_medida ?? ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
