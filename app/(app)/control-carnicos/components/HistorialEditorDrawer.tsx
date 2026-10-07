'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { BODEGA_LABEL } from '@/lib/config-carnicos';
import type { SubtipoCarnico, TipoMovimientoCarnico } from '@/types/carnicos';
import ProductoCarnicoSelector from './ProductoCarnicoSelector';
import type { Maestros } from '../page';

// ─── Tipos compartidos con HistorialTab (duplicados minimamente para no acoplar
// el drawer a la forma interna de los grupos del tab que lo abre). ────────────

export interface ItemEditable {
  id: string;
  producto_id: string;
  producto_nombre: string;
  unidad_medida: string;
  cantidad: number;
  subtipo?: SubtipoCarnico;
  observacion?: string | null;
  esNuevo?: boolean;
}

export type VarianteDrawer = 'movimiento' | 'inventario';

export interface GrupoEditable {
  key: string;
  variante: VarianteDrawer;
  fecha: string;
  responsable_id: string | null;
  responsable_nombre: string;
  // Solo variante 'movimiento':
  movimiento?: TipoMovimientoCarnico;
  bodega?: string;
  turno?: 'AM' | 'PM' | null;
  // Solo variante 'inventario':
  tipoInventario?: 'INICIAL' | 'FINAL';
  items: ItemEditable[];
}

const field: CSSProperties = {
  width: '100%', border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '7px 10px',
  fontSize: '13px', background: 'var(--bg)', color: 'var(--tx)', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
};
const label: CSSProperties = {
  display: 'block', fontSize: '10.5px', fontWeight: 700, color: 'var(--ts)',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px',
};

// ─── Estilos de la tabla de productos (compacta, sin cards) ──────────────────

const thTabla: CSSProperties = {
  position: 'sticky', top: 0, zIndex: 1, background: 'var(--sf)',
  padding: '7px 8px', textAlign: 'left', fontSize: '9.5px', fontWeight: 700, color: 'var(--ts)',
  textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1.5px solid var(--bo)', whiteSpace: 'nowrap',
};
const tdTabla: CSSProperties = { padding: '6px 8px', fontSize: '12.5px', verticalAlign: 'middle' };

const conteoInputBase: CSSProperties = {
  width: '84px', border: '1.5px solid var(--bo)', borderRadius: '7px', padding: '6px 8px',
  fontSize: '13px', fontWeight: 700, textAlign: 'right', background: 'var(--bg)', color: 'var(--tx)',
  outline: 'none', fontFamily: "'Space Grotesk', sans-serif", boxSizing: 'border-box',
};

const umBadge: CSSProperties = {
  display: 'inline-block', minWidth: '38px', textAlign: 'center', padding: '3px 8px',
  borderRadius: '6px', background: 'var(--bg)', border: '1px solid var(--bo)', color: 'var(--ts)',
  fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px',
};

const trashBtn: CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '14px', lineHeight: 1,
  padding: '6px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

function fmt(value: number) {
  const decimals = Math.abs(value) % 1 === 0 ? 0 : 2;
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: decimals }).format(value);
}

function totalPorUnidad(items: ItemEditable[]): string {
  const map = new Map<string, number>();
  for (const it of items) map.set(it.unidad_medida, (map.get(it.unidad_medida) ?? 0) + it.cantidad);
  const partes = Array.from(map.entries()).map(([um, total]) => `${fmt(total)} ${um}`);
  return partes.length ? partes.join(' + ') : '0';
}

