'use client';

import { Fragment, useMemo, useState } from 'react';
import { BODEGA_LABEL, SUBTIPO_LABEL, hoyChile, rangoParaModo, type ModoRangoFecha } from '@/lib/config-carnicos';
import type { BodegaCarnico, SubtipoCarnico, TipoInventarioCarnico, TipoMovimientoCarnico } from '@/types/carnicos';
import { useRol } from '@/components/RolProvider';
import FiltroRangoFechas from '../components/FiltroRangoFechas';
import HistorialEditorDrawer, { type GrupoEditable, type ItemEditable } from '../components/HistorialEditorDrawer';
import type { Maestros } from '../page';

interface MovimientoHistorial {
  id: string;
  fecha: string;
  responsable_id: string | null;
  responsable_nombre: string;
  observacion: string | null;
  bodega: BodegaCarnico;
  movimiento: TipoMovimientoCarnico;
  subtipo: SubtipoCarnico;
  producto_id: string;
  producto_nombre: string;
  unidad_medida: string;
  cantidad: number;
  origen: 'manual' | 'venta_toteat';
  created_at: string;
}

interface GrupoMovimiento {
  key: string;
  fecha: string;
  movimiento: TipoMovimientoCarnico;
  subtipo: SubtipoCarnico;
  bodega: BodegaCarnico;
  turno: 'AM' | 'PM' | null;
  responsable_id: string | null;
  responsable_nombre: string;
  observacion: string | null;
  esVenta: boolean;
  maxCreatedAt: string;
  items: MovimientoHistorial[];
}

interface InventarioHistorial {
  id: string;
  fecha: string;
  responsable_id: string | null;
  responsable_nombre: string;
  bodega: BodegaCarnico;
  tipo: TipoInventarioCarnico;
  producto_id: string;
  producto_nombre: string;
  unidad_medida: string;
  cantidad: number;
}

interface GrupoInventario {
  key: string;
  fecha: string;
  bodega: BodegaCarnico;
  tipo: TipoInventarioCarnico;
  responsable_id: string | null;
  responsable_nombre: string;
  items: InventarioHistorial[];
}

interface GrupoFecha<T> {
  fecha: string;
  grupos: T[];
}

function fmt(value: number) {
  const decimals = Math.abs(value) % 1 === 0 ? 0 : 2;
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: decimals }).format(value);
}

