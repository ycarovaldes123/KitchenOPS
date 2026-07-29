'use client';

import { Fragment, useState, type CSSProperties } from 'react';
import { hoyChile } from '@/lib/config-carnicos';
import type { ConsumoCalculado, PendienteVenta } from '@/types/carnicos';
import type { Maestros } from '../page';

interface ConsultaResponse {
  fecha: string;
  fuenteVentas: 'sincronizadas' | 'toteat_en_vivo' | 'demo';
  consumos: ConsumoCalculado[];
  pendientes: PendienteVenta[];
  ventasLeidas: number;
  platosConReceta: number;
}

const PENDIENTE_LABEL: Record<PendienteVenta['tipo'], string> = {
  codigo_toteat_sin_relacion: 'Codigo Toteat sin relacion',
  producto_relacionado_inexistente: 'Producto relacionado inexistente',
  cantidad_por_plato_invalida: 'Cantidad por plato invalida',
  unidad_no_reconocida: 'Unidad no reconocida',
  dia_sin_ventas: 'Dia sin ventas',
  api_sin_respuesta: 'Toteat sin respuesta',
};

const field: CSSProperties = {
  border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '8px 11px', fontSize: '14px',
  background: 'var(--bg)', color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif',
};

function fmt(value: number) {
  const decimals = Math.abs(value) % 1 === 0 ? 0 : 2;
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: decimals }).format(value);
}

