'use client';

import { Fragment, useMemo, useState } from 'react';
import { BODEGA_LABEL, SUBTIPO_LABEL, hoyChile, rangoParaModo, type ModoRangoFecha } from '@/lib/config-carnicos';
import type { BodegaCarnico, SubtipoCarnico, TipoInventarioCarnico, TipoMovimientoCarnico } from '@/types/carnicos';
import FiltroRangoFechas from '../components/FiltroRangoFechas';

interface MovimientoHistorial {
  id: string;
  fecha: string;
  responsable_nombre: string;
  observacion: string | null;
  bodega: BodegaCarnico;
  movimiento: TipoMovimientoCarnico;
  subtipo: SubtipoCarnico;
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
  responsable_nombre: string;
  observacion: string | null;
  esVenta: boolean;
  items: MovimientoHistorial[];
}

interface InventarioHistorial {
  id: string;
  fecha: string;
  responsable_nombre: string;
  bodega: BodegaCarnico;
  tipo: TipoInventarioCarnico;
  producto_nombre: string;
  unidad_medida: string;
  cantidad: number;
}

interface GrupoInventario {
  key: string;
  fecha: string;
  bodega: BodegaCarnico;
  tipo: TipoInventarioCarnico;
  responsable_nombre: string;
  items: InventarioHistorial[];
}

function fmt(value: number) {
  const decimals = Math.abs(value) % 1 === 0 ? 0 : 2;
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: decimals }).format(value);
}

type SubTab = 'movimientos' | 'inventario';

const SUB_TABS: { id: SubTab; label: string; color: string }[] = [
  { id: 'movimientos', label: 'Ingreso / Salida', color: 'var(--ac)' },
  { id: 'inventario', label: 'Inventario', color: '#2563EB' },
];