function isoAFecha(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function totalPorUnidad(items: { cantidad: number; unidad_medida: string }[]): string {
  const map = new Map<string, number>();
  for (const it of items) map.set(it.unidad_medida, (map.get(it.unidad_medida) ?? 0) + it.cantidad);
  const partes = Array.from(map.entries()).map(([um, total]) => `${fmt(total)} ${um}`);
  return partes.length ? partes.join(' + ') : '—';
}

// Coincidencia por nombre de producto insensible a mayusculas/acentos (mismo criterio que el
// buscador de ProductoCarnicoSelector), para que "asado" encuentre "Asado Carnicero".
function normalizarTexto(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

function agruparPorFecha<T extends { fecha: string }>(grupos: T[]): GrupoFecha<T>[] {
  const map = new Map<string, T[]>();
  for (const g of grupos) {
    const list = map.get(g.fecha) ?? [];
    list.push(g);
    map.set(g.fecha, list);
  }
  return Array.from(map.entries())
    .map(([fecha, gs]) => ({ fecha, grupos: gs }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

type SubTab = 'ingresos' | 'salidas' | 'inv_inicial' | 'inv_final' | 'ventas';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'salidas', label: 'Salidas' },
  { id: 'inv_inicial', label: 'Inv. Inicial' },
  { id: 'inv_final', label: 'Inv. Final' },
  { id: 'ventas', label: 'Ventas' },
];

const ES_SUBTAB_INVENTARIO = (t: SubTab) => t === 'inv_inicial' || t === 'inv_final';

const chevron = (abierto: boolean) => (
  <span
    aria-hidden
    style={{ display: 'inline-block', fontSize: '10px', color: 'var(--ts)', transition: 'transform 0.15s', transform: abierto ? 'rotate(90deg)' : 'none' }}
  >
    ▸
  </span>
);

const badgeUltimo = (
  <span style={{ marginLeft: '8px', display: 'inline-block', background: 'var(--al)', color: 'var(--ac)', border: '1px solid var(--ac)', borderRadius: '20px', padding: '1px 8px', fontSize: '10px', fontWeight: 700 }}>
    Último
  </span>
);

const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '9px 12px', fontSize: '12.5px' };
const accionBtn: React.CSSProperties = { background: 'none', border: '1px solid var(--bo)', borderRadius: '6px', cursor: 'pointer', color: 'var(--ts)', fontSize: '11.5px', fontWeight: 700, padding: '4px 9px' };
const accionBtnEliminar: React.CSSProperties = { ...accionBtn, color: '#DC2626', borderColor: '#FCA5A5', display: 'inline-flex', alignItems: 'center', lineHeight: 1 };

export default function HistorialTab({ maestros }: { maestros: Maestros }) {
  const { puede } = useRol();
  // Solo administrador puede editar/eliminar movimientos e inventarios ya guardados.
  // El sistema de permisos ya acopla editar/eliminar 1:1 (solo admin tiene ambos en true), asi que
  // un unico flag gobierna el boton "Editar" y, dentro del drawer, sus acciones de borrado.
  const puedeEditar = puede('controlCarnicos', 'editar');
  const hoy = hoyChile();

  const [subTab, setSubTab] = useState<SubTab>('ingresos');
  const [modo, setModo] = useState<ModoRangoFecha>('dia');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [movimientos, setMovimientos] = useState<MovimientoHistorial[] | null>(null);
  const [inventarios, setInventarios] = useState<InventarioHistorial[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [fechasAbiertas, setFechasAbiertas] = useState<Set<string>>(new Set());
  const [batchesAbiertos, setBatchesAbiertos] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<GrupoEditable | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState<
    | { variante: 'movimiento'; grupo: GrupoMovimiento }
    | { variante: 'inventario'; grupo: GrupoInventario }
    | null
  >(null);
  const [eliminando, setEliminando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const busquedaNormalizada = normalizarTexto(busqueda);

  function toggleFecha(key: string) {
    setFechasAbiertas(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  function toggleBatch(key: string) {
    setBatchesAbiertos(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  async function fetchHistorial(d: string, h: string) {
    setLoading(true);
    setError('');
    setFechasAbiertas(new Set());
    setBatchesAbiertos(new Set());
    try {
      const [movRes, invRes] = await Promise.all([
        fetch(`/api/control-carnicos/movimientos?desde=${d}&hasta=${h}`),
        fetch(`/api/control-carnicos/inventarios?desde=${d}&hasta=${h}`),
      ]);
      const movJson = await movRes.json();
      const invJson = await invRes.json();
      if (!movRes.ok) throw new Error(movJson.error ?? 'Error consultando movimientos');
      if (!invRes.ok) throw new Error(invJson.error ?? 'Error consultando inventarios');
      setMovimientos(Array.isArray(movJson) ? movJson : []);
      setInventarios(Array.isArray(invJson) ? invJson : []);
    } catch (e) {
      setMovimientos(null);
      setInventarios(null);
      setError(e instanceof Error ? e.message : 'Error consultando historial');
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
    fetchHistorial(d, h);
  }

  function consultar() {
    if (desde > hasta) { setError('La fecha "desde" no puede ser posterior a "hasta".'); return; }
    fetchHistorial(desde, hasta);
  }

  function refrescar() {
    fetchHistorial(desde, hasta);
  }

  // Cada sesion de Ingreso/Salida se carga con la misma fecha/movimiento/subtipo/responsable/
  // observacion para varios productos a la vez (una fila por producto en carnicos_movimientos).
  // Las ventas de Toteat traen su propia observacion por fila (el plato de origen), asi que se
  // agrupan solo por fecha para que la venta del dia quede en un solo movimiento expandible.
  const gruposMovimientos = useMemo(() => {
    if (!movimientos) return [];
    const map = new Map<string, GrupoMovimiento>();
    for (const m of movimientos) {
      const esVenta = m.subtipo === 'VENTAS';
      const key = esVenta
        ? `venta||${m.fecha}`
        : `${m.fecha}||${m.movimiento}||${m.subtipo}||${m.responsable_nombre}||${m.observacion ?? ''}`;
      const existente = map.get(key);
      if (existente) {
        existente.items.push(m);
        if (m.created_at > existente.maxCreatedAt) existente.maxCreatedAt = m.created_at;
      } else {
        map.set(key, {
          key, fecha: m.fecha, movimiento: m.movimiento, subtipo: m.subtipo, bodega: m.bodega, turno: null,
          responsable_id: m.responsable_id, responsable_nombre: m.responsable_nombre,
          observacion: esVenta ? null : m.observacion, esVenta, maxCreatedAt: m.created_at, items: [m],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.maxCreatedAt.localeCompare(a.maxCreatedAt));
  }, [movimientos]);

  const gruposInventarios = useMemo(() => {
    if (!inventarios) return [];
    const map = new Map<string, GrupoInventario>();
    for (const inv of inventarios) {
      const key = `${inv.fecha}||${inv.bodega}||${inv.tipo}||${inv.responsable_nombre}`;
      const existente = map.get(key);
      if (existente) existente.items.push(inv);
      else map.set(key, {
        key, fecha: inv.fecha, bodega: inv.bodega, tipo: inv.tipo,
        responsable_id: inv.responsable_id, responsable_nombre: inv.responsable_nombre, items: [inv],
      });
    }
    return Array.from(map.values());
  }, [inventarios]);

  // El buscador filtra por movimiento/conteo (deja el grupo completo intacto, con todos sus
  // productos) en vez de recortar items sueltos: asi "Ver"/"Editar" siguen mostrando el
  // movimiento entero, y el buscador solo decide que fechas/movimientos son relevantes.
  const gruposMovimientosFiltrados = useMemo(() => {
    if (!busquedaNormalizada) return gruposMovimientos;
    return gruposMovimientos.filter(g => g.items.some(it => normalizarTexto(it.producto_nombre).includes(busquedaNormalizada)));
  }, [gruposMovimientos, busquedaNormalizada]);

  const gruposInventariosFiltrados = useMemo(() => {
    if (!busquedaNormalizada) return gruposInventarios;
    return gruposInventarios.filter(g => g.items.some(it => normalizarTexto(it.producto_nombre).includes(busquedaNormalizada)));
  }, [gruposInventarios, busquedaNormalizada]);

  const gruposIngresos = useMemo(() => gruposMovimientosFiltrados.filter(g => !g.esVenta && g.movimiento === 'INGRESO'), [gruposMovimientosFiltrados]);
  const gruposSalidas = useMemo(() => gruposMovimientosFiltrados.filter(g => !g.esVenta && g.movimiento === 'SALIDA'), [gruposMovimientosFiltrados]);
  const gruposVentas = useMemo(() => gruposMovimientosFiltrados.filter(g => g.esVenta), [gruposMovimientosFiltrados]);

  const gruposInvInicial = useMemo(() => gruposInventariosFiltrados.filter(g => g.tipo === 'INICIAL'), [gruposInventariosFiltrados]);
  const gruposInvFinal = useMemo(() => gruposInventariosFiltrados.filter(g => g.tipo === 'FINAL'), [gruposInventariosFiltrados]);

  const fechasIngresos = useMemo(() => agruparPorFecha(gruposIngresos), [gruposIngresos]);
  const fechasSalidas = useMemo(() => agruparPorFecha(gruposSalidas), [gruposSalidas]);
  const fechasVentas = useMemo(() => agruparPorFecha(gruposVentas), [gruposVentas]);
  const fechasInvInicial = useMemo(() => agruparPorFecha(gruposInvInicial), [gruposInvInicial]);
  const fechasInvFinal = useMemo(() => agruparPorFecha(gruposInvFinal), [gruposInvFinal]);

  function abrirEditorMovimiento(g: GrupoMovimiento) {
    const items: ItemEditable[] = g.items.map(it => ({
      id: it.id, producto_id: it.producto_id, producto_nombre: it.producto_nombre,
      unidad_medida: it.unidad_medida, cantidad: it.cantidad, subtipo: it.subtipo, observacion: it.observacion,
    }));
    setDrawer({
      key: g.key, variante: 'movimiento', fecha: g.fecha, responsable_id: g.responsable_id, responsable_nombre: g.responsable_nombre,
      movimiento: g.movimiento, bodega: g.bodega, turno: g.turno, items,
    });
  }

  function abrirEditorInventario(g: GrupoInventario) {
    const items: ItemEditable[] = g.items.map(it => ({
      id: it.id, producto_id: it.producto_id, producto_nombre: it.producto_nombre,
      unidad_medida: it.unidad_medida, cantidad: it.cantidad,
    }));
    setDrawer({
      key: g.key, variante: 'inventario', fecha: g.fecha, responsable_id: g.responsable_id, responsable_nombre: g.responsable_nombre,
      bodega: g.bodega, tipoInventario: g.tipo, items,
    });
  }

  function onDrawerSaved() {
    refrescar();
  }

  // Elimina el movimiento (o conteo de inventario) completo directamente desde la lista,
  // borrando todas sus filas por id en una sola llamada. Requiere confirmacion explicita (mismo criterio que el drawer).
  async function eliminarGrupoConfirmado() {
    if (!confirmarEliminar) return;
    setEliminando(true);
    setError('');
    try {
      const url = confirmarEliminar.variante === 'movimiento'
        ? '/api/control-carnicos/movimientos'
        : '/api/control-carnicos/inventarios';
      // Una sola llamada con todos los productos del grupo (antes era una por producto).
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: confirmarEliminar.grupo.items.map(it => it.id) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Error eliminando');
      // Si el drawer estaba abierto sobre este mismo grupo, se cierra.
      if (drawer && drawer.key === confirmarEliminar.grupo.key) setDrawer(null);
      setConfirmarEliminar(null);
      refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminando');
    } finally {
      setEliminando(false);
    }
  }

  const cargandoAlgo = loading;
  const sinConsulta = !movimientos && !inventarios && !error && !loading;

  const esInventario = ES_SUBTAB_INVENTARIO(subTab);
  const listaFechasActiva = subTab === 'ingresos' ? fechasIngresos
    : subTab === 'salidas' ? fechasSalidas
    : subTab === 'ventas' ? fechasVentas
    : subTab === 'inv_inicial' ? fechasInvInicial
    : fechasInvFinal;
  const fechaUltimo = listaFechasActiva[0]?.fecha;

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <FiltroRangoFechas
        modo={modo} desde={desde} hasta={hasta} loading={loading}
        onModo={aplicarModo}
        onDesde={v => { setDesde(v); setModo('personalizado'); }}
        onHasta={v => { setHasta(v); setModo('personalizado'); }}
        onConsultar={consultar}
      />

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', padding: '12px 14px', fontSize: '13px' }}>{error}</div>}

      {sinConsulta && (
        <div style={{ color: 'var(--ts)', fontSize: '13px' }}>Selecciona un rango y presiona Consultar para ver el historial.</div>
      )}

      {(movimientos || inventarios || loading) && (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <section
            style={{
              flex: drawer ? '1 1 60%' : '1 1 100%', minWidth: 0,
              background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', overflowX: 'auto' }}>
                {SUB_TABS.map(({ id, label }) => {
                  const cantidad = id === 'ingresos' ? fechasIngresos.length
                    : id === 'salidas' ? fechasSalidas.length
                    : id === 'inv_inicial' ? fechasInvInicial.length
                    : id === 'inv_final' ? fechasInvFinal.length
                    : fechasVentas.length;
                  const activa = subTab === id;
                  return (
                    <button
                      key={id} type="button" onClick={() => setSubTab(id)}
                      aria-current={activa ? 'true' : undefined}
                      style={{
                        padding: '13px 20px', background: activa ? 'var(--sf)' : 'none', border: 'none', cursor: 'pointer',
                        fontSize: '13px', fontWeight: activa ? 800 : 500, color: activa ? 'var(--ac)' : 'var(--ts)',
                        borderBottom: `2px solid ${activa ? 'var(--ac)' : 'transparent'}`,
                        marginBottom: '-1px', fontFamily: 'DM Sans, sans-serif', transition: 'color 0.15s',
                        display: 'inline-flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                      {cantidad > 0 && (
                        <span style={{ background: activa ? 'var(--ac)' : 'var(--bo)', color: activa ? '#fff' : 'var(--ts)', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>{cantidad}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div style={{ position: 'relative', margin: '8px 14px 8px 0', minWidth: '200px' }}>
                <span aria-hidden style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--ts)', pointerEvents: 'none' }}>⌕</span>
                <input
                  type="search"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar producto..."
                  aria-label="Buscar por producto en el historial"
                  style={{
                    width: '100%', border: '1.5px solid var(--bo)', borderRadius: '20px', padding: '7px 12px 7px 28px',
                    fontSize: '12.5px', background: 'var(--sf)', color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                />
              </div>
            </div>

            {cargandoAlgo && listaFechasActiva.length === 0 && (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Cargando...</div>
            )}

            {!cargandoAlgo && listaFechasActiva.length === 0 && busquedaNormalizada && (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>
                Sin resultados para “{busqueda.trim()}” en el rango seleccionado.
              </div>
            )}

            {!cargandoAlgo && listaFechasActiva.length === 0 && !busquedaNormalizada && (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>
                Sin {esInventario ? 'conteos de inventario' : 'movimientos'} en el rango seleccionado.
              </div>
            )}

            {listaFechasActiva.length > 0 && !esInventario && (
              <TablaFechasMovimientos
                fechas={listaFechasActiva as GrupoFecha<GrupoMovimiento>[]}
                fechaUltimo={fechaUltimo}
                soloVentas={subTab === 'ventas'}
                fechasAbiertas={fechasAbiertas} onToggleFecha={toggleFecha}
                batchesAbiertos={batchesAbiertos} onToggleBatch={toggleBatch}
                puedeEditar={puedeEditar}
                onEditar={abrirEditorMovimiento}
                onEliminar={g => setConfirmarEliminar({ variante: 'movimiento', grupo: g })}
                busqueda={busquedaNormalizada}
              />
            )}

            {listaFechasActiva.length > 0 && esInventario && (
              <TablaFechasInventarios
                fechas={listaFechasActiva as GrupoFecha<GrupoInventario>[]}
                fechaUltimo={fechaUltimo}
                fechasAbiertas={fechasAbiertas} onToggleFecha={toggleFecha}
                batchesAbiertos={batchesAbiertos} onToggleBatch={toggleBatch}
                puedeEditar={puedeEditar}
                onEditar={abrirEditorInventario}
                onEliminar={g => setConfirmarEliminar({ variante: 'inventario', grupo: g })}
                busqueda={busquedaNormalizada}
              />
            )}
          </section>

          {drawer && (
            <div className="hist-drawer-slot" style={{ flex: '0 0 38%', minWidth: '340px' }}>
              <HistorialEditorDrawer
                grupo={drawer}
                maestros={maestros}
                onClose={() => setDrawer(null)}
                onSaved={onDrawerSaved}
              />
            </div>
          )}
        </div>
      )}

      {confirmarEliminar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,20,0.4)', zIndex: 960, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--sf)', borderRadius: '14px', padding: '22px', width: '100%', maxWidth: '400px', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 8px', fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 800 }}>
              {confirmarEliminar.variante === 'movimiento' ? 'Eliminar movimiento completo' : 'Eliminar conteo de inventario'}
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: '13px', color: 'var(--ts)', lineHeight: 1.5 }}>
              Se eliminará el {confirmarEliminar.variante === 'movimiento' ? 'movimiento' : 'conteo'} completo del {isoAFecha(confirmarEliminar.grupo.fecha)} junto con sus {confirmarEliminar.grupo.items.length} producto{confirmarEliminar.grupo.items.length !== 1 ? 's' : ''}. Esta acción afectará el historial y los cálculos relacionados.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setConfirmarEliminar(null)} disabled={eliminando} style={{ background: 'none', border: '1px solid var(--bo)', color: 'var(--ts)', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              <button type="button" onClick={eliminarGrupoConfirmado} disabled={eliminando} style={{ background: 'none', border: '1px solid #FCA5A5', color: '#DC2626', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
                {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .hist-drawer-slot { flex: 0 0 auto !important; width: 0 !important; min-width: 0 !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Ingresos / Salidas / Ventas: Fecha → Movimiento(s) → Productos ──────────

function TablaFechasMovimientos({
  fechas, fechaUltimo, soloVentas, fechasAbiertas, onToggleFecha, batchesAbiertos, onToggleBatch, puedeEditar, onEditar, onEliminar, busqueda,
}: {
  fechas: GrupoFecha<GrupoMovimiento>[];
  fechaUltimo?: string;
  soloVentas: boolean;
  fechasAbiertas: Set<string>;
  onToggleFecha: (key: string) => void;
  batchesAbiertos: Set<string>;
  onToggleBatch: (key: string) => void;
  puedeEditar: boolean;
  onEditar: (g: GrupoMovimiento) => void;
  onEliminar: (g: GrupoMovimiento) => void;
  /** Termino de busqueda ya normalizado (minusculas, sin acentos); resalta filas de producto que coinciden. */
  busqueda: string;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {['', 'Fecha', 'Movimientos', 'Productos', 'Cantidad total', 'Responsable', 'Acciones'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fechas.map(fg => {
            const abierta = fechasAbiertas.has(fg.fecha);
            const productos = fg.grupos.reduce((acc, g) => acc + g.items.length, 0);
            const todosLosItems = fg.grupos.flatMap(g => g.items);
            const responsables = new Set(fg.grupos.map(g => g.responsable_nombre));
            const responsableTexto = responsables.size === 1 ? fg.grupos[0].responsable_nombre : `Varios (${responsables.size})`;
            const unBatch = fg.grupos.length === 1 ? fg.grupos[0] : null;

            return (
              <Fragment key={fg.fecha}>
                <tr onClick={() => onToggleFecha(fg.fecha)} style={{ borderBottom: abierta ? 'none' : '1px solid var(--bo)', cursor: 'pointer' }}>
                  <td style={{ padding: '9px 4px 9px 12px', width: '20px' }}>{chevron(abierta)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {isoAFecha(fg.fecha)}
                    {fg.fecha === fechaUltimo && badgeUltimo}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 800 }}>{fg.grupos.length}</td>
                  <td style={tdStyle}>{productos}</td>
                  <td style={tdStyle}>{totalPorUnidad(todosLosItems)}</td>
                  <td style={tdStyle}>{responsableTexto}</td>
                  <td style={tdStyle} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button type="button" onClick={() => onToggleFecha(fg.fecha)} style={accionBtn}>Ver</button>
                      {!soloVentas && puedeEditar && unBatch && (
                        <>
                          <button type="button" onClick={() => onEditar(unBatch)} style={{ ...accionBtn, color: 'var(--ac)', borderColor: 'var(--ac)' }}>Editar</button>
                          <button type="button" onClick={() => onEliminar(unBatch)} title="Eliminar movimiento completo" aria-label="Eliminar movimiento completo" style={accionBtnEliminar}>🗑</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>

                {abierta && (
                  <tr style={{ borderBottom: '1px solid var(--bo)' }}>
                    <td colSpan={7} style={{ padding: 0, background: 'var(--bg)' }}>
                      {unBatch ? (
                        <DetalleProductosMovimiento items={unBatch.items} esVenta={unBatch.esVenta} busqueda={busqueda} />
                      ) : (
                        <div style={{ padding: '10px 16px 14px 34px', display: 'grid', gap: '8px' }}>
                          {fg.grupos.map(g => {
                            const batchAbierto = batchesAbiertos.has(g.key);
                            return (
                              <div key={g.key} style={{ border: '1px solid var(--bo)', borderRadius: '10px', background: 'var(--sf)', overflow: 'hidden' }}>
                                <div
                                  onClick={() => onToggleBatch(g.key)}
                                  style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flexWrap: 'wrap' }}
                                >
                                  {chevron(batchAbierto)}
                                  <span style={{
                                    display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                                    background: g.movimiento === 'INGRESO' ? '#D1FAE5' : '#FEE2E2', color: g.movimiento === 'INGRESO' ? '#065F46' : '#991B1B',
                                  }}>
                                    {g.movimiento === 'INGRESO' ? 'Ingreso' : 'Salida'}
                                  </span>
                                  <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{SUBTIPO_LABEL[g.subtipo] ?? g.subtipo}</span>
                                  <span style={{ fontSize: '12px', color: 'var(--ts)' }}>· {g.items.length} producto{g.items.length !== 1 ? 's' : ''}</span>
                                  <span style={{ fontSize: '12px', color: 'var(--ts)' }}>· {g.responsable_nombre}</span>
                                  <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                                    <button type="button" onClick={() => onToggleBatch(g.key)} style={accionBtn}>Ver</button>
                                    {!soloVentas && puedeEditar && (
                                      <>
                                        <button type="button" onClick={() => onEditar(g)} style={{ ...accionBtn, color: 'var(--ac)', borderColor: 'var(--ac)' }}>Editar</button>
                                        <button type="button" onClick={() => onEliminar(g)} title="Eliminar movimiento completo" aria-label="Eliminar movimiento completo" style={accionBtnEliminar}>🗑</button>
                                      </>
                                    )}
                                  </span>
                                </div>
                                {batchAbierto && <DetalleProductosMovimiento items={g.items} esVenta={g.esVenta} busqueda={busqueda} />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetalleProductosMovimiento({ items, esVenta, busqueda }: { items: MovimientoHistorial[]; esVenta: boolean; busqueda?: string }) {
  return (
    <div style={{ padding: '4px 16px 12px 34px' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
          <thead>
            <tr>
              {['Producto', 'Cantidad', 'U/M', esVenta ? 'Plato de origen' : 'Subtipo', 'Observación'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '9.5px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const coincide = !!busqueda && normalizarTexto(it.producto_nombre).includes(busqueda);
              return (
                <tr key={it.id} style={coincide ? { background: 'var(--al)' } : undefined}>
                  <td style={{ padding: '6px 10px', fontSize: '12.5px', fontWeight: 600 }}>{it.producto_nombre}</td>
                  <td style={{ padding: '6px 10px', fontSize: '12.5px' }}>{fmt(it.cantidad)}</td>
                  <td style={{ padding: '6px 10px', fontSize: '12.5px', color: 'var(--ts)' }}>{it.unidad_medida}</td>
                  <td style={{ padding: '6px 10px', fontSize: '12.5px', color: 'var(--ts)' }}>{esVenta ? '—' : (SUBTIPO_LABEL[it.subtipo] ?? it.subtipo)}</td>
                  <td style={{ padding: '6px 10px', fontSize: '12.5px', color: 'var(--ts)' }}>{it.observacion || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '8px 10px 0', fontSize: '11.5px', color: 'var(--ts)', fontWeight: 600 }}>
        Total: {items.length} producto{items.length !== 1 ? 's' : ''} · {totalPorUnidad(items)}
      </p>
    </div>
  );
}

// ─── Inventarios: Fecha → Cámara/Bodega → Productos ──────────────────────────

function TablaFechasInventarios({
  fechas, fechaUltimo, fechasAbiertas, onToggleFecha, batchesAbiertos, onToggleBatch, puedeEditar, onEditar, onEliminar, busqueda,
}: {
  fechas: GrupoFecha<GrupoInventario>[];
  fechaUltimo?: string;
  fechasAbiertas: Set<string>;
  onToggleFecha: (key: string) => void;
  batchesAbiertos: Set<string>;
  onToggleBatch: (key: string) => void;
  puedeEditar: boolean;
  onEditar: (g: GrupoInventario) => void;
  onEliminar: (g: GrupoInventario) => void;
  busqueda: string;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '680px' }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {['', 'Fecha', 'Cámaras / Bodegas', 'Productos contabilizados', 'Responsable', 'Acciones'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fechas.map(fg => {
            const abierta = fechasAbiertas.has(fg.fecha);
            const productos = fg.grupos.reduce((acc, g) => acc + g.items.length, 0);
            const responsables = new Set(fg.grupos.map(g => g.responsable_nombre));
            const responsableTexto = responsables.size === 1 ? fg.grupos[0].responsable_nombre : `Varios (${responsables.size})`;
            const unBatch = fg.grupos.length === 1 ? fg.grupos[0] : null;

            return (
              <Fragment key={fg.fecha}>
                <tr onClick={() => onToggleFecha(fg.fecha)} style={{ borderBottom: abierta ? 'none' : '1px solid var(--bo)', cursor: 'pointer' }}>
                  <td style={{ padding: '9px 4px 9px 12px', width: '20px' }}>{chevron(abierta)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {isoAFecha(fg.fecha)}
                    {fg.fecha === fechaUltimo && badgeUltimo}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 800 }}>{fg.grupos.length}</td>
                  <td style={tdStyle}>{productos}</td>
                  <td style={tdStyle}>{responsableTexto}</td>
                  <td style={tdStyle} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button type="button" onClick={() => onToggleFecha(fg.fecha)} style={accionBtn}>Ver</button>
                      {puedeEditar && unBatch && (
                        <>
                          <button type="button" onClick={() => onEditar(unBatch)} style={{ ...accionBtn, color: 'var(--ac)', borderColor: 'var(--ac)' }}>Editar</button>
                          <button type="button" onClick={() => onEliminar(unBatch)} title="Eliminar conteo completo" aria-label="Eliminar conteo completo" style={accionBtnEliminar}>🗑</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>

                {abierta && (
                  <tr style={{ borderBottom: '1px solid var(--bo)' }}>
                    <td colSpan={6} style={{ padding: 0, background: 'var(--bg)' }}>
                      {unBatch ? (
                        <DetalleProductosInventario items={unBatch.items} busqueda={busqueda} />
                      ) : (
                        <div style={{ padding: '10px 16px 14px 34px', display: 'grid', gap: '8px' }}>
                          {fg.grupos.map(g => {
                            const batchAbierto = batchesAbiertos.has(g.key);
                            return (
                              <div key={g.key} style={{ border: '1px solid var(--bo)', borderRadius: '10px', background: 'var(--sf)', overflow: 'hidden' }}>
                                <div onClick={() => onToggleBatch(g.key)} style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flexWrap: 'wrap' }}>
                                  {chevron(batchAbierto)}
                                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{BODEGA_LABEL[g.bodega] ?? g.bodega}</span>
                                  <span style={{
                                    display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                                    background: g.tipo === 'INICIAL' ? '#DBEAFE' : '#EDE9FE', color: g.tipo === 'INICIAL' ? '#1E40AF' : '#5B21B6',
                                  }}>
                                    {g.tipo === 'INICIAL' ? 'Inicial' : 'Final'}
                                  </span>
                                  <span style={{ fontSize: '12px', color: 'var(--ts)' }}>· {g.items.length} producto{g.items.length !== 1 ? 's' : ''}</span>
                                  <span style={{ fontSize: '12px', color: 'var(--ts)' }}>· {g.responsable_nombre}</span>
                                  <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                                    <button type="button" onClick={() => onToggleBatch(g.key)} style={accionBtn}>Ver</button>
                                    {puedeEditar && (
                                      <>
                                        <button type="button" onClick={() => onEditar(g)} style={{ ...accionBtn, color: 'var(--ac)', borderColor: 'var(--ac)' }}>Editar</button>
                                        <button type="button" onClick={() => onEliminar(g)} title="Eliminar conteo completo" aria-label="Eliminar conteo completo" style={accionBtnEliminar}>🗑</button>
                                      </>
                                    )}
                                  </span>
                                </div>
                                {batchAbierto && <DetalleProductosInventario items={g.items} busqueda={busqueda} />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetalleProductosInventario({ items, busqueda }: { items: InventarioHistorial[]; busqueda?: string }) {
  return (
    <div style={{ padding: '4px 16px 12px 34px' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '380px' }}>
          <thead>
            <tr>
              {['Producto', 'Conteo', 'U/M'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '9.5px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const coincide = !!busqueda && normalizarTexto(it.producto_nombre).includes(busqueda);
              return (
                <tr key={it.id} style={coincide ? { background: 'var(--al)' } : undefined}>
                  <td style={{ padding: '6px 10px', fontSize: '12.5px', fontWeight: 600 }}>{it.producto_nombre}</td>
                  <td style={{ padding: '6px 10px', fontSize: '12.5px' }}>{fmt(it.cantidad)}</td>
                  <td style={{ padding: '6px 10px', fontSize: '12.5px', color: 'var(--ts)' }}>{it.unidad_medida}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '8px 10px 0', fontSize: '11.5px', color: 'var(--ts)', fontWeight: 600 }}>
        Total: {items.length} producto{items.length !== 1 ? 's' : ''} · {totalPorUnidad(items)}
      </p>
    </div>
  );
}
