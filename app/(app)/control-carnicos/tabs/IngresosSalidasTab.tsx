'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { BODEGAS_CARNICOS, SUBTIPOS_POR_MOVIMIENTO, hoyChile } from '@/lib/config-carnicos';
import type { CarnicoProducto, SubtipoCarnico, TipoMovimientoCarnico } from '@/types/carnicos';
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
  // Turno AM/PM ya no se selecciona en la UI; se mantiene un valor fijo para no alterar el contrato de la API.
  const turno: 'AM' | 'PM' = 'AM';
  const [observacion, setObservacion] = useState('');
  // Bodega ya no se selecciona en esta pestana (no se usa en el calculo de Tabla Resumen); se mantiene un valor fijo para cumplir la restriccion NOT NULL en Supabase.
  const bodega = BODEGAS_CARNICOS[0];
  const [movimiento, setMovimiento] = useState<TipoMovimientoCarnico>('INGRESO');
  const [subtipo, setSubtipo] = useState<SubtipoCarnico | ''>('');
  const [filas, setFilas] = useState<FilaMovimiento[]>([]);
  const [guardandoTodo, setGuardandoTodo] = useState(false);
  const [ok, setOk] = useState('');

  const respActual = maestros.responsables.find(r => r.id === responsableId);
  const puedeGuardar = Boolean(responsableId && observacion.trim() && subtipo);

  const subtiposDisponibles = SUBTIPOS_POR_MOVIMIENTO[movimiento];

  function cambiarMovimiento(value: TipoMovimientoCarnico) {
    setMovimiento(value);
    setSubtipo('');
  }

  function addFila() {
    setOk('');
    setFilas(prev => [...prev, emptyFila()]);
  }

  function updateFila(localId: string, patch: Partial<FilaMovimiento>) {
    setFilas(prev => prev.map(f => (f.localId === localId ? { ...f, ...patch } : f)));
  }

  function removeFila(localId: string) {
    setFilas(prev => prev.filter(f => f.localId !== localId));
  }

  async function guardarFila(fila: FilaMovimiento): Promise<boolean> {
    if (!puedeGuardar) {
      updateFila(fila.localId, { estado: 'error', mensaje: 'Falta responsable u observacion del turno.' });
      return false;
    }
    if (!fila.producto) {
      updateFila(fila.localId, { estado: 'error', mensaje: 'Selecciona un producto.' });
      return false;
    }
    const cantidad = Number(fila.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      updateFila(fila.localId, { estado: 'error', mensaje: 'La cantidad debe ser mayor a 0.' });
      return false;
    }

    updateFila(fila.localId, { estado: 'guardando', mensaje: '' });
    try {
      const res = await fetch('/api/control-carnicos/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha, responsable_id: responsableId, responsable_nombre: respActual?.nombre ?? '',
          turno, observacion: observacion.trim(), bodega, movimiento, subtipo: subtipo as SubtipoCarnico,
          producto_id: fila.producto.id, producto_nombre: fila.producto.nombre,
          unidad_medida: fila.producto.unidad_medida, cantidad,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando movimiento');
      updateFila(fila.localId, { estado: 'guardado', mensaje: 'Movimiento guardado' });
      return true;
    } catch (error) {
      updateFila(fila.localId, { estado: 'error', mensaje: error instanceof Error ? error.message : 'Error guardando movimiento' });
      return false;
    }
  }

  async function guardarTodo() {
    const pendientes = filas.filter(f => f.estado !== 'guardado');
    if (!pendientes.length) return;
    setGuardandoTodo(true);
    setOk('');
    let exitosos = 0;
    for (const fila of pendientes) {
      if (await guardarFila(fila)) exitosos++;
    }
    setGuardandoTodo(false);
    // Si se guardaron todos los pendientes, se refleja de inmediato en el resumen (se calcula en vivo desde los movimientos);
    // se limpia la lista para dejar la pestana lista para ingresar otro movimiento.
    if (exitosos === pendientes.length) {
      setOk(`${exitosos} movimiento${exitosos !== 1 ? 's' : ''} guardado${exitosos !== 1 ? 's' : ''} correctamente.`);
      setFilas([]);
    }
  }

  const guardadas = useMemo(() => filas.filter(f => f.estado === 'guardado').length, [filas]);
  const pendientesCount = filas.length - guardadas;

  return (
    <div>
      {ok && (
        <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px' }}>
          {ok}
        </div>
      )}
      <div className="carnicos-grid" style={{ display: 'grid', gridTemplateColumns: '310px 1fr', gap: '14px', alignItems: 'start' }}>
      <DatosTurnoCard
        title="MOVIMIENTOS DE BODEGA"
        fecha={fecha} onFecha={setFecha}
        responsableId={responsableId} onResponsable={setResponsableId} responsables={maestros.responsables}
        observacion={observacion} onObservacion={setObservacion}
        observacionRequerida
      >
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
          <label style={label}>Subtipo <span style={{ color: 'var(--rd)' }}>*</span></label>
          <select value={subtipo} onChange={e => setSubtipo(e.target.value as SubtipoCarnico)} style={{ ...field, color: subtipo ? 'var(--tx)' : 'var(--ts)' }}>
            <option value="">Seleccionar subtipo...</option>
            {subtiposDisponibles.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </DatosTurnoCard>

      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <p style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: '14px', fontWeight: 800 }}>Productos a mover</p>
            {filas.length > 0 && (
              <span style={{ background: 'var(--ac)', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>{filas.length}</span>
            )}
          </div>
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
                    {['Producto o PP', 'Unidad de medida', 'Cantidad', 'Estado', ''].map(h => (
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
                      <td style={{ padding: '9px 12px', fontSize: '12px', color: 'var(--ts)' }}>{fila.producto?.unidad_medida ?? '-'}</td>
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

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--bo)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
              {!puedeGuardar && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 11px', width: '100%' }}>
                  <span style={{ fontSize: '12px', color: '#991B1B', fontWeight: 600 }}>Completa responsable, subtipo y observacion del turno para poder guardar.</span>
                </div>
              )}
              <button
                type="button"
                onClick={guardarTodo}
                disabled={!puedeGuardar || guardandoTodo || pendientesCount === 0}
                style={{
                  border: 'none', borderRadius: '10px', padding: '11px 26px',
                  background: (!puedeGuardar || pendientesCount === 0) ? 'var(--bo)' : '#0D9373',
                  color: '#fff', fontSize: '13px', fontWeight: 800,
                  cursor: (!puedeGuardar || guardandoTodo || pendientesCount === 0) ? 'not-allowed' : 'pointer',
                  minWidth: '180px',
                }}
              >
                {guardandoTodo ? 'Guardando...' : 'Guardar movimiento'}
              </button>
            </div>
          </>
        )}
      </section>
      </div>

      <style>{`
        @media (max-width: 1023px) {
          .carnicos-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