export default function HistorialTab() {
  const hoy = hoyChile();
  const [subTab, setSubTab] = useState<SubTab>('movimientos');
  const [modo, setModo] = useState<ModoRangoFecha>('dia');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [movimientos, setMovimientos] = useState<MovimientoHistorial[] | null>(null);
  const [inventarios, setInventarios] = useState<InventarioHistorial[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [expandidosInv, setExpandidosInv] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deletingKeyInv, setDeletingKeyInv] = useState<string | null>(null);

  function toggleExpandido(key: string) {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleExpandidoInv(key: string) {
    setExpandidosInv(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function fetchHistorial(d: string, h: string) {
    setLoading(true);
    setError('');
    setExpandidos(new Set());
    setExpandidosInv(new Set());
    setEditingKey(null);
    setEditValues({});
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

  // Cada sesion de Ingreso/Salida se carga con la misma fecha/movimiento/subtipo/responsable/
  // observacion para varios productos a la vez (una fila por producto en carnicos_movimientos).
  // Las ventas de Toteat son distintas: se registran una fila por plato/producto el mismo dia,
  // pero cada una trae su propia observacion (el plato de origen), asi que se agrupan solo por
  // fecha para que la venta del dia quede en un solo movimiento (igual que Produccion en el
  // Historial general: una fila por lote, se despliega para ver el detalle).
  const gruposMovimientos = useMemo(() => {
    if (!movimientos) return [];
    const map = new Map<string, GrupoMovimiento>();
    for (const m of movimientos) {
      const esVenta = m.subtipo === 'VENTAS';
      const key = esVenta
        ? `venta||${m.fecha}`
        : `${m.fecha}||${m.movimiento}||${m.subtipo}||${m.responsable_nombre}||${m.observacion ?? ''}`;
      const existente = map.get(key);
      if (existente) existente.items.push(m);
      else map.set(key, {
        key, fecha: m.fecha, movimiento: m.movimiento, subtipo: m.subtipo,
        responsable_nombre: m.responsable_nombre, observacion: esVenta ? null : m.observacion,
        esVenta, items: [m],
      });
    }
    return Array.from(map.values()).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [movimientos]);

  function iniciarEdicion(g: GrupoMovimiento) {
    const valores: Record<string, string> = {};
    g.items.forEach(item => { valores[item.id] = String(item.cantidad); });
    setEditValues(valores);
    setEditingKey(g.key);
    setExpandidos(prev => new Set(prev).add(g.key));
  }

  function cancelarEdicion() {
    setEditingKey(null);
    setEditValues({});
  }

  async function guardarEdicion(g: GrupoMovimiento) {
    setSavingKey(g.key);
    setError('');
    try {
      const cambios = g.items.filter(item => {
        const v = Number(editValues[item.id]);
        return Number.isFinite(v) && v > 0 && v !== item.cantidad;
      });
      for (const item of cambios) {
        const res = await fetch('/api/control-carnicos/movimientos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, cantidad: Number(editValues[item.id]) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Error guardando cambios');
      }
      setEditingKey(null);
      setEditValues({});
      await fetchHistorial(desde, hasta);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando cambios');
    } finally {
      setSavingKey(null);
    }
  }

  async function eliminarGrupo(g: GrupoMovimiento) {
    if (!window.confirm(`¿Eliminar este movimiento completo? Se borrarán ${g.items.length} producto(s).`)) return;
    setDeletingKey(g.key);
    setError('');
    try {
      for (const item of g.items) {
        const res = await fetch('/api/control-carnicos/movimientos', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Error eliminando movimiento');
      }
      await fetchHistorial(desde, hasta);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminando movimiento');
    } finally {
      setDeletingKey(null);
    }
  }

  // Mismo criterio que Ingreso/Salida: cada conteo se carga con la misma fecha/bodega/tipo/
  // responsable para varios productos a la vez (una fila por producto en carnicos_inventarios),
  // asi que se agrupan por sesion en un solo movimiento expandible.
  const gruposInventarios = useMemo(() => {
    if (!inventarios) return [];
    const map = new Map<string, GrupoInventario>();
    for (const inv of inventarios) {
      const key = `${inv.fecha}||${inv.bodega}||${inv.tipo}||${inv.responsable_nombre}`;
      const existente = map.get(key);
      if (existente) existente.items.push(inv);
      else map.set(key, {
        key, fecha: inv.fecha, bodega: inv.bodega, tipo: inv.tipo,
        responsable_nombre: inv.responsable_nombre, items: [inv],
      });
    }
    return Array.from(map.values()).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [inventarios]);

  async function eliminarGrupoInventario(g: GrupoInventario) {
    if (!window.confirm(`¿Eliminar este conteo de inventario completo? Se borrarán ${g.items.length} producto(s).`)) return;
    setDeletingKeyInv(g.key);
    setError('');
    try {
      for (const item of g.items) {
        const res = await fetch('/api/control-carnicos/inventarios', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Error eliminando conteo de inventario');
      }
      await fetchHistorial(desde, hasta);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminando conteo de inventario');
    } finally {
      setDeletingKeyInv(null);
    }
  }

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

      {!movimientos && !inventarios && !error && !loading && (
        <div style={{ color: 'var(--ts)', fontSize: '13px' }}>Selecciona un rango y presiona Consultar para ver el historial.</div>
      )}

      {(movimientos || inventarios || loading) && (
      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--bo)', background: 'var(--bg)' }}>
          {SUB_TABS.map(({ id, label, color }) => {
            const cantidad = id === 'movimientos' ? gruposMovimientos.length : gruposInventarios.length;
            return (
              <button key={id} type="button" onClick={() => setSubTab(id)} style={{
                padding: '13px 20px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: subTab === id ? 700 : 400,
                color: subTab === id ? 'var(--tx)' : 'var(--ts)',
                borderBottom: `2px solid ${subTab === id ? color : 'transparent'}`,
                marginBottom: '-1px', fontFamily: 'DM Sans, sans-serif', transition: 'color 0.15s',
                display: 'inline-flex', alignItems: 'center', gap: '7px',
              }}>
                {label}
                {cantidad > 0 && (
                  <span style={{ background: color, color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>{cantidad}</span>
                )}
              </button>
            );
          })}
        </div>

        {subTab === 'movimientos' && (
        gruposMovimientos.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>
            {loading ? 'Cargando...' : 'Sin movimientos en el rango seleccionado.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '780px' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['', 'Fecha', 'Tipo de movimiento', 'Subtipo', 'Cantidad de movimientos ingresados', 'Responsable', 'Observacion', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gruposMovimientos.map(g => {
                  const abierto = expandidos.has(g.key);
                  return (
                    <Fragment key={g.key}>
                      <tr
                        onClick={() => toggleExpandido(g.key)}
                        style={{ borderBottom: abierto ? 'none' : '1px solid var(--bo)', cursor: 'pointer' }}
                      >
                        <td style={{ padding: '9px 4px 9px 12px', width: '20px' }}>
                          <span style={{ display: 'inline-block', fontSize: '10px', color: 'var(--ts)', transition: 'transform 0.15s', transform: abierto ? 'rotate(90deg)' : 'none' }}>▸</span>
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{g.fecha}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                            background: g.movimiento === 'INGRESO' ? '#D1FAE5' : '#FEE2E2',
                            color: g.movimiento === 'INGRESO' ? '#065F46' : '#991B1B',
                          }}>
                            {g.movimiento === 'INGRESO' ? 'Ingreso' : 'Salida'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', fontSize: '12px', color: 'var(--ts)' }}>{SUBTIPO_LABEL[g.subtipo] ?? g.subtipo}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 800 }}>{g.items.length}</td>
                        <td style={{ padding: '9px 12px', fontSize: '12px' }}>{g.responsable_nombre || '-'}</td>
                        <td style={{ padding: '9px 12px', fontSize: '12px', color: 'var(--ts)' }}>{g.esVenta ? 'Ventas Toteat (varios platos)' : (g.observacion || '-')}</td>
                        <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
                          {g.esVenta ? (
                            <span style={{ fontSize: '11px', color: 'var(--ts)' }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                type="button"
                                onClick={() => iniciarEdicion(g)}
                                disabled={savingKey === g.key || deletingKey === g.key}
                                title="Editar cantidades"
                                style={{ background: 'none', border: '1px solid var(--bo)', borderRadius: '6px', cursor: 'pointer', color: 'var(--ts)', fontSize: '13px', padding: '4px 7px', lineHeight: 1 }}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                onClick={() => eliminarGrupo(g)}
                                disabled={savingKey === g.key || deletingKey === g.key}
                                title="Eliminar movimiento"
                                style={{ background: 'none', border: '1px solid var(--bo)', borderRadius: '6px', cursor: 'pointer', color: '#DC2626', fontSize: '13px', padding: '4px 7px', lineHeight: 1 }}
                              >
                                {deletingKey === g.key ? '...' : '🗑'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {abierto && (
                        <tr style={{ borderBottom: '1px solid var(--bo)' }}>
                          <td colSpan={8} style={{ padding: 0, background: 'var(--bg)' }}>
                            <div style={{ padding: '4px 16px 12px 34px', display: 'grid', gap: '5px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '6px 0 2px' }}>
                                Movimientos incluidos ({g.items.length})
                              </span>
                              {g.items.map(item => (
                                <div key={item.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
                                  <span style={{ color: 'var(--tx)', fontWeight: 600 }}>
                                    {item.producto_nombre}
                                    {g.esVenta && item.observacion && <span style={{ color: 'var(--ts)', fontWeight: 400 }}> — {item.observacion}</span>}
                                  </span>
                                  {editingKey === g.key ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={editValues[item.id] ?? ''}
                                        onChange={e => setEditValues(prev => ({ ...prev, [item.id]: e.target.value }))}
                                        style={{ width: '80px', padding: '3px 6px', fontSize: '12px', border: '1px solid var(--bo)', borderRadius: '6px', background: 'var(--sf)', color: 'var(--tx)' }}
                                      />
                                      <span style={{ color: 'var(--ts)' }}>{item.unidad_medida}</span>
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--ts)' }}>{fmt(item.cantidad)} {item.unidad_medida}</span>
                                  )}
                                </div>
                              ))}
                              {editingKey === g.key && (
                                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                  <button
                                    type="button"
                                    onClick={() => guardarEdicion(g)}
                                    disabled={savingKey === g.key}
                                    style={{ background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    {savingKey === g.key ? 'Guardando...' : 'Guardar cambios'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelarEdicion}
                                    disabled={savingKey === g.key}
                                    style={{ background: 'none', color: 'var(--ts)', border: '1px solid var(--bo)', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
        )}

        {subTab === 'inventario' && (
        gruposInventarios.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>
            {loading ? 'Cargando...' : 'Sin conteos de inventario en el rango seleccionado.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '680px' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['', 'Fecha', 'Bodega', 'Tipo', 'Cantidad de conteos ingresados', 'Responsable', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gruposInventarios.map(g => {
                  const abierto = expandidosInv.has(g.key);
                  return (
                    <Fragment key={g.key}>
                      <tr
                        onClick={() => toggleExpandidoInv(g.key)}
                        style={{ borderBottom: abierto ? 'none' : '1px solid var(--bo)', cursor: 'pointer' }}
                      >
                        <td style={{ padding: '9px 4px 9px 12px', width: '20px' }}>
                          <span style={{ display: 'inline-block', fontSize: '10px', color: 'var(--ts)', transition: 'transform 0.15s', transform: abierto ? 'rotate(90deg)' : 'none' }}>▸</span>
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{g.fecha}</td>
                        <td style={{ padding: '9px 12px', fontSize: '12px', color: 'var(--ts)' }}>{BODEGA_LABEL[g.bodega] ?? g.bodega}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                            background: g.tipo === 'INICIAL' ? '#DBEAFE' : '#EDE9FE',
                            color: g.tipo === 'INICIAL' ? '#1E40AF' : '#5B21B6',
                          }}>
                            {g.tipo === 'INICIAL' ? 'Inicial' : 'Final'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 800 }}>{g.items.length}</td>
                        <td style={{ padding: '9px 12px', fontSize: '12px' }}>{g.responsable_nombre || '-'}</td>
                        <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => eliminarGrupoInventario(g)}
                            disabled={deletingKeyInv === g.key}
                            title="Eliminar conteo de inventario"
                            style={{ background: 'none', border: '1px solid var(--bo)', borderRadius: '6px', cursor: 'pointer', color: '#DC2626', fontSize: '13px', padding: '4px 7px', lineHeight: 1 }}
                          >
                            {deletingKeyInv === g.key ? '...' : '🗑'}
                          </button>
                        </td>
                      </tr>
                      {abierto && (
                        <tr style={{ borderBottom: '1px solid var(--bo)' }}>
                          <td colSpan={7} style={{ padding: 0, background: 'var(--bg)' }}>
                            <div style={{ padding: '4px 16px 12px 34px', display: 'grid', gap: '5px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '6px 0 2px' }}>
                                Conteos incluidos ({g.items.length})
                              </span>
                              {g.items.map(item => (
                                <div key={item.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '10px', fontSize: '12px' }}>
                                  <span style={{ color: 'var(--tx)', fontWeight: 600 }}>{item.producto_nombre}</span>
                                  <span style={{ color: 'var(--ts)' }}>{fmt(item.cantidad)} {item.unidad_medida}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
        )}
      </section>
      )}
    </div>
  );
}
