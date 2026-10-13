'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { formatCLP } from '@/lib/calculos';
import NavIcon from '@/components/layout/NavIcon';
import Semaforo, { SEMAFORO } from '@/components/costos/Semaforo';
import PlatoConsulta from '@/components/costos/PlatoConsulta';
import PlatoEditor from '@/components/costos/PlatoEditor';
import ConsumoVentasPanel from '@/components/costos/ConsumoVentasPanel';
import DefontanaPanel from '@/components/costos/DefontanaPanel';
import { CartaTag, NOMBRE_CARTA, PlatoFoto, type Ingrediente, type Plato } from '@/components/costos/shared';
import { useRol } from '@/components/RolProvider';
import type { ColorSemaforo } from '@/types/database';
import '@/components/costos/costos.css';

const COLORES: { value: ColorSemaforo | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'green', label: 'Óptimo' },
  { value: 'yellow', label: 'Medio' },
  { value: 'red', label: 'Bajo' },
  { value: 'gray', label: 'Sin datos' },
];

const KPI_CLASE: Record<ColorSemaforo, string> = {
  green: 'ck-kpi--green',
  yellow: 'ck-kpi--yellow',
  red: 'ck-kpi--red',
  gray: 'ck-kpi--gray',
};

type Vista = 'lista' | 'mosaico';
type FiltroCarta = 'all' | 'ANTIGUA' | 'NUEVA';
type SeccionCostos = 'carta' | 'defontana' | 'consumo';
// Panel lateral derecho: consulta primero; editar/nuevo/copiar usan el mismo panel.
// Abrir/cerrar el panel o cambiar de modo cambia el numero de columnas del mosaico: con la
// View Transitions API cada tarjeta se desliza a su nueva posicion en vez de saltar.
// Sin soporte (o en modo cajon / movimiento reducido) se usan las transiciones CSS.
function usarTransicionVista() {
  if (typeof document === 'undefined' || !('startViewTransition' in document)) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return window.matchMedia('(min-width: 1241px)').matches;
}

type PanelPlato =
  | { modo: 'consulta' | 'editar' | 'copiar'; platoId: string }
  | { modo: 'nuevo' };

