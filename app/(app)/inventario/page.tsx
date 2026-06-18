'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRol } from '@/components/RolProvider';
import ProductSearchSelect from '@/components/costos/ProductSearchSelect';
import { UBICACIONES_INVENTARIO, type UbicacionInventario } from '@/lib/inventario';
import type { Producto, Responsable } from '@/types/database';

interface Maestros {
  responsables: Responsable[];
  productos: Producto[];
}

interface InventarioRow {
  localId: string;
  ubicacion: UbicacionInventario;
  codigo_producto: string;
  nombre_producto: string;
  unidad_medida: string;
  cantidad: string;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

function emptyRow(ubicacion: UbicacionInventario): InventarioRow {
  return {
    localId: newId(),
    ubicacion,
    codigo_producto: '',
    nombre_producto: '',
    unidad_medida: '',
    cantidad: '',
  };
}

export default function InventarioPage() {
  const { puede } = useRol();
  const puedeGuardar = puede('inventario', 'registrar');

  const [maestros, setMaestros] = useState<Maestros | null>(null);
  const [loading, setLoading] = useState(true);
  const [fecha, setFecha] = useState(hoyChile());
  const [responsableId, setResponsableId] = useState('');
  const [observacion, setObservacion] = useState('');
  const [ubicacionActiva, setUbicacionActiva] = useState<UbicacionInventario>(UBICACIONES_INVENTARIO[0]);
  const [rows, setRows] = useState<InventarioRow[]>([emptyRow(UBICACIONES_INVENTARIO[0])]);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/maestros')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setMaestros({
          responsables: data.responsables ?? [],
          productos: data.productos ?? [],
        });
      })
      .catch(e => setErr(e instanceof Error ? e.message : 'Error cargando maestros'))
      .finally(() => setLoading(false));
  }, []);

  const productoMap = useMemo(
    () => new Map((maestros?.productos ?? []).map(producto => [producto.codigo, producto])),
    [maestros],
  );

  const rowsActivas = rows.filter(row => row.ubicacion === ubicacionActiva);
  const totalValidas = rows.filter(row => row.codigo_producto && (Number(row.cantidad) || 0) > 0).length;

  const conteoPorUbicacion = useMemo(() => {
    const map = new Map<UbicacionInventario, number>();
    for (const ubicacion of UBICACIONES_INVENTARIO) map.set(ubicacion, 0);
    for (const row of rows) {
      if (row.codigo_producto && (Number(row.cantidad) || 0) > 0) {
        map.set(row.ubicacion, (map.get(row.ubicacion) ?? 0) + 1);
      }
    }
    return map;
  }, [rows]);

  function addRow(ubicacion = ubicacionActiva) {
    setRows(current => [...current, emptyRow(ubicacion)]);
  }

  function updateRow(localId: string, patch: Partial<InventarioRow>) {
    setRows(current => current.map(row => row.localId === localId ? { ...row, ...patch } : row));
  }

  function handleProductoChange(localId: string, codigo: string) {
    const producto = productoMap.get(codigo);
    if (!producto) {
      updateRow(localId, {
        codigo_producto: '',
        nombre_producto: '',
        unidad_medida: '',
        cantidad: '',
      });
      return;
    }
    updateRow(localId, {
      codigo_producto: producto.codigo,
      nombre_producto: producto.nombre,
      unidad_medida: producto.unidad_medida ?? '',
    });
  }

  function removeRow(localId: string) {
    setRows(current => {
      if (current.length === 1) return [emptyRow(ubicacionActiva)];
      const filtered = current.filter(row => row.localId !== localId);
      return filtered.length ? filtered : [emptyRow(ubicacionActiva)];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setOk('');

    if (!puedeGuardar) {
      setErr('Tu perfil no puede registrar inventario.');
      return;
    }
    if (!responsableId) {
      setErr('Selecciona un responsable.');
      return;
    }

    const detalle = rows
      .map(row => ({
        ubicacion: row.ubicacion,
        codigo_producto: row.codigo_producto,
        nombre_producto: row.nombre_producto,
        cantidad: Number(row.cantidad),
        unidad_medida: row.unidad_medida || null,
      }))
      .filter(row => row.codigo_producto && Number.isFinite(row.cantidad) && row.cantidad > 0);

    if (!detalle.length) {
      setErr('Agrega al menos un producto con cantidad válida.');
      return;
    }

    if (!window.confirm(`Enviar toma de inventario con ${detalle.length} producto(s)?`)) {
      return;
    }

    const responsable = maestros?.responsables.find(item => item.id === responsableId);
    setSaving(true);
    try {
      const res = await fetch('/api/inventario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha,
          responsable_id: responsableId,
          responsable_nombre: responsable?.nombre ?? '',
          observacion: observacion.trim(),
          detalle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando inventario');
      setOk(`Inventario enviado: ${detalle.length} producto(s) registrados.`);
      setFecha(hoyChile());
      setResponsableId('');
      setObservacion('');
      setUbicacionActiva(UBICACIONES_INVENTARIO[0]);
      setRows([emptyRow(UBICACIONES_INVENTARIO[0])]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Error guardando inventario');
    } finally {
      setSaving(false);
    }
  }

  const field: React.CSSProperties = {
    width: '100%',
    border: '1.5px solid var(--bo)',
    borderRadius: '10px',
    padding: '9px 11px',
    fontSize: '14px',
    background: 'var(--bg)',
    color: 'var(--tx)',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
    boxSizing: 'border-box',
  };

  const label: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--ts)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginBottom: '5px',
  };

  if (loading) {
    return <div className="page" style={{ color: 'var(--ts)', fontSize: '14px' }}>Cargando inventario...</div>;
  }

  return (
    <div className="page" style={{ paddingBottom: '42px' }}>
      <div style={{ marginBottom: '18px' }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 4px' }}>Toma de inventario</h1>
        <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>
          Registra stock por cámara o bodega. Solo se ingresan cantidades.
        </p>
      </div>

      {err && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px' }}>
          {err}
        </div>
      )}
      {ok && (
        <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px' }}>
          {ok}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
        <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '12px', padding: '16px' }}>
          <div className="inventario-head-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
            <div>
              <label style={label}>Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={field} />
            </div>
            <div>
              <label style={label}>Responsable</label>
              <select value={responsableId} onChange={e => setResponsableId(e.target.value)} style={field}>
                <option value="">Seleccionar...</option>
                {maestros?.responsables.map(responsable => (
                  <option key={responsable.id} value={responsable.id}>{responsable.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>Productos válidos</label>
              <div style={{ ...field, display: 'flex', alignItems: 'center', fontWeight: 700 }}>
                {totalValidas} linea{totalValidas !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <label style={label}>Observación</label>
            <textarea
              value={observacion}
              onChange={e => setObservacion(e.target.value)}
              rows={3}
              style={{ ...field, resize: 'vertical' }}
              placeholder="Opcional"
            />
          </div>
        </section>

        <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div>
              <p style={{ margin: '0 0 3px', fontSize: '11px', color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                Ubicación
              </p>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--tx)' }}>{ubicacionActiva}</h2>
            </div>
            <button
              type="button"
              onClick={() => addRow()}
              style={{ border: 'none', background: 'var(--ac)', color: '#fff', borderRadius: '9px', padding: '10px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}
            >
              + Agregar producto
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
            {UBICACIONES_INVENTARIO.map(ubicacion => {
              const active = ubicacion === ubicacionActiva;
              const total = conteoPorUbicacion.get(ubicacion) ?? 0;
              return (
                <button
                  key={ubicacion}
                  type="button"
                  onClick={() => {
                    setUbicacionActiva(ubicacion);
                    if (!rows.some(row => row.ubicacion === ubicacion)) {
                      setRows(current => [...current, emptyRow(ubicacion)]);
                    }
                  }}
                  style={{
                    borderRadius: '999px',
                    border: `1px solid ${active ? 'var(--ac)' : 'var(--bo)'}`,
                    background: active ? 'var(--al)' : 'var(--bg)',
                    color: active ? 'var(--ac)' : 'var(--ts)',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    minHeight: '40px',
                  }}
                >
                  <span>{ubicacion}</span>
                  <span style={{ background: active ? 'var(--sf)' : 'var(--al)', color: active ? 'var(--ac)' : 'var(--ts)', borderRadius: '999px', padding: '2px 7px', fontSize: '11px' }}>
                    {total}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            {rowsActivas.map(row => (
              <div key={row.localId} style={{ border: '1px solid var(--bo)', borderRadius: '12px', padding: '12px', background: 'var(--bg)' }}>
                <div className="inventario-row-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(120px, 0.8fr) auto', gap: '10px', alignItems: 'end' }}>
                  <div>
                    <label style={label}>Producto</label>
                    <ProductSearchSelect
                      value={row.codigo_producto}
                      onChange={codigo => handleProductoChange(row.localId, codigo)}
                      productos={maestros?.productos ?? []}
                      placeholder={`Buscar en ${(maestros?.productos ?? []).length} productos...`}
                      allowManual={false}
                    />
                  </div>
                  <div>
                    <label style={label}>Cantidad</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={row.cantidad}
                      onChange={e => updateRow(row.localId, { cantidad: e.target.value })}
                      style={field}
                      placeholder="0"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(row.localId)}
                    style={{ border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#991B1B', borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, minHeight: '42px' }}
                  >
                    Quitar
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginTop: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx)' }}>
                    {row.nombre_producto || 'Sin producto seleccionado'}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--ts)' }}>
                    {row.codigo_producto || '-'} {row.unidad_medida ? `· ${row.unidad_medida}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              setRows([emptyRow(UBICACIONES_INVENTARIO[0])]);
              setUbicacionActiva(UBICACIONES_INVENTARIO[0]);
            }}
            style={{ border: '1px solid var(--bo)', background: 'var(--sf)', color: 'var(--ts)', borderRadius: '10px', padding: '11px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}
          >
            Limpiar
          </button>
          <button
            type="submit"
            disabled={saving || !puedeGuardar}
            style={{ border: 'none', background: saving || !puedeGuardar ? '#94A3B8' : '#0D9373', color: '#fff', borderRadius: '10px', padding: '11px 18px', cursor: saving ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 800, minWidth: '180px' }}
          >
            {saving ? 'Enviando...' : 'Enviar inventario'}
          </button>
        </div>
      </form>

      <style>{`
        @media (max-width: 960px) {
          .inventario-head-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 720px) {
          .inventario-row-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
