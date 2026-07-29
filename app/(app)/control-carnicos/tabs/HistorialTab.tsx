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

function fmt(value: number) {
  const decimals = Math.abs(value) % 1 === 0 ? 0 : 2;
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: decimals }).format(value);
}

export default function HistorialTab() {
  const hoy = hoyChile();
  const [modo, setModo] = useState<ModoRangoFecha>('dia');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [movimientos, setMovimientos] = useState<MovimientoHistorial[] | null>(null);
  const [inventarios, setInventarios] = useState<InventarioHistorial[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  function toggleExpandido(key: string) {
    setExpandidos(prev => {
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
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <p style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: '14px', fontWeight: 800 }}>Movimientos de Bodega (Ingreso / Salida)</p>
          {gruposMovimientos.length > 0 && (
            <span style={{ background: 'var(--ac)', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>{gruposMovimientos.length}</span>
          )}
        </div>
        {gruposMovimientos.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>
            {loading ? 'Cargando...' : 'Sin movimientos en el rango seleccionado.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '780px' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['', 'Fecha', 'Tipo de movimiento', 'Subtipo', 'Cantidad de movimientos ingresados', 'Responsable', 'Observacion'].map(h => (
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
                      </tr>
                      {abierto && (
                        <tr style={{ borderBottom: '1px solid var(--bo)' }}>
                          <td colSpan={7} style={{ padding: 0, background: 'var(--bg)' }}>
                            <div style={{ padding: '4px 16px 12px 34px', display: 'grid', gap: '5px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '6px 0 2px' }}>
                                Movimientos incluidos ({g.items.length})
                              </span>
                              {g.items.map(item => (
                                <div key={item.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '10px', fontSize: '12px' }}>
                                  <span style={{ color: 'var(--tx)', fontWeight: 600 }}>
                                    {item.producto_nombre}
                                    {g.esVenta && item.observacion && <span style={{ color: 'var(--ts)', fontWeight: 400 }}> — {item.observacion}</span>}
                                  </span>
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
        )}
      </section>
      )}

      {(movimientos || inventarios || loading) && (
      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <p style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: '14px', fontWeight: 800 }}>Conteos de Inventario</p>
          {inventarios && inventarios.length > 0 && (
            <span style={{ background: 'var(--ac)', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>{inventarios.length}</span>
          )}
        </div>
        {!inventarios || inventarios.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>
            {loading ? 'Cargando...' : 'Sin conteos de inventario en el rango seleccionado.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Fecha', 'Bodega', 'Tipo', 'Producto', 'Cantidad', 'Responsable'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inventarios.map(inv => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--bo)' }}>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{inv.fecha}</td>
                    <td style={{ padding: '9px 12px', fontSize: '12px', color: 'var(--ts)' }}>{BODEGA_LABEL[inv.bodega] ?? inv.bodega}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                        background: inv.tipo === 'INICIAL' ? '#DBEAFE' : '#EDE9FE',
                        color: inv.tipo === 'INICIAL' ? '#1E40AF' : '#5B21B6',
                      }}>
                        {inv.tipo === 'INICIAL' ? 'Inicial' : 'Final'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>{inv.producto_nombre}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 800, whiteSpace: 'nowrap' }}>{fmt(inv.cantidad)} {inv.unidad_medida}</td>
                    <td style={{ padding: '9px 12px', fontSize: '12px' }}>{inv.responsable_nombre || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
    </div>
  );
}
