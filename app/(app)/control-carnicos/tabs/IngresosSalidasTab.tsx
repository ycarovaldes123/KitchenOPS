'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { BODEGAS_CARNICOS, BODEGA_LABEL, SUBTIPOS_POR_MOVIMIENTO, hoyChile } from '@/lib/config-carnicos';
import type { BodegaCarnico, CarnicoProducto, SubtipoCarnico, TipoMovimientoCarnico } from '@/types/carnicos';
import DatosTurnoCard from '../components/DatosTurnoCard';
import ProductoCarnicoSelector from '../components/ProductoCarnicoSelector';
import type { Maestros } from '../page';

type EstadoFila = 'idle' | 'guardando' | 'guardado' | 'error';

interface FilaMovimiento {
  localId: string;
  producto: CarnicoProducto | null;
  cantidad: string;
  estado: EstadoFila;
  mensaje: string;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyFila(): FilaMovimiento {
  return { localId: newId(), producto: null, cantidad: '', estado: 'idle', mensaje: '' };
}

const field: CSSProperties = {
  width: '100%', border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '8px 11px',
  fontSize: '14px', background: 'var(--bg)', color: 'var(--tx)', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
};
const label: CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ts)',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px',
};

export default function IngresosSalidasTab({ maestros }: { maestros: Maestros }) {
  const [fecha, setFecha] = useState(hoyChile());
  const [responsableId, setResponsableId] = useState('');
  const [turno, setTurno] = useState<'AM' | 'PM'>('AM');
  const [observacion, setObservacion] = useState('');
  const [bodega, setBodega] = useState<BodegaCarnico>(BODEGAS_CARNICOS[0]);
  const [movimiento, setMovimiento] = useState<TipoMovimientoCarnico>('INGRESO');
  const [subtipo, setSubtipo] = useState<SubtipoCarnico>('RECEPCION_BODEGA');
  const [filas, setFilas] = useState<FilaMovimiento[]>([]);

  const respActual = maestros.responsables.find(r => r.id === responsableId);
  const puedeGuardar = Boolean(responsableId && observacion.trim());

  const subtiposDisponibles = SUBTIPOS_POR_MOVIMIENTO[movimiento];

  function cambiarMovimiento(value: TipoMovimientoCarnico) {
    setMovimiento(value);
    setSubtipo(SUBTIPOS_POR_MOVIMIENTO[value][0].value);
  }

  function addFila() {
    setFilas(prev => [...prev, emptyFila()]);
  }

  function updateFila(localId: string, patch: Partial<FilaMovimiento>) {
    setFilas(prev => prev.map(f => (f.localId === localId ? { ...f, ...patch } : f)));
  }

  function removeFila(localId: string) {
    setFilas(prev => prev.filter(f => f.localId !== localId));
  }

  async function guardarFila(fila: FilaMovimiento) {
    if (!puedeGuardar) {
      updateFila(fila.localId, { estado: 'error', mensaje: 'Falta responsable u observacion del turno.' });
      return;
    }
    if (!fila.producto) {
      updateFila(fila.localId, { estado: 'error', mensaje: 'Selecciona un producto.' });
      return;
    }
    const cantidad = Number(fila.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      updateFila(fila.localId, { estado: 'error', mensaje: 'La cantidad debe ser mayor a 0.' });
      return;
    }

    updateFila(fila.localId, { estado: 'guardando', mensaje: '' });
    try {
      const res = await fetch('/api/control-carnicos/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha, responsable_id: responsableId, responsable_nombre: respActual?.nombre ?? '',
          turno, observacion: observacion.trim(), bodega, movimiento, subtipo,
          producto_id: fila.producto.id, producto_nombre: fila.producto.nombre,
          unidad_medida: fila.producto.unidad_medida, cantidad,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando movimiento');
      updateFila(fila.localId, { estado: 'guardado', mensaje: 'Movimiento guardado' });
    } catch (error) {
      updateFila(fila.localId, { estado: 'error', mensaje: error instanceof Error ? error.message : 'Error guardando movimiento' });
    }
  }

  const guardadas = useMemo(() => filas.filter(f => f.estado === 'guardado').length, [filas]);

  return (
    <div className="carnicos-grid" style={{ display: 'grid', gridTemplateColumns: '310px 1fr', gap: '14px', alignItems: 'start' }}>
      <DatosTurnoCard
        fecha={fecha} onFecha={setFecha}
        responsableId={responsableId} onResponsable={setResponsableId} responsables={maestros.responsables}
        turno={turno} onTurno={setTurno}
        observacion={observacion} onObservacion={setObservacion}
        observacionRequerida
      />

      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '12px' }}>
          <div>
            <label style={label}>Bodega</label>
            <select value={bodega} onChange={e => setBodega(e.target.value as BodegaCarnico)} style={{ ...field, fontWeight: 700 }}>
              {BODEGAS_CARNICOS.map(b => <option key={b} value={b}>{BODEGA_LABEL[b]}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Movimiento</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {(['INGRESO', 'SALIDA'] as const).map(m => (
                <button key={m} type="button" onClick={() => cambiarMovimiento(m)} style={{
                  border: `1.5px solid ${movimiento === m ? 'var(--ac)' : 'var(--bo)'}`,
                  background: movimiento === m ? 'var(--al)' : 'var(--bg)',
                  color: movimiento === m ? 'var(--ac)' : 'var(--ts)',
                  borderRadius: '8px', padding: '9px', fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                }}>
                  {m === 'INGRESO' ? 'Ingreso' : 'Salida'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={label}>Subtipo</label>
            <select value={subtipo} onChange={e => setSubtipo(e.target.value as SubtipoCarnico)} style={field}>
              {subtiposDisponibles.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {!puedeGuardar && (
          <div style={{ margin: '14px 20px 0', display: 'flex', alignItems: 'center', gap: '6px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 11px', width: 'fit-content' }}>
            <span style={{ fontSize: '12px', color: '#991B1B', fontWeight: 600 }}>Completa responsable y observacion del turno para poder guardar.</span>
          </div>
        )}

        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: '14px', fontWeight: 800 }}>Productos a mover</p>
          {filas.length > 0 && <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{guardadas}/{filas.length} guardados</span>}
        </div>

        {filas.length === 0 ? (
          <div style={{ padding: '40px 32px', textAlign: 'center' }}>
            <button type="button" onClick={addFila} style={{ background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 22px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              + Agregar movimiento
            </button>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '680px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Producto o PP', 'Cantidad', 'Estado', ''].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map(fila => (
                    <tr key={fila.localId} style={{ borderBottom: '1px solid var(--bo)' }}>
                      <td style={{ padding: '9px 12px', minWidth: '260px' }}>
                        <ProductoCarnicoSelector
                          productos={maestros.productos}
                          selectedId={fila.producto?.id ?? ''}
                          selectedNombre={fila.producto?.nombre ?? ''}
                          selectedUM={fila.producto?.unidad_medida ?? ''}
                          onSelect={producto => updateFila(fila.localId, { producto, estado: 'idle', mensaje: '' })}
                          onClear={() => updateFila(fila.localId, { producto: null, estado: 'idle', mensaje: '' })}
                        />
                      </td>
                      <td style={{ padding: '9px 12px', width: '140px' }}>
                        <input
                          type="number" min={0} step="any" value={fila.cantidad}
                          onChange={e => updateFila(fila.localId, { cantidad: e.target.value, estado: 'idle', mensaje: '' })}
                          style={{ ...field, width: '110px', borderColor: fila.estado === 'error' ? 'var(--rd)' : 'var(--bo)' }}
                          disabled={fila.estado === 'guardado'}
                          placeholder="0"
                        />
                      </td>
                      <td style={{ padding: '9px 12px', minWidth: '160px' }}>
                        {fila.estado === 'guardado' && <span style={{ color: '#065F46', fontSize: '12px', fontWeight: 700 }}>Guardado</span>}
                        {fila.estado === 'error' && <span style={{ color: 'var(--rd)', fontSize: '12px', fontWeight: 700 }}>{fila.mensaje}</span>}
                        {fila.estado === 'guardando' && <span style={{ color: 'var(--ts)', fontSize: '12px' }}>Guardando...</span>}
                      </td>
                      <td style={{ padding: '9px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fila.estado !== 'guardado' && (
                          <button
                            type="button"
                            onClick={() => guardarFila(fila)}
                            disabled={fila.estado === 'guardando'}
                            style={{ border: 'none', borderRadius: '8px', padding: '7px 14px', background: '#0D9373', color: '#fff', fontSize: '12px', fontWeight: 800, cursor: 'pointer', marginRight: '6px' }}
                          >
                            Guardar movimiento
                          </button>
                        )}
                        <button type="button" onClick={() => removeFila(fila.localId)} title="Quitar fila" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '18px', lineHeight: 1, padding: '4px 6px' }}>x</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '11px 14px', borderTop: '1px solid var(--bo)', display: 'flex', justifyContent: 'center' }}>
              <button type="button" onClick={addFila} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: '1.5px dashed var(--bo)', borderRadius: '8px', padding: '8px 18px', cursor: 'pointer', fontSize: '13px', color: 'var(--ts)' }}>
                + Agregar movimiento
              </button>
            </div>
          </>
        )}
      </section>

      <style>{`
        @media (max-width: 1023px) {
          .carnicos-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
