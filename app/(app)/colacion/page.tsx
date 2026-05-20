'use client';

import { useState, useEffect, useRef } from 'react';
import { formatCLP } from '@/lib/calculos';
import type { Responsable, Producto } from '@/types/database';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Maestros { responsables: Responsable[]; productos: Producto[]; }

interface IngRow {
  key:             number;
  codigo_producto: string;
  nombre_producto: string;
  cantidad:        string;
  unidad_medida:   string;
  costo_unitario:  number;
}

type RowStatus = 'ok' | 'pendiente' | 'sin-costo';

// ─── Utility ────────────────────────────────────────────────────────────────

let _seq = 0;
const newKey = () => ++_seq;
const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

function calcCostoFila(row: IngRow): number {
  const cant = parseFloat(row.cantidad) || 0;
  if (!cant || !row.costo_unitario) return 0;
  return Math.round(cant * row.costo_unitario);
}

function getRowStatus(row: IngRow): RowStatus {
  if (!row.codigo_producto || !row.cantidad || parseFloat(row.cantidad) === 0) return 'pendiente';
  if (row.costo_unitario === 0) return 'sin-costo';
  return 'ok';
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<RowStatus, { label: string; color: string; bg: string }> = {
  ok:          { label: 'OK',        color: '#065F46', bg: '#D1FAE5' },
  pendiente:   { label: 'Incompleto',color: '#92400E', bg: '#FEF3C7' },
  'sin-costo': { label: 'Sin costo', color: '#991B1B', bg: '#FEE2E2' },
};

const UM_COLOR: Record<string, string> = {
  KG: '#0D9373', GR: '#6366F1', LT: '#0EA5E9',
  UN: '#D97706', CC: '#8B5CF6', PR: '#64748B',
};

// ─── StatusBadge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: RowStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '20px',
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px',
      background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }}>{c.label}</span>
  );
}

// ─── ProductoSelector ────────────────────────────────────────────────────────