export default function VentasTab({ maestros }: { maestros: Maestros }) {
  const [fecha, setFecha] = useState(hoyChile());
  const [data, setData] = useState<ConsultaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ingresando, setIngresando] = useState(false);
  const [resultadoIngreso, setResultadoIngreso] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [advertenciasAbiertas, setAdvertenciasAbiertas] = useState(false);

  function toggleExpandido(productoId: string) {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(productoId)) next.delete(productoId);
      else next.add(productoId);
      return next;
    });
  }

  async function consultar() {
    setLoading(true);
    setError('');
    setResultadoIngreso('');
    setExpandidos(new Set());
    setAdvertenciasAbiertas(false);
    try {
      const res = await fetch(`/api/control-carnicos/ventas/consultar?fecha=${fecha}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error consultando ventas');
      setData(json);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Error consultando ventas');
    } finally {
      setLoading(false);
    }
  }

  async function ingresarVenta() {
    if (!data || data.consumos.length === 0) return;
    const yaRegistrados = data.consumos.filter(c => c.ya_registrado).length;
    const confirmMsg = `Registrar ${data.consumos.length} producto(s) como salida de Ventas para ${fecha}?`
      + (yaRegistrados ? ` ${yaRegistrados} ya estaban ingresados y se sobrescribiran (no se duplican).` : '');
    if (!window.confirm(confirmMsg)) return;

    setIngresando(true);
    setResultadoIngreso('');
    try {
      const responsable = maestros.responsables.find(r => r.id === responsableId);
      const res = await fetch('/api/control-carnicos/ventas/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha, consumos: data.consumos,
          responsable_id: responsableId || null,
          responsable_nombre: responsable?.nombre ?? 'Sistema Ventas Toteat',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error registrando venta');
      setResultadoIngreso(
        `${json.insertados} movimiento(s) registrados`
        + `${json.sobrescritos ? `, ${json.sobrescritos} actualizados (sobrescritos)` : ''}`
        + `${json.omitidos.length ? `, ${json.omitidos.length} omitidos` : ''}.`
      );
      // Limpia los resultados para dejar la pestana lista para consultar otra fecha.
      setData(null);
      setExpandidos(new Set());
      setAdvertenciasAbiertas(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error registrando venta');
    } finally {
      setIngresando(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', marginBottom: '5px' }}>Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={field} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', marginBottom: '5px' }}>Responsable (opcional)</label>
          <select value={responsableId} onChange={e => setResponsableId(e.target.value)} style={field}>
            <option value="">Sistema Ventas Toteat</option>
            {maestros.responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </div>
        <button type="button" onClick={consultar} disabled={loading} style={{ border: 'none', borderRadius: '8px', padding: '10px 18px', background: 'var(--ac)', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
          {loading ? 'Consultando...' : 'Consultar ventas'}
        </button>
        {data && data.consumos.length > 0 && (
          <button type="button" onClick={ingresarVenta} disabled={ingresando} style={{ border: 'none', borderRadius: '8px', padding: '10px 18px', background: '#0D9373', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
            {ingresando ? 'Ingresando...' : `Ingresar venta (${data.consumos.length})`}
          </button>
        )}
      </section>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', padding: '12px 14px', fontSize: '13px' }}>{error}</div>
      )}
      {resultadoIngreso && (
        <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46', borderRadius: '10px', padding: '12px 14px', fontSize: '13px' }}>{resultadoIngreso}</div>
      )}
      {data?.fuenteVentas === 'demo' && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', fontWeight: 700 }}>
          Modo demostracion: faltan credenciales TOTEAT_XIR/XIL/XIU/XAPITOKEN. Mostrando datos sinteticos (DEMO) para poder probar el flujo.
        </div>
      )}

      {data && (
        <>
          <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--ts)' }}>Ventas leidas: <strong style={{ color: 'var(--tx)' }}>{data.ventasLeidas}</strong></span>
              <span style={{ fontSize: '12px', color: 'var(--ts)' }}>Productos con consumo: <strong style={{ color: 'var(--tx)' }}>{data.platosConReceta}</strong></span>
              <span style={{ fontSize: '12px', color: 'var(--ts)' }}>Fuente: <strong style={{ color: 'var(--tx)' }}>{data.fuenteVentas}</strong></span>
            </div>
            {data.consumos.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Sin consumo de productos carnicos para esta fecha.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['', 'Nombre del producto', 'Total calculado', 'Estado'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.consumos.map(c => {
                      const abierto = expandidos.has(c.producto_id);
                      return (
                        <Fragment key={c.producto_id}>
                          <tr
                            onClick={() => toggleExpandido(c.producto_id)}
                            style={{ borderBottom: abierto ? 'none' : '1px solid var(--bo)', cursor: 'pointer' }}
                          >
                            <td style={{ padding: '9px 4px 9px 12px', width: '20px' }}>
                              <span style={{ display: 'inline-block', fontSize: '10px', color: 'var(--ts)', transition: 'transform 0.15s', transform: abierto ? 'rotate(90deg)' : 'none' }}>▸</span>
                            </td>
                            <td style={{ padding: '9px 12px', fontWeight: 700 }}>{c.producto_nombre}</td>
                            <td style={{ padding: '9px 12px', fontWeight: 800 }}>{fmt(c.cantidad_calculada)} {c.unidad_medida}</td>
                            <td style={{ padding: '9px 12px' }}>
                              {c.ya_registrado ? (
                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: '#D1FAE5', color: '#065F46' }}>Ya ingresado</span>
                              ) : (
                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: '#FEF3C7', color: '#92400E' }}>Pendiente</span>
                              )}
                            </td>
                          </tr>
                          {abierto && (
                            <tr style={{ borderBottom: '1px solid var(--bo)' }}>
                              <td colSpan={4} style={{ padding: 0, background: 'var(--bg)' }}>
                                <div style={{ padding: '4px 16px 12px 34px', display: 'grid', gap: '5px' }}>
                                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '6px 0 2px' }}>Platos asociados</span>
                                  {c.platos_origen.map((p, i) => (
                                    <div key={i} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '10px', fontSize: '12px' }}>
                                      <span style={{ color: 'var(--tx)' }}>{p.plato_nombre} <span style={{ color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>({p.codigo_toteat})</span></span>
                                      <span style={{ color: 'var(--ts)' }}>{fmt(p.cantidad_vendida)} vendidos x {fmt(p.cantidad_por_plato)} {p.unidad_receta}</span>
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

          {data.pendientes.length > 0 && (
            <section style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '14px', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setAdvertenciasAbiertas(v => !v)}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span style={{ fontFamily: 'Syne, sans-serif', fontSize: '14px', fontWeight: 800, color: '#92400E' }}>
                  Advertencia ({data.pendientes.length} platos reconocidos)
                </span>
                <span style={{ fontSize: '11px', color: '#92400E', transition: 'transform 0.15s', transform: advertenciasAbiertas ? 'rotate(180deg)' : 'none' }}>▾</span>
              </button>
              {advertenciasAbiertas && (
                <div style={{ padding: '0 20px 16px', display: 'grid', gap: '8px' }}>
                  {data.pendientes.map((p, i) => (
                    <div key={i} style={{ fontSize: '12px', color: '#92400E' }}>
                      <strong>{PENDIENTE_LABEL[p.tipo]}</strong>
                      {p.codigo_toteat && <> — {p.codigo_toteat}</>}
                      {p.plato_nombre && <> ({p.plato_nombre})</>}: {p.observacion}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
