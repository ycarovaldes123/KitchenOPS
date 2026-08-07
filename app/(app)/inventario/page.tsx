'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { useRol } from '@/components/RolProvider';
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

interface ImportReviewRow {
  codigo: string;
  producto: string;
  unidad: string;
  cantidad: number | null;
  estado: 'OK' | 'ERROR';
  mensaje: string;
}

const UM_COLOR: Record<string, string> = {
  KG: '#0D9373',
  GR: '#6366F1',
  LT: '#0EA5E9',
  UN: '#D97706',
  CC: '#8B5CF6',
  PR: '#64748B',
};

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

function normalizeText(text: unknown) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseCantidadIngresada(value: string): number | null {
  if (value.trim() === '') return null;
  const cantidad = Number(value);
  return Number.isFinite(cantidad) && cantidad >= 0 ? cantidad : null;
}

function ProductoSelector({ productos, selectedCodigo, selectedNombre, selectedUM, onSelect, onClear }: {
  productos: Producto[];
  selectedCodigo: string;
  selectedNombre: string;
  selectedUM: string;
  onSelect: (producto: Producto) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeText(query).trim();
    if (!normalizedQuery) return productos.slice(0, 80);
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);

    return productos
      .filter(producto => {
        const haystack = normalizeText([
          producto.codigo,
          producto.nombre,
          producto.unidad_medida,
        ].join(' '));
        return terms.every(term => haystack.includes(term));
      })
      .slice(0, 80);
  }, [productos, query]);
  const safeActiveIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0));

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  function selectProducto(producto: Producto) {
    onSelect(producto);
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }

  if (selectedCodigo) {
    const color = UM_COLOR[selectedUM] || '#6B7280';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span style={{
          fontSize: '9px',
          fontWeight: 700,
          padding: '2px 7px',
          borderRadius: '4px',
          flexShrink: 0,
          background: `${color}18`,
          color,
          border: `1px solid ${color}40`,
          whiteSpace: 'nowrap',
        }}>
          {selectedUM || 'UM'}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedNombre}
        </span>
        <button
          type="button"
          onClick={onClear}
          title="Quitar producto"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '16px', lineHeight: 1, flexShrink: 0, padding: '2px 4px', borderRadius: '4px' }}
          onMouseEnter={event => (event.currentTarget.style.color = 'var(--rd)')}
          onMouseLeave={event => (event.currentTarget.style.color = 'var(--ts)')}
        >
          x
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: open ? 'var(--al)' : 'var(--bg)',
          border: `1.5px solid ${open ? 'var(--ac)' : 'var(--bo)'}`,
          borderRadius: '8px',
          padding: '6px 10px',
          fontSize: '12px',
          color: 'var(--ts)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          fontFamily: 'DM Sans, sans-serif',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <span>Seleccionar producto...</span>
        <span style={{ fontSize: '9px', display: 'inline-block', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}>v</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          zIndex: 800,
          width: 'max(100%, 320px)',
          background: 'var(--sf)',
          border: '1.5px solid var(--ac)',
          borderRadius: '12px',
          boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px 0' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  setOpen(false);
                  setQuery('');
                  setActiveIndex(0);
                  return;
                }

                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex(index => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
                  return;
                }

                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex(index => Math.max(index - 1, 0));
                  return;
                }

                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  if (filtered[safeActiveIndex]) selectProducto(filtered[safeActiveIndex]);
                  return;
                }

                if (event.key === 'Tab' && filtered[safeActiveIndex]) {
                  selectProducto(filtered[safeActiveIndex]);
                }
              }}
              placeholder={`Buscar en ${productos.length} productos...`}
              style={{
                width: '100%',
                border: '1.5px solid var(--bo)',
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '13px',
                background: 'var(--bg)',
                color: 'var(--tx)',
                outline: 'none',
                fontFamily: 'DM Sans, sans-serif',
                boxSizing: 'border-box',
              }}
              onFocus={event => (event.currentTarget.style.borderColor = 'var(--ac)')}
              onBlur={event => (event.currentTarget.style.borderColor = 'var(--bo)')}
            />
          </div>
          <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '4px 0 6px' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>
                {productos.length === 0 ? 'Sin productos configurados.' : 'Sin coincidencias'}
              </div>
            ) : filtered.map((producto, index) => {
              const color = UM_COLOR[producto.unidad_medida] || '#6B7280';
              return (
                <button
                  key={producto.codigo}
                  type="button"
                  tabIndex={-1}
                  onClick={() => selectProducto(producto)}
                  style={{ width: '100%', textAlign: 'left', background: index === safeActiveIndex ? 'var(--al)' : 'none', border: 'none', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'DM Sans, sans-serif' }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: `${color}18`, color, border: `1px solid ${color}40`, flexShrink: 0, minWidth: '34px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {producto.unidad_medida || 'UM'}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--tx)', flex: 1 }}>{producto.nombre}</span>
                  <span style={{ fontSize: '11px', color: 'var(--ts)', flexShrink: 0 }}>{producto.codigo}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
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
  const [rows, setRows] = useState<InventarioRow[]>([]);
  const [importReview, setImportReview] = useState<ImportReviewRow[] | null>(null);
  const [importValid, setImportValid] = useState(false);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [cantidadLineas, setCantidadLineas] = useState('10');
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

  const rowsActivas = rows.filter(row => row.ubicacion === ubicacionActiva);
  const totalValidas = rows.filter(row => row.codigo_producto && parseCantidadIngresada(row.cantidad) !== null).length;
  const ubicacionesConDatos = new Set(rows.filter(row => row.codigo_producto && parseCantidadIngresada(row.cantidad) !== null).map(row => row.ubicacion)).size;

  const conteoPorUbicacion = useMemo(() => {
    const map = new Map<UbicacionInventario, number>();
    for (const ubicacion of UBICACIONES_INVENTARIO) map.set(ubicacion, 0);
    for (const row of rows) {
      if (row.codigo_producto && parseCantidadIngresada(row.cantidad) !== null) {
        map.set(row.ubicacion, (map.get(row.ubicacion) ?? 0) + 1);
      }
    }
    return map;
  }, [rows]);

  const respActual = maestros?.responsables.find(responsable => responsable.id === responsableId);
  const canSave = Boolean(puedeGuardar && responsableId && totalValidas > 0 && (!importReview || importValid));

  function addRows(cantidad: number, ubicacion = ubicacionActiva) {
    const safeCantidad = Math.min(Math.max(Math.floor(cantidad) || 1, 1), 100);
    setRows(current => [
      ...current,
      ...Array.from({ length: safeCantidad }, () => emptyRow(ubicacion)),
    ]);
  }

  function addRow(ubicacion = ubicacionActiva) {
    addRows(1, ubicacion);
  }

  function updateRow(localId: string, patch: Partial<InventarioRow>) {
    setRows(current => current.map(row => row.localId === localId ? { ...row, ...patch } : row));
  }

  function handleProductoSelect(localId: string, producto: Producto) {
    updateRow(localId, {
      codigo_producto: producto.codigo,
      nombre_producto: producto.nombre,
      unidad_medida: producto.unidad_medida ?? '',
    });
  }

  function clearProducto(localId: string) {
    updateRow(localId, {
      codigo_producto: '',
      nombre_producto: '',
      unidad_medida: '',
      cantidad: '',
    });
  }

  function limpiarImportacion() {
    setImportReview(null);
    setImportValid(false);
    setRows([]);
  }

  async function subirInventario(file: File | null) {
    if (!file) return;
    setErr('');
    setOk('');
    setImporting(true);
    setImportReview(null);
    setImportValid(false);
    setRows([]);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/inventario/importar', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error importando inventario');
      const review = Array.isArray(data.rows) ? data.rows as ImportReviewRow[] : [];
      setImportReview(review);
      setImportValid(Boolean(data.ok));
      if (data.ok) {
        setRows(review.map(row => ({
          localId: newId(),
          ubicacion: ubicacionActiva,
          codigo_producto: row.codigo,
          nombre_producto: row.producto,
          unidad_medida: row.unidad,
          cantidad: row.cantidad == null ? '' : String(row.cantidad),
        })));
        setOk(`Archivo validado: ${review.length} producto(s) listos para enviar en ${ubicacionActiva}.`);
      } else {
        setErr(`Archivo con errores: ${data.errores ?? review.filter(row => row.estado !== 'OK').length} linea(s) requieren revision.`);
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Error importando inventario');
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  }

  function removeRow(localId: string) {
    setRows(current => current.filter(row => row.localId !== localId));
  }

  function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    if (event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
  }

  function rowStatus(row: InventarioRow) {
    if (!row.codigo_producto || parseCantidadIngresada(row.cantidad) === null) return 'Incompleto';
    return 'OK';
  }

  async function handleSubmit(e: FormEvent) {
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
      .map(row => {
        const cantidad = parseCantidadIngresada(row.cantidad);
        return {
          ubicacion: row.ubicacion,
          codigo_producto: row.codigo_producto,
          nombre_producto: row.nombre_producto,
          cantidad,
          unidad_medida: row.unidad_medida || null,
        };
      })
      .filter(row => row.codigo_producto && row.cantidad !== null);

    if (!detalle.length) {
      setErr('Agrega al menos un producto con cantidad valida.');
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
      setRows([]);
      setImportReview(null);
      setImportValid(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Error guardando inventario');
    } finally {
      setSaving(false);
    }
  }

  const field: CSSProperties = {
    width: '100%',
    border: '1.5px solid var(--bo)',
    borderRadius: '8px',
    padding: '8px 11px',
    fontSize: '14px',
    background: 'var(--bg)',
    color: 'var(--tx)',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
    boxSizing: 'border-box',
  };

  const label: CSSProperties = {
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
    <div className="page" style={{ paddingBottom: '48px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 4px' }}>Toma Inventario</h1>
          <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>
            Registra stock por camara o bodega. Solo se ingresan cantidades.
          </p>
        </div>
        {rows.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', background: 'var(--sf)', border: '1px solid var(--bo)', padding: '4px 12px', borderRadius: '20px', color: 'var(--ts)' }}>
              {totalValidas} linea{totalValidas !== 1 ? 's' : ''} valida{totalValidas !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 700, background: 'var(--al)', border: '1px solid var(--ac)', padding: '4px 12px', borderRadius: '20px', color: 'var(--ac)' }}>
              {ubicacionesConDatos} ubicacion{ubicacionesConDatos !== 1 ? 'es' : ''}
            </span>
          </div>
        )}
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

      <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
        <div className="inventario-grid" style={{ display: 'grid', gridTemplateColumns: '310px 1fr', gap: '14px', alignItems: 'start' }}>
          <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontFamily: 'Syne, sans-serif', fontSize: '12px', fontWeight: 800, color: 'var(--ts)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Datos de la toma
            </p>

            <div>
              <label style={label}>Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={field} />
            </div>

            <div>
              <label style={label}>Responsable <span style={{ color: 'var(--rd)' }}>*</span></label>
              {respActual ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '9px', border: '1.5px solid var(--tl)', background: '#ECFDF5' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, background: respActual.color_hex ?? 'var(--ac)', color: '#fff', fontSize: '11px', fontWeight: 700 }}>
                    {respActual.iniciales ?? respActual.nombre.slice(0, 2)}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 600, flex: 1, color: '#065F46', minWidth: 0 }}>{respActual.nombre}</span>
                  <button type="button" onClick={() => setResponsableId('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6EE7B7', fontSize: '16px', padding: '2px' }}>x</button>
                </div>
              ) : (
                <select value={responsableId} onChange={e => setResponsableId(e.target.value)} style={{ ...field, color: responsableId ? 'var(--tx)' : 'var(--ts)' }}>
                  <option value="">Seleccionar responsable...</option>
                  {maestros?.responsables.map(responsable => (
                    <option key={responsable.id} value={responsable.id}>{responsable.nombre}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label style={label}>Camara</label>
              <select
                value={ubicacionActiva}
                onChange={event => {
                  const nuevaUbicacion = event.target.value as UbicacionInventario;
                  setUbicacionActiva(nuevaUbicacion);
                  if (importReview && importValid) {
                    setRows(current => current.map(row => ({ ...row, ubicacion: nuevaUbicacion })));
                  }
                }}
                style={{ ...field, color: 'var(--tx)', fontWeight: 700 }}
                onFocus={event => (event.currentTarget.style.borderColor = 'var(--ac)')}
                onBlur={event => (event.currentTarget.style.borderColor = 'var(--bo)')}
              >
                {UBICACIONES_INVENTARIO.map(ubicacion => {
                  const total = conteoPorUbicacion.get(ubicacion) ?? 0;
                  return (
                    <option key={ubicacion} value={ubicacion}>
                      {ubicacion} ({total})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label style={label}>Observacion opcional</label>
              <textarea
                value={observacion}
                onChange={e => setObservacion(e.target.value)}
                rows={2}
                style={{ ...field, resize: 'vertical', minHeight: '64px', lineHeight: 1.45 }}
                placeholder="Opcional"
              />
            </div>

            <div>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => void subirInventario(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                disabled={importing}
                style={{ width: '100%', border: '1.5px solid var(--ac)', background: 'var(--sf)', color: 'var(--ac)', borderRadius: '8px', padding: '9px 12px', cursor: importing ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 800, fontFamily: 'DM Sans, sans-serif' }}
              >
                {importing ? 'Validando archivo...' : 'Subir Inventario'}
              </button>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--ts)', lineHeight: 1.35 }}>
                Usa el Excel generado en Maestro &gt; Productos &gt; Conteo. Se cargara en {ubicacionActiva}.
              </p>
            </div>
          </section>

          <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '420px' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Productos ingresados</span>
                <strong style={{ display: 'block', marginTop: '3px', fontSize: '17px', color: 'var(--tx)', fontFamily: 'Syne, sans-serif' }}>{ubicacionActiva}</strong>
              </div>
              {rowsActivas.length > 0 && (
                <span style={{ background: 'var(--ac)', color: '#fff', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>
                  {rowsActivas.length}
                </span>
              )}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {importReview ? (
                <>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bo)', background: importValid ? '#ECFDF5' : '#FEF2F2', color: importValid ? '#065F46' : '#991B1B', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800 }}>
                      {importValid ? 'Archivo validado correctamente' : 'Archivo con errores de validacion'}
                    </span>
                    <button type="button" onClick={limpiarImportacion} style={{ border: '1px solid var(--bo)', background: 'var(--sf)', color: 'var(--ts)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                      Descartar archivo
                    </button>
                  </div>
                  <div style={{ overflowX: 'auto', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)' }}>
                          {['Codigo', 'Producto', 'Unidad', 'Cantidad ingresada', 'Estado de validacion'].map(heading => (
                            <th key={heading} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importReview.map((row, index) => (
                          <tr key={`${row.codigo}-${index}`} style={{ borderBottom: '1px solid var(--bo)' }}>
                            <td style={{ padding: '9px 12px' }}>
                              <code style={{ fontSize: '12px', background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>{row.codigo}</code>
                            </td>
                            <td style={{ padding: '9px 12px', fontWeight: 600 }}>{row.producto || '-'}</td>
                            <td style={{ padding: '9px 12px', color: 'var(--ts)' }}>{row.unidad || '-'}</td>
                            <td style={{ padding: '9px 12px', fontVariantNumeric: 'tabular-nums' }}>{row.cantidad ?? '-'}</td>
                            <td style={{ padding: '9px 12px' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '20px',
                                fontSize: '10px',
                                fontWeight: 800,
                                background: row.estado === 'OK' ? '#D1FAE5' : '#FEE2E2',
                                color: row.estado === 'OK' ? '#065F46' : '#991B1B',
                              }}>
                                {row.mensaje}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : rowsActivas.length === 0 ? (
                <div style={{ padding: '58px 32px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--tx)', margin: '0 0 6px', fontFamily: 'Syne, sans-serif' }}>
                    Sin productos registrados
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--ts)', margin: '0 0 22px', lineHeight: 1.5 }}>
                    Agrega productos para la camara seleccionada.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => addRow()} style={{
                      background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: '10px',
                      padding: '10px 22px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'DM Sans, sans-serif',
                    }}>
                      + Agregar primer producto
                    </button>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={cantidadLineas}
                        onChange={event => setCantidadLineas(event.target.value)}
                        aria-label="Cantidad de productos a agregar"
                        style={{ ...field, width: '76px', padding: '9px 10px' }}
                      />
                      <button type="button" onClick={() => addRows(Number(cantidadLineas))} style={{
                        background: 'var(--sf)',
                        color: 'var(--ac)',
                        border: '1.5px solid var(--ac)',
                        borderRadius: '10px',
                        padding: '10px 16px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'DM Sans, sans-serif',
                      }}>
                        Agregar cantidad
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)' }}>
                          {['Producto', 'Cantidad ingresada', 'Unidad', 'Estado', ''].map((heading, index) => (
                            <th key={heading} style={{ padding: '10px 12px', textAlign: index === 4 ? 'center' : 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rowsActivas.map(row => (
                          <tr key={row.localId} style={{ borderBottom: '1px solid var(--bo)' }}>
                            <td style={{ padding: '9px 12px', minWidth: '260px' }}>
                              <ProductoSelector
                                productos={maestros?.productos ?? []}
                                selectedCodigo={row.codigo_producto}
                                selectedNombre={row.nombre_producto}
                                selectedUM={row.unidad_medida}
                                onSelect={producto => handleProductoSelect(row.localId, producto)}
                                onClear={() => clearProducto(row.localId)}
                              />
                            </td>
                            <td style={{ padding: '9px 12px', width: '150px' }}>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={row.cantidad}
                                onChange={e => updateRow(row.localId, { cantidad: e.target.value })}
                                style={{ ...field, width: '110px' }}
                                placeholder="0"
                              />
                            </td>
                            <td style={{ padding: '9px 12px', fontSize: '12px', color: 'var(--ts)', whiteSpace: 'nowrap' }}>
                              {row.unidad_medida || '-'}
                            </td>
                            <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '20px',
                                fontSize: '10px',
                                fontWeight: 700,
                                background: rowStatus(row) === 'OK' ? '#D1FAE5' : '#FEF3C7',
                                color: rowStatus(row) === 'OK' ? '#065F46' : '#92400E',
                              }}>
                                {rowStatus(row)}
                              </span>
                            </td>
                            <td style={{ padding: '9px 8px', textAlign: 'center', width: '44px' }}>
                              <button
                                type="button"
                                onClick={() => removeRow(row.localId)}
                                title="Quitar producto"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '18px', lineHeight: 1, padding: '4px 6px', borderRadius: '6px' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEE2E2'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--rd)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ts)'; }}
                              >
                                x
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: '11px 14px', borderTop: '1px solid var(--bo)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flexShrink: 0 }}>
                    <button type="button" onClick={() => addRow()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: '1.5px dashed var(--bo)', borderRadius: '8px', padding: '8px 18px', cursor: 'pointer', fontSize: '13px', color: 'var(--ts)', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ac)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ac)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--bo)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ts)'; }}
                    >
                      + Agregar producto
                    </button>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={cantidadLineas}
                        onChange={event => setCantidadLineas(event.target.value)}
                        aria-label="Cantidad de productos a agregar"
                        style={{ ...field, width: '74px', padding: '8px 10px' }}
                      />
                      <button type="button" onClick={() => addRows(Number(cantidadLineas))} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: '1.5px dashed var(--bo)', borderRadius: '8px', padding: '8px 18px', cursor: 'pointer', fontSize: '13px', color: 'var(--ts)', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ac)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ac)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--bo)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ts)'; }}
                      >
                        Agregar cantidad
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <div style={{ marginTop: '14px', background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', padding: '16px 22px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '24px', flex: 1, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
            <div>
              <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Productos</p>
              <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: totalValidas > 0 ? 'var(--tx)' : 'var(--ts)', margin: 0, lineHeight: 1.1 }}>
                {totalValidas}<span style={{ fontSize: '13px', color: 'var(--ts)', fontWeight: 400, marginLeft: '3px' }}>/{rows.length} total</span>
              </p>
            </div>

            <div>
              <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Camaras con datos</p>
              <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: ubicacionesConDatos > 0 ? 'var(--ac)' : 'var(--ts)', margin: 0, lineHeight: 1.1 }}>
                {ubicacionesConDatos}<span style={{ fontSize: '13px', color: 'var(--ts)', fontWeight: 400, marginLeft: '3px' }}>/{UBICACIONES_INVENTARIO.length}</span>
              </p>
            </div>

            {!responsableId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '5px 11px' }}>
                <span style={{ fontSize: '12px', color: '#991B1B', fontWeight: 600 }}>Falta responsable</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setRows([]);
              setImportReview(null);
              setImportValid(false);
              setUbicacionActiva(UBICACIONES_INVENTARIO[0]);
            }}
            style={{ border: '1px solid var(--bo)', background: 'var(--sf)', color: 'var(--ts)', borderRadius: '10px', padding: '12px 18px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}
          >
            Limpiar
          </button>
          <button
            type="submit"
            disabled={saving || !canSave}
            style={{
              border: 'none',
              background: saving ? 'var(--ts)' : canSave ? '#0D9373' : 'var(--bo)',
              color: saving || canSave ? '#fff' : 'var(--ts)',
              borderRadius: '10px',
              padding: '12px 28px',
              cursor: saving ? 'wait' : canSave ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: 800,
              minWidth: '200px',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {saving ? 'Enviando...' : 'Enviar inventario'}
          </button>
        </div>
      </form>

      <style>{`
        @media (max-width: 1023px) {
          .inventario-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