function ProductoSelector({ productos, selectedCodigo, selectedNombre, selectedUM, onSelect, onClear }: {
  productos: Producto[]; selectedCodigo: string; selectedNombre: string; selectedUM: string;
  onSelect: (p: Producto) => void; onClear: () => void;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const ref      = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? productos.filter(p =>
        p.nombre.toLowerCase().includes(query.toLowerCase()) ||
        p.codigo.includes(query)
      )
    : productos;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  if (selectedCodigo) {
    const color = UM_COLOR[selectedUM] || '#6B7280';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span style={{
          fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', flexShrink: 0,
          background: `${color}18`, color, border: `1px solid ${color}40`, whiteSpace: 'nowrap',
        }}>{selectedUM}</span>
        <span style={{ fontSize: '13px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedNombre}
        </span>
        <button type="button" onClick={onClear} title="Quitar ingrediente"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '16px', lineHeight: 1, flexShrink: 0, padding: '2px 4px', borderRadius: '4px' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--rd)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ts)')}
        >×</button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{
        width: '100%', textAlign: 'left',
        background: open ? 'var(--al)' : 'var(--bg)',
        border: `1.5px solid ${open ? 'var(--ac)' : 'var(--bo)'}`,
        borderRadius: '8px', padding: '6px 10px', fontSize: '12px',
        color: 'var(--ts)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
        fontFamily: 'DM Sans, sans-serif', transition: 'border-color 0.15s, background 0.15s',
      }}>
        <span>Seleccionar ingrediente...</span>
        <span style={{ fontSize: '9px', display: 'inline-block', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 500,
          width: 'max(100%, 280px)', background: 'var(--sf)',
          border: '1.5px solid var(--ac)', borderRadius: '12px',
          boxShadow: '0 16px 40px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px 0' }}>
            <input
              ref={inputRef} value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Buscar en ${productos.length} ingredientes...`}
              style={{
                width: '100%', border: '1.5px solid var(--bo)', borderRadius: '8px',
                padding: '7px 10px', fontSize: '13px', background: 'var(--bg)', color: 'var(--tx)',
                outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
            />
          </div>
          <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '4px 0 6px' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>
                {productos.length === 0 ? 'Sin ingredientes configurados.' : 'Sin coincidencias'}
              </div>
            ) : filtered.map(p => {
              const color = UM_COLOR[p.unidad_medida] || '#6B7280';
              return (
                <button key={p.codigo} type="button"
                  onClick={() => { onSelect(p); setOpen(false); setQuery(''); }}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'DM Sans, sans-serif' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--al)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: `${color}18`, color, border: `1px solid ${color}40`, flexShrink: 0, minWidth: '34px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {p.unidad_medida}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--tx)', flex: 1 }}>{p.nombre}</span>
                  {p.costo_promedio > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--ts)', flexShrink: 0 }}>
                      {formatCLP(p.costo_promedio)}/{p.unidad_medida.toLowerCase()}
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

// ─── EmptyState ─────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ padding: '52px 32px', textAlign: 'center' }}>
      <div style={{ fontSize: '44px', marginBottom: '14px', opacity: 0.35, lineHeight: 1 }}>🍽️</div>
      <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--tx)', margin: '0 0 6px', fontFamily: 'Syne, sans-serif' }}>
        Sin ingredientes registrados
      </p>
      <p style={{ fontSize: '13px', color: 'var(--ts)', margin: '0 0 22px', lineHeight: 1.5 }}>
        Agrega los ingredientes utilizados<br />en la preparación de la colación
      </p>
      <button type="button" onClick={onAdd} style={{
        background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: '10px',
        padding: '10px 22px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        + Agregar primer ingrediente
      </button>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ColacionPage() {
  const [maestros,      setMaestros]      = useState<Maestros | null>(null);
  const [cargando,      setCargando]      = useState(true);
  const [fecha,         setFecha]         = useState(hoyChile());
  const [responsableId, setResponsableId] = useState('');
  const [menu,          setMenu]          = useState('');
  const [nInscritos,    setNInscritos]    = useState('');
  const [rows,          setRows]          = useState<IngRow[]>([]);
  const [guardando,     setGuardando]     = useState(false);
  const [ok,            setOk]            = useState('');
  const [err,           setErr]           = useState('');

  useEffect(() => {
    fetch('/api/maestros')
      .then(r => r.json())
      .then(data => setMaestros(data))
      .catch(() => setErr('Error cargando datos maestros.'))
      .finally(() => setCargando(false));
  }, []);

  function addRow() {
    setRows(r => [...r, { key: newKey(), codigo_producto: '', nombre_producto: '', cantidad: '', unidad_medida: '', costo_unitario: 0 }]);
  }

  function selectProducto(key: number, p: Producto) {
    setRows(rows => rows.map(r => r.key !== key ? r : {
      ...r, codigo_producto: p.codigo, nombre_producto: p.nombre,
      unidad_medida: p.unidad_medida, costo_unitario: p.costo_promedio,
    }));
  }

  function clearProducto(key: number) {
    setRows(rows => rows.map(r => r.key !== key ? r : { ...r, codigo_producto: '', nombre_producto: '', cantidad: '', unidad_medida: '', costo_unitario: 0 }));
  }

  function removeRow(key: number)              { setRows(r => r.filter(x => x.key !== key)); }
  function updateCantidad(key: number, v: string) { setRows(rows => rows.map(r => r.key !== key ? r : { ...r, cantidad: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setOk('');
    if (!responsableId)    { setErr('Selecciona un responsable antes de guardar.'); return; }
    if (!menu.trim())      { setErr('El menú del día es obligatorio.'); return; }
    const ni = parseInt(nInscritos);
    if (isNaN(ni) || ni <= 0) { setErr('El N° de inscritos debe ser mayor que 0.'); return; }

    const detalle = rows
      .filter(r => r.codigo_producto && parseFloat(r.cantidad) > 0)
      .map(r => ({
        codigo_producto: r.codigo_producto,
        nombre_producto: r.nombre_producto,
        cantidad:        parseFloat(r.cantidad),
        unidad_medida:   r.unidad_medida,
        costo_unitario:  r.costo_unitario,
        costo_total:     calcCostoFila(r),
      }));

    if (!detalle.length) { setErr('Agrega al menos un ingrediente con cantidad válida.'); return; }

    const responsable = maestros?.responsables.find(r => r.id === responsableId);
    setGuardando(true);
    try {
      const res = await fetch('/api/colacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha, responsable_id: responsableId,
          responsable_nombre: responsable?.nombre ?? '',
          menu: menu.trim(), n_inscritos: ni, detalle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      setOk(`Colación guardada — ${detalle.length} ingrediente${detalle.length !== 1 ? 's' : ''} para ${ni} inscritos.`);
      setFecha(hoyChile()); setResponsableId(''); setMenu(''); setNInscritos(''); setRows([]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setGuardando(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const respActual   = maestros?.responsables.find(r => r.id === responsableId);
  const rowsValidos  = rows.filter(r => r.codigo_producto && parseFloat(r.cantidad) > 0);
  const costoTotal   = rows.reduce((s, r) => s + calcCostoFila(r), 0);
  const ni           = parseInt(nInscritos) || 0;
  const costoPorPlato = ni > 0 && costoTotal > 0 ? Math.round(costoTotal / ni) : null;
  const warnings     = rows.filter(r => getRowStatus(r) === 'sin-costo').length;
  const canSave      = !!responsableId && !!menu.trim() && ni > 0 && rowsValidos.length > 0;

  // ── Styles ────────────────────────────────────────────────────────────────

  const inp: React.CSSProperties = {
    width: '100%', border: '1.5px solid var(--bo)', borderRadius: '8px',
    padding: '8px 11px', fontSize: '14px', background: 'var(--bg)',
    color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--ts)',
    textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px',
  };
  const thinInp: React.CSSProperties = {
    border: '1.5px solid var(--bo)', borderRadius: '7px', padding: '6px 8px',
    fontSize: '13px', background: 'var(--bg)', color: 'var(--tx)',
    outline: 'none', fontFamily: 'DM Sans, sans-serif',
  };

  if (cargando) return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ padding: '80px 32px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid var(--bo)', borderTopColor: 'var(--ac)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <p style={{ color: 'var(--ts)', fontSize: '14px', marginTop: '16px' }}>Cargando datos...</p>
      </div>
    </>
  );

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1023px) { .col-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <div className="page" style={{ paddingBottom: '48px' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 3px' }}>Colación</h1>
            <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>
              Comida del personal
              {respActual && <> · <strong style={{ color: 'var(--tx)' }}>{respActual.nombre}</strong></>}
              {menu && <> · <em style={{ color: 'var(--ts)' }}>{menu}</em></>}
            </p>
          </div>
          {rows.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', background: 'var(--sf)', border: '1px solid var(--bo)', padding: '4px 12px', borderRadius: '20px', color: 'var(--ts)' }}>
                {rows.length} ingrediente{rows.length !== 1 ? 's' : ''}
              </span>
              {costoTotal > 0 && (
                <span style={{ fontSize: '12px', fontWeight: 700, background: 'var(--al)', border: '1px solid var(--ac)', padding: '4px 12px', borderRadius: '20px', color: 'var(--ac)' }}>
                  {formatCLP(costoTotal)} total
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Banners ─────────────────────────────────────────────────────── */}
        {ok && (
          <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#065F46' }}>
            <span style={{ fontSize: '18px', flexShrink: 0 }}>✓</span>
            <span style={{ flex: 1 }}>{ok}</span>
            <button onClick={() => setOk('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6EE7B7', fontSize: '20px', lineHeight: 1 }}>×</button>
          </div>
        )}
        {err && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#991B1B' }}>
            <span style={{ fontSize: '18px', flexShrink: 0 }}>⚠</span>
            <span style={{ flex: 1 }}>{err}</span>
            <button onClick={() => setErr('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FECACA', fontSize: '20px', lineHeight: 1 }}>×</button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="col-grid" style={{ display: 'grid', gridTemplateColumns: '310px 1fr', gap: '14px', alignItems: 'start' }}>

            {/* ── Left card ───────────────────────────────────────────────── */}
            <div style={{ background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontFamily: 'Syne, sans-serif', fontSize: '12px', fontWeight: 800, color: 'var(--ts)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Datos de la colación
              </p>

              {/* Fecha */}
              <div>
                <label style={lbl}>Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                />
              </div>

              {/* Responsable */}
              <div>
                <label style={lbl}>Responsable <span style={{ color: 'var(--rd)' }}>*</span></label>
                {respActual ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '9px', border: '1.5px solid var(--tl)', background: '#ECFDF5' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, background: respActual.color_hex ?? 'var(--ac)', color: '#fff', fontSize: '11px', fontWeight: 700 }}>
                      {respActual.iniciales ?? respActual.nombre.slice(0, 2)}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 600, flex: 1, color: '#065F46' }}>{respActual.nombre}</span>
                    <button type="button" onClick={() => setResponsableId('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6EE7B7', fontSize: '16px', padding: '2px' }}>×</button>
                  </div>
                ) : (
                  <select value={responsableId} onChange={e => setResponsableId(e.target.value)}
                    style={{ ...inp, color: responsableId ? 'var(--tx)' : 'var(--ts)' }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                  >
                    <option value="">Seleccionar responsable...</option>
                    {maestros?.responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                  </select>
                )}
              </div>

              {/* N° Inscritos */}
              <div>
                <label style={lbl}>N° inscritos <span style={{ color: 'var(--rd)' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <input type="number" min="1" value={nInscritos}
                    onChange={e => setNInscritos(e.target.value)}
                    placeholder="0"
                    style={{ ...inp, paddingRight: ni > 0 && costoPorPlato ? '80px' : '12px' }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                  />
                  {ni > 0 && costoPorPlato && (
                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--ac)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {formatCLP(costoPorPlato)}/plato
                    </span>
                  )}
                </div>
              </div>

              {/* Menú */}
              <div>
                <label style={lbl}>Menú del día <span style={{ color: 'var(--rd)' }}>*</span></label>
                <textarea value={menu} onChange={e => setMenu(e.target.value)}
                  placeholder="Ej: Cazuela de vacuno, arroz, ensalada y postre"
                  rows={4}
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                />
              </div>
            </div>

            {/* ── Right card ──────────────────────────────────────────────── */}
            <div style={{ background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '420px' }}>

              {/* Header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ingredientes utilizados</span>
                  {rows.length > 0 && (
                    <span style={{ background: 'var(--ac)', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>{rows.length}</span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {rows.length === 0 ? (
                  <EmptyState onAdd={addRow} />
                ) : (
                  <>
                    <div style={{ overflowX: 'auto', flex: 1 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg)' }}>
                            {['Ingrediente', 'Cantidad', 'Unidad', 'Costo est.', 'Estado', ''].map((h, i) => (
                              <th key={i} style={{ padding: '10px 12px', textAlign: i === 5 ? 'center' : 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(row => {
                            const status = getRowStatus(row);
                            const costo  = calcCostoFila(row);
                            return (
                              <tr key={row.key} style={{ borderBottom: '1px solid var(--bo)' }}>
                                <td style={{ padding: '9px 12px', minWidth: '220px' }}>
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
                                  <input type="number" min="0" step="any" value={row.cantidad}
                                    onChange={e => updateCantidad(row.key, e.target.value)}
                                    placeholder="0"
                                    style={{ ...thinInp, width: '72px' }}
                                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                                  />
                                </td>
                                <td style={{ padding: '9px 12px', fontSize: '12px', color: 'var(--ts)', whiteSpace: 'nowrap' }}>
                                  {row.unidad_medida || '—'}
                                </td>
                                <td style={{ padding: '9px 12px', fontSize: '13px', whiteSpace: 'nowrap', fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: costo > 0 ? 'var(--tx)' : 'var(--ts)' }}>
                                  {costo > 0 ? formatCLP(costo) : '—'}
                                </td>
                                <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                  <StatusBadge status={status} />
                                </td>
                                <td style={{ padding: '9px 8px', textAlign: 'center', width: '44px' }}>
                                  <button type="button" onClick={() => removeRow(row.key)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '18px', lineHeight: 1, padding: '4px 6px', borderRadius: '6px' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEE2E2'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--rd)'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ts)'; }}
                                  >×</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: '10px 14px', borderTop: '1px solid var(--bo)', flexShrink: 0 }}>
                      <button type="button" onClick={addRow} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: '1.5px dashed var(--bo)', borderRadius: '8px', padding: '7px 16px', cursor: 'pointer', fontSize: '13px', color: 'var(--ts)', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ac)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ac)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--bo)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ts)'; }}
                      >
                        + Agregar ingrediente
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Summary + Save ──────────────────────────────────────────────── */}
          <div style={{ marginTop: '14px', background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', padding: '16px 22px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '24px', flex: 1, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Ingredientes</p>
                <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: rowsValidos.length > 0 ? 'var(--tx)' : 'var(--ts)', margin: 0, lineHeight: 1.1 }}>
                  {rowsValidos.length}<span style={{ fontSize: '13px', color: 'var(--ts)', fontWeight: 400, marginLeft: '3px' }}>/{rows.length} total</span>
                </p>
              </div>

              {costoTotal > 0 && (
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Costo total</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: 'var(--ac)', margin: 0, lineHeight: 1.1 }}>
                    {formatCLP(costoTotal)}
                  </p>
                </div>
              )}

              {costoPorPlato && (
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Costo / plato</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: 'var(--tl)', margin: 0, lineHeight: 1.1 }}>
                    {formatCLP(costoPorPlato)}
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {warnings > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '8px', padding: '5px 11px' }}>
                    <span style={{ fontSize: '13px' }}>⚠</span>
                    <span style={{ fontSize: '12px', color: '#92400E', fontWeight: 600 }}>{warnings} ingrediente{warnings !== 1 ? 's' : ''} sin costo</span>
                  </div>
                )}
                {!responsableId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '5px 11px' }}>
                    <span style={{ fontSize: '13px' }}>⚠</span>
                    <span style={{ fontSize: '12px', color: '#991B1B', fontWeight: 600 }}>Falta responsable</span>
                  </div>
                )}
              </div>
            </div>

            <button type="submit" disabled={guardando} style={{
              background: guardando ? 'var(--ts)' : canSave ? 'var(--ac)' : 'var(--bo)',
              color: canSave || guardando ? '#fff' : 'var(--ts)',
              border: 'none', borderRadius: '10px', padding: '12px 28px',
              fontSize: '14px', fontWeight: 700,
              cursor: guardando ? 'wait' : canSave ? 'pointer' : 'not-allowed',
              fontFamily: 'DM Sans, sans-serif',
              display: 'flex', alignItems: 'center', gap: '8px',
              transition: 'all 0.2s', flexShrink: 0, minWidth: '200px', justifyContent: 'center',
            }}>
              {guardando ? (
                <>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Guardando...
                </>
              ) : 'Guardar colación →'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