function normalizeSearch(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function ingredienteMatches(ing: Ingrediente, query: string) {
  const text = normalizeSearch([
    ing.codigo_producto,
    ing.nombre,
    ing.pp_id,
    ing.unidad_medida,
  ].filter(Boolean).join(' '));
  return text.includes(query);
}

function matchingIngredientes(plato: Plato, query: string) {
  if (!query) return [];
  return (plato.carta_ingredientes ?? []).filter(ing => ingredienteMatches(ing, query));
}

function platoMatches(plato: Plato, query: string) {
  return normalizeSearch([plato.nombre, plato.cod_softland, plato.codigo_toteat].filter(Boolean).join(' ')).includes(query);
}

function PlatoCard({ p, selected, onClick, productoQuery }: { p: Plato; selected: boolean; onClick: () => void; productoQuery: string }) {
  const matches = productoQuery && !platoMatches(p, productoQuery) ? matchingIngredientes(p, productoQuery) : [];
  const sem = SEMAFORO[p.semaforo];

  return (
    <button type="button" onClick={onClick} className={`ck-card${selected ? ' is-selected' : ''}`} aria-pressed={selected} style={{ viewTransitionName: `ck-card-${p.id}` }}>
      <div className="ck-card__img">
        <PlatoFoto src={p.foto_url} alt={p.nombre} />
        <span className="ck-card__pct" style={{ color: sem.color }}>
          {p.margen_pct != null ? `${p.margen_pct.toFixed(0)}%` : 'Sin ficha'}
        </span>
      </div>
      <div className="ck-card__body">
        <p className="ck-card__name" title={p.nombre}>{p.nombre}</p>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          <CartaTag tipo={p.tipo_carta ?? 'ANTIGUA'} />
        </div>
        {matches.length > 0 && (
          <div className="ck-card__match">
            {matches.slice(0, 2).map(ing => (
              <span key={ing.id} className="ck-tag ck-tag--match">{ing.nombre ?? ing.codigo_producto}</span>
            ))}
            {matches.length > 2 && <span className="ck-hint">+{matches.length - 2}</span>}
          </div>
        )}
        <div className="ck-card__foot">
          <span className="ck-card__price">{p.precio_carta != null ? formatCLP(p.precio_carta) : '—'}</span>
          <Semaforo color={p.semaforo} margen={p.margen_pct} compact />
        </div>
      </div>
    </button>
  );
}

export default function CostosPage() {
  const { rol } = useRol();
  const isAdmin = rol === 'admin';
  const canManage = rol === 'admin' || rol === 'finanzas';
  // Cocina y Gerencia entran a Costos solo en modo consulta y solo a la pestaña Carta.
  const puedeVerConsumo = rol !== 'cocina' && rol !== 'gerencia';
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [catFiltro, setCatFiltro] = useState('all');
  const [cartaFiltro, setCartaFiltro] = useState<FiltroCarta>('all');
  const [semFiltro, setSemFiltro] = useState<ColorSemaforo | 'all'>('all');
  const [productoBusqueda, setProductoBusqueda] = useState('');
  const [verFiltros, setVerFiltros] = useState(false);
  const [soloSinToteat, setSoloSinToteat] = useState(false);
  const [soloSinFoto, setSoloSinFoto] = useState(false);
  const [panel, setPanel] = useState<PanelPlato | null>(null);
  // Contenido que se sigue mostrando mientras el panel se cierra (animacion de ancho).
  const [panelVisible, setPanelVisible] = useState<PanelPlato | null>(null);
  const [seccion, setSeccion] = useState<SeccionCostos>('carta');
  // Al entrar a Costos siempre parte en vista Mosaico.
  const [vista, setVista] = useState<Vista>('mosaico');

  const cargarCarta = useCallback(() => {
    setError('');
    return fetch('/api/carta')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setPlatos(data);
      })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/carta')
      .then(r => r.json())
      .then(data => {
        if (!alive) return;
        if (data.error) throw new Error(data.error);
        setPlatos(data);
      })
      .catch(e => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const editando = panel != null && panel.modo !== 'consulta';

  const abrirPanel = useCallback((next: PanelPlato | null) => {
    if (!usarTransicionVista()) {
      // Transicion CSS: al cerrar, el contenido se mantiene hasta que termina de animarse el ancho.
      setPanel(next);
      if (next) setPanelVisible(next);
      return;
    }
    const doc = document as Document & { startViewTransition: (cb: () => void) => unknown };
    doc.startViewTransition(() => flushSync(() => {
      setPanel(next);
      setPanelVisible(next);
    }));
  }, []);

  function abrirPlato(p: Plato) {
    if (panel?.modo === 'consulta' && panel.platoId === p.id) return;
    if (editando && !window.confirm('Hay cambios sin guardar en el plato. ¿Descartarlos?')) return;
    abrirPanel({ modo: 'consulta', platoId: p.id });
  }

  function cerrarPanel() {
    if (editando && !window.confirm('Hay cambios sin guardar en el plato. ¿Descartarlos?')) return;
    abrirPanel(null);
  }

  // Escape cierra el panel solo en consulta (en edicion no se pierden cambios por accidente).
  useEffect(() => {
    if (panel?.modo !== 'consulta') return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') abrirPanel(null);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [panel, abrirPanel]);

  const seleccionado = panel && panel.modo !== 'nuevo' ? panel.platoId : null;

  // El panel es sticky pero parte bajo las pestañas: su alto se ajusta a lo visible para que
  // el pie de edicion (costos y botones) siempre se vea sin hacer scroll de la pagina.
  const layoutRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = layoutRef.current;
    if (!panel || !el) return;
    let frame = 0;
    const medir = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--ck-side-top', `${Math.max(16, Math.round(el.getBoundingClientRect().top))}px`);
      });
    };
    medir();
    window.addEventListener('scroll', medir, { passive: true });
    window.addEventListener('resize', medir);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', medir);
      window.removeEventListener('resize', medir);
    };
  }, [panel]);

  const categorias = useMemo(() => Array.from(new Set(platos.map(p => p.categoria))).sort(), [platos]);

  const productoQuery = useMemo(() => normalizeSearch(productoBusqueda), [productoBusqueda]);

  const filtrados = useMemo(() => (
    platos.filter(p =>
      (cartaFiltro === 'all' || (p.tipo_carta ?? 'ANTIGUA') === cartaFiltro) &&
      (catFiltro === 'all' || p.categoria === catFiltro) &&
      (semFiltro === 'all' || p.semaforo === semFiltro) &&
      (!soloSinToteat || !(p.codigo_toteat ?? '').trim()) &&
      (!soloSinFoto || !p.foto_url) &&
      (!productoQuery || platoMatches(p, productoQuery) || matchingIngredientes(p, productoQuery).length > 0),
    )
  ), [platos, cartaFiltro, catFiltro, semFiltro, soloSinToteat, soloSinFoto, productoQuery]);

  const grupos = useMemo(() => {
    const map = new Map<string, Plato[]>();
    for (const plato of filtrados) {
      const grupo = map.get(plato.categoria) ?? [];
      grupo.push(plato);
      map.set(plato.categoria, grupo);
    }
    return map;
  }, [filtrados]);

  const resumen = useMemo(() => {
    const cuenta: Record<ColorSemaforo, number> = { green: 0, yellow: 0, red: 0, gray: 0 };
    for (const p of platos) cuenta[p.semaforo] += 1;
    return cuenta;
  }, [platos]);

  const filtrosExtra = Number(soloSinToteat) + Number(soloSinFoto);
  const hayFiltros = !!productoBusqueda || cartaFiltro !== 'all' || catFiltro !== 'all' || semFiltro !== 'all' || filtrosExtra > 0;

  function limpiarFiltros() {
    setProductoBusqueda('');
    setCartaFiltro('all');
    setCatFiltro('all');
    setSemFiltro('all');
    setSoloSinToteat(false);
    setSoloSinFoto(false);
  }

  if (loading) {
    return <div className="page" style={{ color: 'var(--ts)', fontSize: '14px' }}>Cargando carta...</div>;
  }

  if (error) {
    return (
      <div className="page">
        <div className="ck-error">{error}</div>
      </div>
    );
  }

  const tabs: { id: SeccionCostos; label: string; nuevo?: boolean }[] = [
    { id: 'carta', label: 'Carta' },
    ...(puedeVerConsumo ? [
      { id: 'defontana' as SeccionCostos, label: 'Defontana', nuevo: true },
      { id: 'consumo' as SeccionCostos, label: 'Consumo ventas' },
    ] : []),
  ];

  return (
    <div className="page ck">
      <div className="ck-head">
        <div className="ck-title">
          <span className="ck-title__icon"><NavIcon name="chef-hat" size={26} strokeWidth={1.9} /></span>
          <div>
            <h1>COSTOS</h1>
            <p>Gestión de costos por plato — {platos.length} platos activos</p>
          </div>
        </div>
        {seccion === 'carta' && (
          <div className="ck-actions">
            {canManage && (
              <button type="button" className="ck-btn ck-btn--primary" onClick={() => { if (!editando || window.confirm('Hay cambios sin guardar en el plato. ¿Descartarlos?')) abrirPanel({ modo: 'nuevo' }); }}>
                <NavIcon name="plus" size={16} /> Nuevo plato
              </button>
            )}
            <div className="ck-toggle" role="group" aria-label="Vista">
              {([
                { v: 'lista' as Vista, icon: 'list', label: 'Lista' },
                { v: 'mosaico' as Vista, icon: 'layout-grid', label: 'Mosaico' },
              ]).map(({ v, icon, label }) => (
                <button key={v} type="button" onClick={() => setVista(v)} className={vista === v ? 'is-on' : undefined} aria-pressed={vista === v}>
                  <NavIcon name={icon} size={15} /> {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="ck-tabs" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={seccion === tab.id}
            onClick={() => { if (tab.id !== 'carta' && panel) abrirPanel(null); setSeccion(tab.id); }}
            className={`ck-tab${seccion === tab.id ? ' is-on' : ''}`}
          >
            {tab.label}
            {tab.nuevo && <span className="ck-new">Nuevo</span>}
          </button>
        ))}
      </div>

      {seccion === 'consumo' && puedeVerConsumo ? (
        <ConsumoVentasPanel />
      ) : seccion === 'defontana' && puedeVerConsumo ? (
        <DefontanaPanel />
      ) : (
      <div ref={layoutRef} className={`ck-layout${panel ? ' has-panel' : ''}${editando ? ' is-editing' : ''}`}>
      <div className="ck-main">

      <div className="ck-kpis">
        {([
          { key: 'green' as const, label: 'Óptimo ≥30%' },
          { key: 'yellow' as const, label: 'Medio 25–30%' },
          { key: 'red' as const, label: 'Bajo <25%' },
          { key: 'gray' as const, label: 'Sin datos' },
        ]).map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSemFiltro(prev => prev === s.key ? 'all' : s.key)}
            className={`ck-kpi ${KPI_CLASE[s.key]}${semFiltro === s.key ? ' is-on' : ''}`}
            aria-pressed={semFiltro === s.key}
          >
            <strong>{resumen[s.key]}</strong>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      <div className="ck-toolbar">
        <div className="ck-search">
          <NavIcon name="search" size={16} />
          <input
            type="search"
            value={productoBusqueda}
            onChange={e => setProductoBusqueda(e.target.value)}
            placeholder="Buscar plato o producto en recetas..."
          />
          {productoBusqueda && (
            <button type="button" className="ck-search__clear" onClick={() => setProductoBusqueda('')} aria-label="Limpiar búsqueda">
              <NavIcon name="x" size={15} />
            </button>
          )}
        </div>

        <select className="ck-select" value={cartaFiltro} onChange={e => setCartaFiltro(e.target.value as FiltroCarta)} aria-label="Carta">
          <option value="all">{NOMBRE_CARTA.all}</option>
          <option value="NUEVA">{NOMBRE_CARTA.NUEVA}</option>
          <option value="ANTIGUA">{NOMBRE_CARTA.ANTIGUA}</option>
        </select>

        <select className="ck-select" value={catFiltro} onChange={e => setCatFiltro(e.target.value)} aria-label="Categoría">
          <option value="all">Todas las categorías</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <button type="button" className={`ck-btn${verFiltros || filtrosExtra ? ' is-on' : ''}`} onClick={() => setVerFiltros(v => !v)} aria-expanded={verFiltros}>
          <NavIcon name="funnel" size={15} /> Filtros{filtrosExtra ? ` (${filtrosExtra})` : ''}
        </button>

        {productoQuery && (
          <span className="ck-hint">{filtrados.length} plato{filtrados.length !== 1 ? 's' : ''} encontrados</span>
        )}
      </div>

      {verFiltros && (
        <div className="ck-filters">
          <label><input type="checkbox" checked={soloSinToteat} onChange={e => setSoloSinToteat(e.target.checked)} /> Sin código Toteat</label>
          <label><input type="checkbox" checked={soloSinFoto} onChange={e => setSoloSinFoto(e.target.checked)} /> Sin foto</label>
        </div>
      )}

      <div className="ck-chips">
        {COLORES.map(c => (
          <button
            key={c.value}
            type="button"
            onClick={() => setSemFiltro(c.value)}
            className={`ck-chip${semFiltro === c.value ? ' is-on' : ''}`}
            aria-pressed={semFiltro === c.value}
          >
            {c.value !== 'all' && <span className="ck-dot" style={{ background: SEMAFORO[c.value].color }} />}
            {c.label}
          </button>
        ))}
        {hayFiltros && (
          <button type="button" className="ck-chip ck-chip--ghost" onClick={limpiarFiltros}>
            <NavIcon name="x" size={14} /> Limpiar
          </button>
        )}
      </div>

      {puedeVerConsumo && (
        <div className="ck-banner">
          <span className="ck-banner__icon"><NavIcon name="layers" size={20} /></span>
          <div className="ck-banner__body">
            <strong>Defontana <span className="ck-new">Nuevo</span></strong>
            <p>Integra tu carta con Defontana para gestionar códigos de venta Toteat, calcular la utilización en PP, administrar productos y realizar el descuento de stock automáticamente.</p>
          </div>
          <button type="button" className="ck-btn" onClick={() => setSeccion('defontana')}>
            Ir a Defontana <NavIcon name="arrow-right" size={15} />
          </button>
        </div>
      )}

      <p className="ck-section-title">{NOMBRE_CARTA[cartaFiltro]} · {filtrados.length} plato{filtrados.length !== 1 ? 's' : ''}</p>

      {filtrados.length === 0 && (
        <div className="ck-empty">
          {productoQuery ? 'No hay platos con ese nombre, código o producto.' : 'No hay platos que coincidan con los filtros.'}
        </div>
      )}

      {vista === 'lista' && Array.from(grupos.entries()).map(([cat, items]) => (
        <div key={cat} className="ck-panel">
          <div className="ck-panel__head">{cat} · {items.length} plato{items.length !== 1 ? 's' : ''}</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="ck-table ck-table--click" style={{ minWidth: '840px' }}>
              <thead>
                <tr>
                  <th style={{ width: '56px' }} aria-label="Foto" />
                  <th>Plato</th>
                  {productoQuery && <th>Producto encontrado</th>}
                  <th>Carta</th>
                  <th className="num">Precio carta</th>
                  <th className="num">Costo bruto</th>
                  <th>Margen</th>
                </tr>
              </thead>
              <tbody>
                {items.map(p => {
                  const matches = matchingIngredientes(p, productoQuery);
                  return (
                    <tr key={p.id} onClick={() => abrirPlato(p)} className={seleccionado === p.id ? 'is-selected' : undefined}>
                      <td style={{ padding: '8px 8px 8px 14px' }}>
                        <div className="ck-thumb"><PlatoFoto src={p.foto_url} alt={p.nombre} iconSize={18} className="ck-thumb" /></div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                      {productoQuery && (
                        <td style={{ maxWidth: '260px' }}>
                          <div className="ck-card__match">
                            {matches.slice(0, 3).map(ing => (
                              <span key={ing.id} className="ck-tag ck-tag--match">{ing.nombre ?? ing.codigo_producto}</span>
                            ))}
                            {matches.length > 3 && <span className="ck-hint">+{matches.length - 3}</span>}
                          </div>
                        </td>
                      )}
                      <td><CartaTag tipo={p.tipo_carta ?? 'ANTIGUA'} /></td>
                      <td className="num" style={{ fontWeight: 600 }}>{p.precio_carta != null ? formatCLP(p.precio_carta) : '—'}</td>
                      <td className="num muted">
                        {p.semaforo === 'gray' && !p.costo_neto ? 'Sin ficha' : formatCLP(p.costo_bruto)}
                      </td>
                      <td><Semaforo color={p.semaforo} margen={p.margen_pct} compact /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {vista === 'mosaico' && filtrados.length > 0 && (
        <div className="ck-grid">
          {filtrados.map(p => (
            <PlatoCard key={p.id} p={p} selected={seleccionado === p.id} onClick={() => abrirPlato(p)} productoQuery={productoQuery} />
          ))}
        </div>
      )}

      </div>

      <div className="ck-side-backdrop" onClick={cerrarPanel} aria-hidden="true" />
      <aside
        className="ck-side"
        aria-label="Detalle del plato"
        onTransitionEnd={e => { if (e.target === e.currentTarget && !panel) setPanelVisible(null); }}
      >
        {panelVisible && (
          <div className="ck-side__box">
            <button type="button" className="ck-close" onClick={cerrarPanel} aria-label="Cerrar panel">
              <NavIcon name="x" size={18} />
            </button>
            {renderPanel(panelVisible)}
          </div>
        )}
      </aside>
      </div>
      )}
    </div>
  );

  function renderPanel(estado: PanelPlato) {
    if (estado.modo === 'nuevo') {
      return (
        <PlatoEditor
          key="nuevo"
          plato={null}
          defaultTipoCarta={cartaFiltro === 'NUEVA' ? 'NUEVA' : 'ANTIGUA'}
          onCancel={() => abrirPanel(null)}
          onSaved={id => { void cargarCarta(); abrirPanel(id ? { modo: 'consulta', platoId: id } : null); }}
        />
      );
    }
    const plato = platos.find(p => p.id === estado.platoId);
    if (!plato) return null;
    if (estado.modo === 'consulta') {
      return (
        <PlatoConsulta
          key={plato.id}
          plato={plato}
          onEdit={canManage ? () => abrirPanel({ modo: 'editar', platoId: plato.id }) : undefined}
          onCopy={isAdmin ? () => abrirPanel({ modo: 'copiar', platoId: plato.id }) : undefined}
        />
      );
    }
    const copia = estado.modo === 'copiar';
    return (
      <PlatoEditor
        key={`${estado.modo}-${plato.id}`}
        plato={plato}
        forceCreate={copia}
        onCancel={() => abrirPanel({ modo: 'consulta', platoId: plato.id })}
        onSaved={id => { void cargarCarta(); abrirPanel({ modo: 'consulta', platoId: id ?? plato.id }); }}
        canDelete={isAdmin && !copia}
        onDeleted={() => { void cargarCarta(); abrirPanel(null); }}
      />
    );
  }
}