function isoAFecha(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function HistorialEditorDrawer({
  grupo, maestros, onClose, onSaved,
}: {
  grupo: GrupoEditable;
  maestros: Maestros;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fecha, setFecha] = useState(grupo.fecha);
  const [responsableId, setResponsableId] = useState(grupo.responsable_id ?? '');
  const [items, setItems] = useState<ItemEditable[]>(() => grupo.items.map(it => ({ ...it })));
  const [eliminados, setEliminados] = useState<Set<string>>(new Set());
  const [confirmacion, setConfirmacion] = useState<{ tipo: 'producto'; item: ItemEditable } | { tipo: 'movimiento' } | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoTodo, setEliminandoTodo] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const responsableOriginal = grupo.responsable_id ?? '';
  const itemsVisibles = useMemo(() => items.filter(it => !eliminados.has(it.id)), [items, eliminados]);

  const huboCambios = useMemo(() => {
    if (fecha !== grupo.fecha) return true;
    if (responsableId !== responsableOriginal) return true;
    if (eliminados.size > 0) return true;
    for (const it of items) {
      if (it.esNuevo) return true;
      const original = grupo.items.find(o => o.id === it.id);
      if (!original) return true;
      if (original.cantidad !== it.cantidad) return true;
      if ((original.subtipo ?? '') !== (it.subtipo ?? '')) return true;
      if ((original.observacion ?? '') !== (it.observacion ?? '')) return true;
    }
    return false;
  }, [fecha, responsableId, items, eliminados, grupo, responsableOriginal]);

  const datosValidos = itemsVisibles.length > 0 && itemsVisibles.every(it => Number.isFinite(it.cantidad) && it.cantidad > 0) && !!responsableId && !!fecha;

  function actualizarItem(id: string, patch: Partial<ItemEditable>) {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  }

  function confirmarEliminarProducto(item: ItemEditable) {
    if (item.esNuevo) {
      // Producto recien agregado y aun no guardado: se quita directo, sin pasar por el servidor.
      setItems(prev => prev.filter(it => it.id !== item.id));
      return;
    }
    setConfirmacion({ tipo: 'producto', item });
  }

  function eliminarProductoConfirmado() {
    if (!confirmacion || confirmacion.tipo !== 'producto') return;
    setEliminados(prev => new Set(prev).add(confirmacion.item.id));
    setConfirmacion(null);
  }

  const productosYaUsados = new Set(itemsVisibles.map(it => it.producto_id));
  const productosDisponibles = maestros.productos.filter(p => !productosYaUsados.has(p.id));

  function agregarProducto(p: { id: string; nombre: string; unidad_medida: string }) {
    const nuevo: ItemEditable = {
      id: `nuevo-${p.id}-${Date.now()}`,
      producto_id: p.id,
      producto_nombre: p.nombre,
      unidad_medida: p.unidad_medida,
      cantidad: 0,
      subtipo: grupo.variante === 'movimiento' ? (grupo.items[0]?.subtipo) : undefined,
      observacion: '',
      esNuevo: true,
    };
    setItems(prev => [...prev, nuevo]);
    setAgregando(false);
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      const responsableCambio = responsableId !== responsableOriginal;
      const fechaCambio = fecha !== grupo.fecha;

      // 1) Actualiza items existentes que tengan algun cambio (cantidad/subtipo/observacion propios,
      //    o los cambios de grupo -fecha/responsable- que aplican a todas las filas del movimiento).
      for (const it of items) {
        if (it.esNuevo || eliminados.has(it.id)) continue;
        const original = grupo.items.find(o => o.id === it.id);
        const body: Record<string, unknown> = { id: it.id };
        let cambia = false;
        if (original && original.cantidad !== it.cantidad) { body.cantidad = it.cantidad; cambia = true; }
        if (original && (original.subtipo ?? '') !== (it.subtipo ?? '')) { body.subtipo = it.subtipo; cambia = true; }
        if (original && (original.observacion ?? '') !== (it.observacion ?? '')) { body.observacion = it.observacion ?? ''; cambia = true; }
        if (fechaCambio) { body.fecha = fecha; cambia = true; }
        if (responsableCambio) { body.responsable_id = responsableId; cambia = true; }
        if (!cambia) continue;

        const url = grupo.variante === 'movimiento' ? '/api/control-carnicos/movimientos' : '/api/control-carnicos/inventarios';
        const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Error guardando cambios');
      }

      // 2) Elimina productos marcados para borrar.
      if (eliminados.size) {
        const url = grupo.variante === 'movimiento' ? '/api/control-carnicos/movimientos' : '/api/control-carnicos/inventarios';
        const res = await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...eliminados] }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Error eliminando producto');
      }

      // 3) Inserta productos nuevos agregados en el editor.
      const responsable = maestros.responsables.find(r => r.id === responsableId);
      for (const it of items.filter(i => i.esNuevo)) {
        if (grupo.variante === 'movimiento') {
          const res = await fetch('/api/control-carnicos/movimientos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fecha, responsable_id: responsableId, responsable_nombre: responsable?.nombre ?? grupo.responsable_nombre,
              turno: grupo.turno ?? null, observacion: it.observacion ?? '', bodega: grupo.bodega,
              movimiento: grupo.movimiento, subtipo: it.subtipo, producto_id: it.producto_id,
              producto_nombre: it.producto_nombre, unidad_medida: it.unidad_medida, cantidad: it.cantidad,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? 'Error agregando producto');
        } else {
          const res = await fetch('/api/control-carnicos/inventarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fecha, responsable_id: responsableId, responsable_nombre: responsable?.nombre ?? grupo.responsable_nombre,
              turno: grupo.turno ?? null, tipo: grupo.tipoInventario, bodega: grupo.bodega,
              detalle: [{ producto_id: it.producto_id, producto_nombre: it.producto_nombre, unidad_medida: it.unidad_medida, cantidad: it.cantidad }],
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? 'Error agregando producto');
        }
      }

      setExito('Movimiento actualizado correctamente');
      onSaved();
      setTimeout(() => onClose(), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando cambios');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarMovimientoCompleto() {
    setEliminandoTodo(true);
    setError('');
    try {
      const url = grupo.variante === 'movimiento' ? '/api/control-carnicos/movimientos' : '/api/control-carnicos/inventarios';
      const res = await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: grupo.items.map(it => it.id) }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Error eliminando movimiento');
      setExito('Movimiento eliminado correctamente');
      onSaved();
      setTimeout(() => onClose(), 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminando movimiento');
      setConfirmacion(null);
    } finally {
      setEliminandoTodo(false);
    }
  }

  const esMovimiento = grupo.variante === 'movimiento';
  const tituloTipo = esMovimiento
    ? (grupo.movimiento === 'INGRESO' ? 'Ingreso' : 'Salida')
    : `Inventario ${grupo.tipoInventario === 'INICIAL' ? 'Inicial' : 'Final'}`;
  const badgeColor = esMovimiento
    ? (grupo.movimiento === 'INGRESO' ? { bg: '#D1FAE5', fg: '#065F46' } : { bg: '#FEE2E2', fg: '#991B1B' })
    : (grupo.tipoInventario === 'INICIAL' ? { bg: '#DBEAFE', fg: '#1E40AF' } : { bg: '#EDE9FE', fg: '#5B21B6' });
  const bodegaLabel = grupo.bodega ? (BODEGA_LABEL[grupo.bodega as keyof typeof BODEGA_LABEL] ?? grupo.bodega) : null;

  return (
    <>
      {/* En escritorio el drawer queda al costado del historial (layout lateral, sin tapar nada);
          en pantallas angostas pasa a ocupar toda la pantalla y este overlay lo respalda. */}
      <div className="hist-drawer-overlay" onClick={onClose} aria-hidden />
      <aside
        className="hist-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Editar movimiento"
        style={{
          background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column',
          position: 'sticky', top: '14px', maxHeight: 'calc(100vh - 28px)', overflow: 'hidden',
        }}
      >
        {/* Header: titulo + contexto (tipo + camara/bodega) */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bo)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '16px', fontWeight: 800, margin: 0 }}>Editar movimiento</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar editor" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '19px', lineHeight: 1, padding: '2px' }}>×</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700, background: badgeColor.bg, color: badgeColor.fg }}>
              {tituloTipo}
            </span>
            {bodegaLabel && <span style={{ fontSize: '12px', color: 'var(--ts)', fontWeight: 600 }}>{bodegaLabel}</span>}
            {grupo.turno && <span style={{ fontSize: '11.5px', color: 'var(--ts)' }}>· Turno {grupo.turno}</span>}
          </div>
        </div>

        {/* gridAutoRows max-content: sin esto la grilla encoge las filas para caber en el alto del drawer
            y la tabla (overflow hidden) queda recortada en vez de activar el scroll. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'grid', gridAutoRows: 'max-content', gap: '14px' }}>
          {error && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '8px', padding: '9px 12px', fontSize: '12.5px' }}>{error}</div>}
          {exito && <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46', borderRadius: '8px', padding: '9px 12px', fontSize: '12.5px' }}>✓ {exito}</div>}

          {/* Resumen superior */}
          <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--bo)', borderRadius: '10px', overflow: 'hidden' }}>
            {[
              [esMovimiento ? 'Movimientos' : 'Conteos', '1'],
              ['Productos', String(itemsVisibles.length)],
              ['Cantidad total', totalPorUnidad(itemsVisibles)],
            ].map(([lbl, val], i) => (
              <div key={lbl} style={{ flex: 1, padding: '9px 12px', borderLeft: i > 0 ? '1px solid var(--bo)' : 'none', minWidth: 0 }}>
                <p style={{ margin: '0 0 2px', fontSize: '9px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{lbl}</p>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</p>
              </div>
            ))}
          </div>

          {/* Datos principales */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={label}>Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={field} />
            </div>
            <div>
              <label style={label}>Responsable</label>
              <select value={responsableId} onChange={e => setResponsableId(e.target.value)} style={{ ...field, color: responsableId ? 'var(--tx)' : 'var(--ts)' }}>
                <option value="">Seleccionar...</option>
                {maestros.responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>
          </div>

          {/* Tabla de productos */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Productos</span>
              <button
                type="button"
                onClick={() => setAgregando(v => !v)}
                style={{ background: 'none', border: 'none', color: 'var(--ac)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: '2px 4px' }}
              >
                + Agregar producto
              </button>
            </div>

            {agregando && (
              <div style={{ border: '1.5px solid var(--ac)', borderRadius: '10px', padding: '10px', marginBottom: '8px' }}>
                <ProductoCarnicoSelector
                  productos={productosDisponibles}
                  selectedId=""
                  selectedNombre=""
                  selectedUM=""
                  onSelect={p => agregarProducto(p)}
                  onClear={() => {}}
                />
                <button type="button" onClick={() => setAgregando(false)} style={{ marginTop: '8px', background: 'none', border: 'none', color: 'var(--ts)', fontSize: '12px', cursor: 'pointer' }}>Cancelar</button>
              </div>
            )}

            {itemsVisibles.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--ts)', fontSize: '12.5px', border: '1px dashed var(--bo)', borderRadius: '10px' }}>
                Sin productos. Agrega al menos uno para poder guardar.
              </div>
            ) : (
              <div style={{ border: '1px solid var(--bo)', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thTabla, width: '26px', textAlign: 'center' }}>#</th>
                      <th style={thTabla}>Producto</th>
                      <th style={{ ...thTabla, width: '94px', textAlign: 'right' }}>{esMovimiento ? 'Cantidad' : 'Conteo'}</th>
                      <th style={{ ...thTabla, width: '58px', textAlign: 'center' }}>U/M</th>
                      <th style={{ ...thTabla, width: '40px', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsVisibles.map((it, idx) => (
                      <tr key={it.id} className="mov-tabla-fila">
                        <td style={{ ...tdTabla, textAlign: 'center', color: 'var(--ts)', fontSize: '11px' }}>{idx + 1}</td>
                        <td style={{ ...tdTabla, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {it.producto_nombre}
                        </td>
                        <td style={{ ...tdTabla, textAlign: 'right' }}>
                          <input
                            type="number" min="0" step="0.01" value={Number.isFinite(it.cantidad) ? it.cantidad : ''}
                            onChange={e => actualizarItem(it.id, { cantidad: Number(e.target.value) })}
                            className="mov-conteo-input"
                            style={conteoInputBase}
                          />
                        </td>
                        <td style={{ ...tdTabla, textAlign: 'center' }}>
                          <span style={umBadge}>{it.unidad_medida}</span>
                        </td>
                        <td style={{ ...tdTabla, textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => confirmarEliminarProducto(it)}
                            title={`Eliminar ${it.producto_nombre}`}
                            aria-label={`Eliminar ${it.producto_nombre} del movimiento`}
                            className="mov-trash-btn"
                            style={trashBtn}
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--ts)', lineHeight: 1.5 }}>
            Los cambios realizados serán registrados en el historial de auditoría. Solo visible para administradores.
          </p>
        </div>

        {/* Acciones finales */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--bo)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setConfirmacion({ tipo: 'movimiento' })}
            disabled={guardando || eliminandoTodo}
            style={{ background: 'none', border: '1px solid #FCA5A5', color: '#DC2626', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            🗑 Eliminar movimiento
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              style={{ background: 'none', border: '1px solid var(--bo)', color: 'var(--ts)', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={!huboCambios || !datosValidos || guardando}
              style={{
                background: (!huboCambios || !datosValidos || guardando) ? 'var(--bo)' : 'var(--ac)',
                color: (!huboCambios || !datosValidos || guardando) ? 'var(--ts)' : '#fff',
                border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 800,
                cursor: (!huboCambios || !datosValidos || guardando) ? 'not-allowed' : 'pointer',
              }}
            >
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </aside>

      {confirmacion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,20,0.4)', zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--sf)', borderRadius: '14px', padding: '22px', width: '100%', maxWidth: '380px', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
            {confirmacion.tipo === 'producto' ? (
              <>
                <h3 style={{ margin: '0 0 8px', fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 800 }}>¿Eliminar este producto del movimiento?</h3>
                <p style={{ margin: '0 0 18px', fontSize: '13px', color: 'var(--ts)' }}>{confirmacion.item.producto_nombre} — {fmt(confirmacion.item.cantidad)} {confirmacion.item.unidad_medida}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" onClick={() => setConfirmacion(null)} style={{ background: 'none', border: '1px solid var(--bo)', color: 'var(--ts)', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                  <button type="button" onClick={eliminarProductoConfirmado} style={{ background: 'none', border: '1px solid #FCA5A5', color: '#DC2626', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>Eliminar producto</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 8px', fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 800 }}>Eliminar movimiento</h3>
                <p style={{ margin: '0 0 18px', fontSize: '13px', color: 'var(--ts)', lineHeight: 1.5 }}>
                  Se eliminará el movimiento completo del {isoAFecha(grupo.fecha)} junto con sus {grupo.items.length} producto{grupo.items.length !== 1 ? 's' : ''}. Esta acción afectará el historial y los cálculos relacionados.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" onClick={() => setConfirmacion(null)} disabled={eliminandoTodo} style={{ background: 'none', border: '1px solid var(--bo)', color: 'var(--ts)', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                  <button type="button" onClick={eliminarMovimientoCompleto} disabled={eliminandoTodo} style={{ background: 'none', border: '1px solid #FCA5A5', color: '#DC2626', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
                    {eliminandoTodo ? 'Eliminando...' : 'Sí, eliminar movimiento'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        .hist-drawer-overlay { display: none; }
        @media (max-width: 900px) {
          .hist-drawer-overlay {
            display: block; position: fixed; inset: 0; background: rgba(20,20,20,0.32); z-index: 900;
          }
          .hist-drawer {
            position: fixed !important; inset: 0 !important; top: 0 !important; width: 100vw !important;
            max-height: 100vh !important; max-height: 100dvh !important; border-radius: 0 !important; z-index: 901;
          }
        }
        .mov-tabla-fila { border-top: 1px solid var(--bo); transition: background 0.1s; }
        .mov-tabla-fila:first-child { border-top: none; }
        .mov-tabla-fila:hover { background: var(--bg); }
        .mov-conteo-input:focus { border-color: var(--ac) !important; box-shadow: 0 0 0 2px color-mix(in srgb, var(--ac) 20%, transparent); }
        .mov-conteo-input:hover { border-color: var(--ac); }
        .mov-trash-btn:hover { background: #FEE2E2; }
      `}</style>
    </>
  );
}
