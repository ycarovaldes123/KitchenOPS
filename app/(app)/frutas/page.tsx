'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { formatCLP } from '@/lib/calculos';
import { useRol } from '@/components/RolProvider';

type Responsable = {
  id: string;
  nombre: string;
  color_hex?: string | null;
  iniciales?: string | null;
};

type Producto = {
  codigo: string;
  nombre: string;
  unidad_medida: string;
  costo_promedio?: number;
};

type Maestros = {
  responsables: Responsable[];
  productos: Producto[];
};

type FrutaRow = {
  key: number;
  codigo_producto: string;
  nombre_producto: string;
  cantidad: string;
  unidad_medida: string;
  costo_unitario: number;
};

let seq = 0;
const newKey = () => ++seq;
const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

const UM_COLOR: Record<string, string> = {
  KG: '#0D9373',
  GR: '#6366F1',
  LT: '#0EA5E9',
  UN: '#D97706',
  CC: '#8B5CF6',
  PR: '#64748B',
};

function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function calcCostoFila(row: FrutaRow) {
  const cantidad = parseFloat(row.cantidad) || 0;
  return Math.round(cantidad * (row.costo_unitario || 0));
}

function ProductoSelector({
  productos,
  selectedCodigo,
  selectedNombre,
  selectedUM,
  onSelect,
  onClear,
}: {
  productos: Producto[];
  selectedCodigo: string;
  selectedNombre: string;
  selectedUM: string;
  onSelect: (p: Producto) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = normalizar(query);
    if (!q) return productos.slice(0, 80);
    return productos
      .filter(p => normalizar(`${p.codigo} ${p.nombre} ${p.unidad_medida}`).includes(q))
      .slice(0, 80);
  }, [productos, query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  if (selectedCodigo) {
    const color = UM_COLOR[selectedUM] || '#6B7280';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', flexShrink: 0, background: `${color}18`, color, border: `1px solid ${color}40`, whiteSpace: 'nowrap' }}>
          {selectedUM}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedNombre}
        </span>
        <button
          type="button"
          onClick={onClear}
          title="Quitar fruta"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '16px', lineHeight: 1, flexShrink: 0, padding: '2px 4px', borderRadius: '4px' }}
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
        onClick={() => setOpen(v => !v)}
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
        }}
      >
        <span>Seleccionar fruta...</span>
        <span style={{ fontSize: '10px' }}>v</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          zIndex: 500,
          width: 'max(100%, 300px)',
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
              onChange={e => setQuery(e.target.value)}
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
            />
          </div>
          <div style={{ maxHeight: '250px', overflowY: 'auto', padding: '4px 0 6px' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>
                Sin coincidencias
              </div>
            ) : filtered.map(p => {
              const color = UM_COLOR[p.unidad_medida] || '#6B7280';
              return (
                <button
                  key={p.codigo}
                  type="button"
                  onClick={() => {
                    onSelect(p);
                    setOpen(false);
                    setQuery('');
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--al)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: `${color}18`, color, border: `1px solid ${color}40`, flexShrink: 0, minWidth: '34px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {p.unidad_medida}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--tx)', flex: 1 }}>{p.nombre}</span>
                  {(p.costo_promedio ?? 0) > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--ts)', flexShrink: 0 }}>
                      {formatCLP(p.costo_promedio ?? 0)}/{p.unidad_medida.toLowerCase()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FrutasPage() {
  const { rol } = useRol();
  const verCostos = rol !== 'cocina';

  const [maestros, setMaestros] = useState<Maestros | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fecha, setFecha] = useState(hoyChile());
  const [responsableId, setResponsableId] = useState('');
  const [observacion, setObservacion] = useState('');
  const [rows, setRows] = useState<FrutaRow[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/maestros')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setMaestros(data);
      })
      .catch(() => setErr('Error cargando datos maestros.'))
      .finally(() => setCargando(false));
  }, []);

  function addRow() {
    setRows(prev => [...prev, { key: newKey(), codigo_producto: '', nombre_producto: '', cantidad: '', unidad_medida: '', costo_unitario: 0 }]);
  }

  function selectProducto(key: number, p: Producto) {
    setRows(prev => prev.map(row => row.key !== key ? row : {
      ...row,
      codigo_producto: p.codigo,
      nombre_producto: p.nombre,
      unidad_medida: p.unidad_medida,
      costo_unitario: Number(p.costo_promedio) || 0,
    }));
  }

  function clearProducto(key: number) {
    setRows(prev => prev.map(row => row.key !== key ? row : { ...row, codigo_producto: '', nombre_producto: '', cantidad: '', unidad_medida: '', costo_unitario: 0 }));
  }

  function removeRow(key: number) {
    setRows(prev => prev.filter(row => row.key !== key));
  }

  function updateCantidad(key: number, value: string) {
    setRows(prev => prev.map(row => row.key !== key ? row : { ...row, cantidad: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setOk('');

    if (!responsableId) {
      setErr('Selecciona un responsable antes de guardar.');
      return;
    }

    const detalle = rows
      .filter(row => row.codigo_producto && parseFloat(row.cantidad) > 0)
      .map(row => ({
        codigo_producto: row.codigo_producto,
        nombre_producto: row.nombre_producto,
        cantidad: parseFloat(row.cantidad),
        unidad_medida: row.unidad_medida,
        costo_unitario: row.costo_unitario,
        costo_total: calcCostoFila(row),
      }));

    if (!detalle.length) {
      setErr('Agrega al menos una fruta con cantidad valida.');
      return;
    }

    const responsable = maestros?.responsables.find(r => r.id === responsableId);
    setGuardando(true);
    try {
      const res = await fetch('/api/frutas', {
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
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      setOk(`Informe de frutas guardado: ${detalle.length} linea${detalle.length !== 1 ? 's' : ''}.`);
      setFecha(hoyChile());
      setResponsableId('');
      setObservacion('');
      setRows([]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setGuardando(false);
    }
  }

  const responsableActual = maestros?.responsables.find(r => r.id === responsableId);
  const rowsValidos = rows.filter(row => row.codigo_producto && parseFloat(row.cantidad) > 0);
  const costoTotal = rows.reduce((sum, row) => sum + calcCostoFila(row), 0);
  const warnings = rows.filter(row => row.codigo_producto && row.costo_unitario === 0).length;
  const canSave = Boolean(responsableId && rowsValidos.length > 0);

  const inp: CSSProperties = {
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
  const lbl: CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--ts)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginBottom: '5px',
  };
  const thinInp: CSSProperties = {
    border: '1.5px solid var(--bo)',
    borderRadius: '7px',
    padding: '6px 8px',
    fontSize: '13px',
    background: 'var(--bg)',
    color: 'var(--tx)',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
  };

  if (cargando) {
    return (
      <>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ padding: '80px 32px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid var(--bo)', borderTopColor: 'var(--ac)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <p style={{ color: 'var(--ts)', fontSize: '14px', marginTop: '16px' }}>Cargando datos...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1023px) { .frutas-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <div className="page" style={{ paddingBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 3px' }}>Frutas</h1>
            <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>
              Snack diario del personal
              {responsableActual && <> - <strong style={{ color: 'var(--tx)' }}>{responsableActual.nombre}</strong></>}
            </p>
          </div>
          {rows.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', background: 'var(--sf)', border: '1px solid var(--bo)', padding: '4px 12px', borderRadius: '20px', color: 'var(--ts)' }}>
                {rows.length} linea{rows.length !== 1 ? 's' : ''}
              </span>
              {verCostos && costoTotal > 0 && (
                <span style={{ fontSize: '12px', fontWeight: 700, background: 'var(--al)', border: '1px solid var(--ac)', padding: '4px 12px', borderRadius: '20px', color: 'var(--ac)' }}>
                  {formatCLP(costoTotal)} total
                </span>
              )}
            </div>
          )}
        </div>

        {ok && (
          <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#065F46' }}>
            <span style={{ flex: 1 }}>{ok}</span>
            <button type="button" onClick={() => setOk('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065F46', fontSize: '18px', lineHeight: 1 }}>x</button>
          </div>
        )}
        {err && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#991B1B' }}>
            <span style={{ flex: 1 }}>{err}</span>
            <button type="button" onClick={() => setErr('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', fontSize: '18px', lineHeight: 1 }}>x</button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="frutas-grid" style={{ display: 'grid', gridTemplateColumns: '310px 1fr', gap: '14px', alignItems: 'start' }}>
            <div style={{ background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontFamily: 'Syne, sans-serif', fontSize: '12px', fontWeight: 800, color: 'var(--ts)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Datos del informe
              </p>

              <div>
                <label style={lbl}>Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />
              </div>

              <div>
                <label style={lbl}>Responsable <span style={{ color: 'var(--rd)' }}>*</span></label>
                {responsableActual ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '9px', border: '1.5px solid var(--tl)', background: '#ECFDF5' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, background: responsableActual.color_hex ?? 'var(--ac)', color: '#fff', fontSize: '11px', fontWeight: 700 }}>
                      {responsableActual.iniciales ?? responsableActual.nombre.slice(0, 2)}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 600, flex: 1, color: '#065F46' }}>{responsableActual.nombre}</span>
                    <button type="button" onClick={() => setResponsableId('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065F46', fontSize: '16px', padding: '2px' }}>x</button>
                  </div>
                ) : (
                  <select value={responsableId} onChange={e => setResponsableId(e.target.value)} style={{ ...inp, color: responsableId ? 'var(--tx)' : 'var(--ts)' }}>
                    <option value="">Seleccionar responsable...</option>
                    {maestros?.responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label style={lbl}>Observacion</label>
                <textarea
                  value={observacion}
                  onChange={e => setObservacion(e.target.value)}
                  placeholder="Ej: snack turno AM, reposicion, fruta extra"
                  rows={5}
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }}
                />
              </div>
            </div>

            <div style={{ background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '420px' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Frutas entregadas</span>
                  {rows.length > 0 && (
                    <span style={{ background: 'var(--ac)', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>{rows.length}</span>
                  )}
                </div>
                {rows.length > 0 && (
                  <button type="button" onClick={addRow} className="btn btn-outline" style={{ minHeight: '30px', padding: '5px 12px', fontSize: '12px' }}>
                    + Agregar
                  </button>
                )}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {rows.length === 0 ? (
                  <div style={{ padding: '52px 32px', textAlign: 'center' }}>
                    <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--tx)', margin: '0 0 6px', fontFamily: 'Syne, sans-serif' }}>
                      Sin frutas registradas
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--ts)', margin: '0 0 22px', lineHeight: 1.5 }}>
                      Agrega las frutas entregadas en el dia
                    </p>
                    <button type="button" onClick={addRow} className="btn">
                      + Agregar primera fruta
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ overflowX: 'auto', flex: 1 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg)' }}>
                            {['Fruta', 'Cantidad', 'Unidad', ...(verCostos ? ['Costo est.'] : []), ''].map((h, i) => (
                              <th key={h} style={{ padding: '10px 12px', textAlign: i === 4 ? 'center' : 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(row => {
                            const costo = calcCostoFila(row);
                            return (
                              <tr key={row.key} style={{ borderBottom: '1px solid var(--bo)' }}>
                                <td style={{ padding: '9px 12px', minWidth: '230px' }}>
                                  <ProductoSelector
                                    productos={maestros?.productos ?? []}
                                    selectedCodigo={row.codigo_producto}
                                    selectedNombre={row.nombre_producto}
                                    selectedUM={row.unidad_medida}
                                    onSelect={p => selectProducto(row.key, p)}
                                    onClear={() => clearProducto(row.key)}
                                  />
                                </td>
                                <td style={{ padding: '9px 8px', width: '110px' }}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={row.cantidad}
                                    onChange={e => updateCantidad(row.key, e.target.value)}
                                    placeholder="0"
                                    style={{ ...thinInp, width: '78px' }}
                                  />
                                </td>
                                <td style={{ padding: '9px 12px', fontSize: '12px', color: 'var(--ts)', whiteSpace: 'nowrap' }}>
                                  {row.unidad_medida?.toLowerCase() || '-'}
                                </td>
                                {verCostos && (
                                  <td style={{ padding: '9px 12px', fontSize: '13px', whiteSpace: 'nowrap', fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: costo > 0 ? 'var(--tx)' : 'var(--ts)' }}>
                                    {costo > 0 ? formatCLP(costo) : '-'}
                                  </td>
                                )}
                                <td style={{ padding: '9px 8px', textAlign: 'center', width: '44px' }}>
                                  <button
                                    type="button"
                                    onClick={() => removeRow(row.key)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '18px', lineHeight: 1, padding: '4px 6px', borderRadius: '6px' }}
                                  >
                                    x
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '14px', background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', padding: '16px 22px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '24px', flex: 1, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Lineas validas</p>
                <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: rowsValidos.length > 0 ? 'var(--tx)' : 'var(--ts)', margin: 0, lineHeight: 1.1 }}>
                  {rowsValidos.length}<span style={{ fontSize: '13px', color: 'var(--ts)', fontWeight: 400, marginLeft: '3px' }}>/{rows.length} total</span>
                </p>
              </div>

              {verCostos && costoTotal > 0 && (
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Costo total</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: 'var(--ac)', margin: 0, lineHeight: 1.1 }}>
                    {formatCLP(costoTotal)}
                  </p>
                </div>
              )}

              {verCostos && warnings > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '8px', padding: '5px 11px' }}>
                  <span style={{ fontSize: '12px', color: '#92400E', fontWeight: 600 }}>{warnings} linea{warnings !== 1 ? 's' : ''} sin costo</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={guardando}
              style={{
                background: guardando ? 'var(--ts)' : canSave ? 'var(--ac)' : 'var(--bo)',
                color: canSave || guardando ? '#fff' : 'var(--ts)',
                border: 'none',
                borderRadius: '10px',
                padding: '12px 28px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: guardando ? 'wait' : canSave ? 'pointer' : 'not-allowed',
                fontFamily: 'DM Sans, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexShrink: 0,
                minWidth: '190px',
                justifyContent: 'center',
              }}
            >
              {guardando ? 'Guardando...' : 'Guardar frutas'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
