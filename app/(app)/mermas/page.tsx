'use client';

import { useState, useEffect, useRef } from 'react';
import { formatCLP } from '@/lib/calculos';
import { useRol } from '@/components/RolProvider';
import type { Responsable, Producto, MotivoMerma } from '@/types/database';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CartaPlato {
  id: string;
  nombre: string;
  categoria: string | null;
  ingredientes_count: number;
  costo_neto?: number;
}

interface Maestros { responsables: Responsable[]; productos: Producto[]; carta: CartaPlato[]; }

interface MermaRow {
  key:             number;
  codigo_producto: string;
  nombre_producto: string;
  cantidad:        string;
  unidad_medida:   string;
  motivo:          MotivoMerma | '';
  costo_unitario:  number;
}

interface PlatoRow {
  key:            number;
  carta_id:       string;
  nombre_plato:   string;
  categoria:      string | null;
  cantidad:       string;
  motivo:         MotivoMerma | '';
  observacion:    string;
  costo_unitario: number;
  ingredientes:   number;
}

type RowStatus = 'ok' | 'pendiente' | 'sin-motivo' | 'sin-costo';

// ─── Utility ────────────────────────────────────────────────────────────────

let _seq = 0;
const newKey = () => ++_seq;
const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

function calcCostoFila(row: MermaRow): number {
  const cant = parseFloat(row.cantidad) || 0;
  if (!cant || !row.costo_unitario) return 0;
  return Math.round(cant * row.costo_unitario);
}

function calcCostoPlato(row: PlatoRow): number {
  const cant = parseFloat(row.cantidad) || 0;
  if (!cant || !row.costo_unitario) return 0;
  return Math.round(cant * row.costo_unitario);
}

function getRowStatus(row: MermaRow): RowStatus {
  if (!row.codigo_producto || !row.cantidad || parseFloat(row.cantidad) === 0) return 'pendiente';
  if (!row.motivo) return 'sin-motivo';
  if (row.costo_unitario === 0) return 'sin-costo';
  return 'ok';
}

function getPlatoStatus(row: PlatoRow): RowStatus {
  if (!row.carta_id || !row.cantidad || parseFloat(row.cantidad) === 0) return 'pendiente';
  if (!row.motivo) return 'sin-motivo';
  if (row.costo_unitario === 0) return 'sin-costo';
  return 'ok';
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MOTIVOS: MotivoMerma[] = [
  'Vencimiento', 'Mala manipulación', 'Sobreproducción',
  'Devolución', 'Corte / limpieza', 'Error de producción', 'Otro',
];

const STATUS_CFG: Record<RowStatus, { label: string; color: string; bg: string }> = {
  ok:          { label: 'OK',           color: '#065F46', bg: '#D1FAE5' },
  pendiente:   { label: 'Incompleto',   color: '#92400E', bg: '#FEF3C7' },
  'sin-motivo':{ label: 'Sin motivo',   color: '#5B21B6', bg: '#EDE9FE' },
  'sin-costo': { label: 'Sin costo',    color: '#991B1B', bg: '#FEE2E2' },
};

const MOTIVO_COLOR: Record<string, string> = {
  'Vencimiento':        '#DC2626',
  'Mala manipulación':  '#D97706',
  'Sobreproducción':    '#6366F1',
  'Devolución':         '#0EA5E9',
  'Corte / limpieza':   '#0D9373',
  'Error de producción':'#7C3AED',
  'Otro':               '#6B7280',
};

const UM_COLOR: Record<string, string> = {
  KG: '#0D9373', GR: '#6366F1', LT: '#0EA5E9',
  UN: '#D97706', CC: '#8B5CF6', PR: '#64748B',
};

const MOTIVOS_PLATO: MotivoMerma[] = [
  'Devolución', 'Caida', 'Pelo / contaminacion', 'Mal preparado', 'Cliente no recibe', 'Otro',
];

const MOTIVO_PLATO_COLOR: Record<string, string> = {
  'Devolución': '#0EA5E9',
  'Caida': '#B45309',
  'Pelo / contaminacion': '#BE123C',
  'Mal preparado': '#9333EA',
  'Cliente no recibe': '#0284C7',
  'Otro': '#6B7280',
};

// ─── StatusBadge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: RowStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px', background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
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
    ? productos.filter(p => p.nombre.toLowerCase().includes(query.toLowerCase()) || p.codigo.includes(query))
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
        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', flexShrink: 0, background: `${color}18`, color, border: `1px solid ${color}40`, whiteSpace: 'nowrap' }}>
          {selectedUM}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedNombre}</span>
        <button type="button" onClick={onClear} title="Quitar producto"
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
        width: '100%', textAlign: 'left', background: open ? 'var(--al)' : 'var(--bg)',
        border: `1.5px solid ${open ? 'var(--ac)' : 'var(--bo)'}`, borderRadius: '8px',
        padding: '6px 10px', fontSize: '12px', color: 'var(--ts)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
        fontFamily: 'DM Sans, sans-serif', transition: 'border-color 0.15s, background 0.15s',
      }}>
        <span>Seleccionar producto...</span>
        <span style={{ fontSize: '9px', display: 'inline-block', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 500, width: 'max(100%, 280px)', background: 'var(--sf)', border: '1.5px solid var(--ac)', borderRadius: '12px', boxShadow: '0 16px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 8px 0' }}>
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
              placeholder={`Buscar en ${productos.length} productos...`}
              style={{ width: '100%', border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: 'var(--bg)', color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
            />
          </div>
          <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '4px 0 6px' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Sin coincidencias</div>
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

function PlatoSelector({ platos, selectedId, selectedNombre, selectedCategoria, onSelect, onClear }: {
  platos: CartaPlato[]; selectedId: string; selectedNombre: string; selectedCategoria: string | null;
  onSelect: (p: CartaPlato) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? platos.filter(p => p.nombre.toLowerCase().includes(query.toLowerCase()) || (p.categoria ?? '').toLowerCase().includes(query.toLowerCase()))
    : platos;

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

  if (selectedId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', flexShrink: 0, background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE', whiteSpace: 'nowrap' }}>
          {selectedCategoria ?? 'PLATO'}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedNombre}</span>
        <button type="button" onClick={onClear} title="Quitar plato"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '16px', lineHeight: 1, flexShrink: 0, padding: '2px 4px', borderRadius: '4px' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--rd)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ts)')}
        >x</button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{
        width: '100%', textAlign: 'left', background: open ? 'var(--al)' : 'var(--bg)',
        border: `1.5px solid ${open ? 'var(--ac)' : 'var(--bo)'}`, borderRadius: '8px',
        padding: '6px 10px', fontSize: '12px', color: 'var(--ts)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
        fontFamily: 'DM Sans, sans-serif', transition: 'border-color 0.15s, background 0.15s',
      }}>
        <span>Seleccionar plato...</span>
        <span style={{ fontSize: '9px', display: 'inline-block', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}>v</span>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 500, width: 'max(100%, 320px)', background: 'var(--sf)', border: '1.5px solid var(--ac)', borderRadius: '12px', boxShadow: '0 16px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 8px 0' }}>
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
              placeholder={`Buscar en ${platos.length} platos...`}
              style={{ width: '100%', border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: 'var(--bg)', color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
            />
          </div>
          <div style={{ maxHeight: '260px', overflowY: 'auto', padding: '4px 0 6px' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>Sin coincidencias</div>
            ) : filtered.map(p => (
              <button key={p.id} type="button"
                onClick={() => { onSelect(p); setOpen(false); setQuery(''); }}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'DM Sans, sans-serif' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--al)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE', flexShrink: 0, maxWidth: '92px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.categoria ?? 'PLATO'}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--tx)', flex: 1 }}>{p.nombre}</span>
                <span style={{ fontSize: '11px', color: 'var(--ts)', flexShrink: 0 }}>{p.ingredientes_count} ing.</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAdd, onAddPlato }: { onAdd: () => void; onAddPlato: () => void }) {
  return (
    <div style={{ padding: '52px 32px', textAlign: 'center' }}>
      <div style={{ fontSize: '44px', marginBottom: '14px', opacity: 0.35, lineHeight: 1 }}>🗑️</div>
      <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--tx)', margin: '0 0 6px', fontFamily: 'Syne, sans-serif' }}>
        Sin productos registrados
      </p>
      <p style={{ fontSize: '13px', color: 'var(--ts)', margin: '0 0 22px', lineHeight: 1.5 }}>
        Agrega los productos perdidos o dañados<br />que se detectaron en este turno
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onAdd} style={{ background: 'var(--rd)', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
          + Producto
        </button>
        <button type="button" onClick={onAddPlato} style={{ background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
          + Plato
        </button>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MermasPage() {
  const { rol } = useRol();
  const verCostos = rol !== 'cocina';

  const [maestros,      setMaestros]      = useState<Maestros | null>(null);
  const [cargando,      setCargando]      = useState(true);
  const [fecha,         setFecha]         = useState(hoyChile());
  const [responsableId, setResponsableId] = useState('');
  const [observacion,   setObservacion]   = useState('');
  const [rows,          setRows]          = useState<MermaRow[]>([]);
  const [platoRows,     setPlatoRows]     = useState<PlatoRow[]>([]);
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
    setRows(r => [...r, { key: newKey(), codigo_producto: '', nombre_producto: '', cantidad: '', unidad_medida: '', motivo: '', costo_unitario: 0 }]);
  }

  function addPlatoRow() {
    setPlatoRows(r => [...r, { key: newKey(), carta_id: '', nombre_plato: '', categoria: null, cantidad: '', motivo: '', observacion: '', costo_unitario: 0, ingredientes: 0 }]);
  }

  function selectProducto(key: number, p: Producto) {
    setRows(rows => rows.map(r => r.key !== key ? r : { ...r, codigo_producto: p.codigo, nombre_producto: p.nombre, unidad_medida: p.unidad_medida, costo_unitario: p.costo_promedio }));
  }

  function clearProducto(key: number) {
    setRows(rows => rows.map(r => r.key !== key ? r : { ...r, codigo_producto: '', nombre_producto: '', cantidad: '', unidad_medida: '', costo_unitario: 0 }));
  }

  function removeRow(key: number) { setRows(r => r.filter(x => x.key !== key)); }

  function selectPlato(key: number, p: CartaPlato) {
    setPlatoRows(rows => rows.map(r => r.key !== key ? r : {
      ...r,
      carta_id: p.id,
      nombre_plato: p.nombre,
      categoria: p.categoria,
      costo_unitario: p.costo_neto ?? 0,
      ingredientes: p.ingredientes_count,
    }));
  }

  function clearPlato(key: number) {
    setPlatoRows(rows => rows.map(r => r.key !== key ? r : { ...r, carta_id: '', nombre_plato: '', categoria: null, cantidad: '', costo_unitario: 0, ingredientes: 0 }));
  }

  function removePlatoRow(key: number) { setPlatoRows(r => r.filter(x => x.key !== key)); }

  function updateRow(key: number, field: 'cantidad' | 'motivo', value: string) {
    setRows(rows => rows.map(r => r.key !== key ? r : { ...r, [field]: value }));
  }

  function updatePlatoRow(key: number, field: 'cantidad' | 'motivo' | 'observacion', value: string) {
    setPlatoRows(rows => rows.map(r => r.key !== key ? r : { ...r, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setOk('');
    if (!responsableId)      { setErr('Selecciona un responsable antes de guardar.'); return; }
    if (!observacion.trim()) { setErr('La observación es obligatoria.'); return; }

    const detalle = rows
      .filter(r => r.codigo_producto && parseFloat(r.cantidad) > 0)
      .map(r => ({
        codigo_producto: r.codigo_producto,
        nombre_producto: r.nombre_producto,
        cantidad:        parseFloat(r.cantidad),
        unidad_medida:   r.unidad_medida,
        motivo:          r.motivo || null,
        costo_unitario:  r.costo_unitario,
        costo_total:     calcCostoFila(r),
      }));

    const platos = platoRows
      .filter(r => r.carta_id && parseFloat(r.cantidad) > 0)
      .map(r => ({
        carta_id: r.carta_id,
        nombre_plato: r.nombre_plato,
        cantidad: parseFloat(r.cantidad),
        motivo: r.motivo || null,
        observacion: r.observacion.trim() || null,
      }));

    if (!detalle.length && !platos.length) { setErr('Agrega al menos un producto o plato con cantidad valida.'); return; }

    const responsable = maestros?.responsables.find(r => r.id === responsableId);
    setGuardando(true);
    try {
      const res = await fetch('/api/mermas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, responsable_id: responsableId, responsable_nombre: responsable?.nombre ?? '', observacion: observacion.trim(), detalle, platos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      const totalCosto = detalle.reduce((s, d) => s + d.costo_total, 0) + platoRows.reduce((s, p) => s + calcCostoPlato(p), 0);
      const totalLineas = detalle.length + platos.length;
      setOk(`Merma registrada - ${totalLineas} linea${totalLineas !== 1 ? 's' : ''}${verCostos && totalCosto > 0 ? ` · ${formatCLP(totalCosto)} perdida estimada` : ''}.`);
      setFecha(hoyChile()); setResponsableId(''); setObservacion(''); setRows([]); setPlatoRows([]);
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
  const platosValidos = platoRows.filter(r => r.carta_id && parseFloat(r.cantidad) > 0);
  const costoTotal   = rows.reduce((s, r) => s + calcCostoFila(r), 0) + platoRows.reduce((s, r) => s + calcCostoPlato(r), 0);
  const sinMotivo    = rows.filter(r => r.codigo_producto && !r.motivo).length + platoRows.filter(r => r.carta_id && !r.motivo).length;
  const sinCosto     = rows.filter(r => getRowStatus(r) === 'sin-costo').length + platoRows.filter(r => getPlatoStatus(r) === 'sin-costo').length;
  const totalLineasValidas = rowsValidos.length + platosValidos.length;
  const totalLineas = rows.length + platoRows.length;
  const canSave      = !!responsableId && !!observacion.trim() && totalLineasValidas > 0;

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
        <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid var(--bo)', borderTopColor: 'var(--rd)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <p style={{ color: 'var(--ts)', fontSize: '14px', marginTop: '16px' }}>Cargando datos...</p>
      </div>
    </>
  );

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1023px) { .mer-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <div className="page" style={{ paddingBottom: '48px' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 3px' }}>Mermas</h1>
            <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>
              Registro de pérdidas y desperdicios
              {respActual && <> · <strong style={{ color: 'var(--tx)' }}>{respActual.nombre}</strong></>}
            </p>
          </div>
          {verCostos && costoTotal > 0 && (
            <span style={{ fontSize: '13px', fontWeight: 700, background: '#FEE2E2', border: '1px solid #FECACA', padding: '5px 14px', borderRadius: '20px', color: '#991B1B' }}>
              {formatCLP(costoTotal)} pérdida estimada
            </span>
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
          <div className="mer-grid" style={{ display: 'grid', gridTemplateColumns: '310px 1fr', gap: '14px', alignItems: 'start' }}>

            {/* ── Left card ───────────────────────────────────────────────── */}
            <div style={{ background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontFamily: 'Syne, sans-serif', fontSize: '12px', fontWeight: 800, color: 'var(--ts)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Datos del registro
              </p>

              <div>
                <label style={lbl}>Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                />
              </div>

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

              <div>
                <label style={lbl}>Observación <span style={{ color: 'var(--rd)' }}>*</span></label>
                <textarea value={observacion} onChange={e => setObservacion(e.target.value)}
                  placeholder="Describe qué ocurrió, dónde se detectó la merma, cuándo fue notada..."
                  rows={6}
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                />
              </div>
            </div>

            {/* ── Right card ──────────────────────────────────────────────── */}
            <div style={{ background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '420px' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Productos perdidos</span>
                {totalLineas > 0 && (
                  <span style={{ background: '#DC2626', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>{totalLineas}</span>
                )}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {totalLineas === 0 ? (
                  <EmptyState onAdd={addRow} onAddPlato={addPlatoRow} />
                ) : (
                  <>
                    <div style={{ overflowX: 'auto', flex: 1 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg)' }}>
                            {['Producto', 'Cantidad', 'Motivo', ...(verCostos ? ['Costo pérdida'] : []), 'Estado', ''].map((h, i) => (
                              <th key={i} style={{ padding: '10px 12px', textAlign: i === 5 ? 'center' : 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(row => {
                            const status = getRowStatus(row);
                            const costo  = calcCostoFila(row);
                            const motivoColor = row.motivo ? (MOTIVO_COLOR[row.motivo] || '#6B7280') : null;
                            return (
                              <tr key={row.key} style={{ borderBottom: '1px solid var(--bo)' }}>
                                <td style={{ padding: '9px 12px', minWidth: '210px' }}>
                                  <ProductoSelector
                                    productos={maestros?.productos ?? []}
                                    selectedCodigo={row.codigo_producto}
                                    selectedNombre={row.nombre_producto}
                                    selectedUM={row.unidad_medida}
                                    onSelect={p => selectProducto(row.key, p)}
                                    onClear={() => clearProducto(row.key)}
                                  />
                                </td>
                                <td style={{ padding: '9px 8px', width: '130px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <input type="number" min="0" step="any" value={row.cantidad}
                                      onChange={e => updateRow(row.key, 'cantidad', e.target.value)}
                                      placeholder="0"
                                      style={{ ...thinInp, width: '68px' }}
                                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                                    />
                                    {row.unidad_medida && (
                                      <span style={{ fontSize: '10px', color: 'var(--ts)', whiteSpace: 'nowrap' }}>{row.unidad_medida === 'KG' ? 'g' : row.unidad_medida.toLowerCase()}</span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: '9px 8px', minWidth: '160px' }}>
                                  {row.motivo && motivoColor ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: `${motivoColor}18`, color: motivoColor, border: `1px solid ${motivoColor}40`, whiteSpace: 'nowrap' }}>
                                        {row.motivo}
                                      </span>
                                      <button type="button" onClick={() => updateRow(row.key, 'motivo', '')}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '14px', lineHeight: 1, padding: '2px' }}
                                      >×</button>
                                    </div>
                                  ) : (
                                    <select value={row.motivo} onChange={e => updateRow(row.key, 'motivo', e.target.value)}
                                      style={{ ...thinInp, width: '100%', color: row.motivo ? 'var(--tx)' : 'var(--ts)', fontSize: '12px' }}
                                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                                    >
                                      <option value="">Seleccionar motivo...</option>
                                      {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                  )}
                                </td>
                                {verCostos && (
                                  <td style={{ padding: '9px 12px', fontSize: '13px', whiteSpace: 'nowrap', fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: costo > 0 ? '#DC2626' : 'var(--ts)', fontWeight: costo > 0 ? 600 : 400 }}>
                                    {costo > 0 ? formatCLP(costo) : '—'}
                                  </td>
                                )}
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
                    {platoRows.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--bo)', overflowX: 'auto' }}>
                        <div style={{ padding: '10px 12px', background: '#EFF6FF', borderBottom: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Platos preparados</span>
                          <span style={{ fontSize: '11px', color: '#1D4ED8', fontWeight: 700 }}>{platoRows.length}</span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
                          <thead>
                            <tr style={{ background: 'var(--bg)' }}>
                              {['Plato', 'Cantidad', 'Motivo', 'Obs.', ...(verCostos ? ['Costo perdida'] : []), 'Estado', ''].map((h, i) => (
                                <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {platoRows.map(row => {
                              const status = getPlatoStatus(row);
                              const costo = calcCostoPlato(row);
                              const motivoColor = row.motivo ? (MOTIVO_PLATO_COLOR[row.motivo] || '#6B7280') : null;
                              return (
                                <tr key={row.key} style={{ borderBottom: '1px solid var(--bo)' }}>
                                  <td style={{ padding: '9px 12px', minWidth: '240px' }}>
                                    <PlatoSelector
                                      platos={maestros?.carta ?? []}
                                      selectedId={row.carta_id}
                                      selectedNombre={row.nombre_plato}
                                      selectedCategoria={row.categoria}
                                      onSelect={p => selectPlato(row.key, p)}
                                      onClear={() => clearPlato(row.key)}
                                    />
                                  </td>
                                  <td style={{ padding: '9px 8px', width: '120px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <input type="number" min="0" step="1" value={row.cantidad}
                                        onChange={e => updatePlatoRow(row.key, 'cantidad', e.target.value)}
                                        placeholder="0"
                                        style={{ ...thinInp, width: '68px' }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                                      />
                                      <span style={{ fontSize: '10px', color: 'var(--ts)', whiteSpace: 'nowrap' }}>un</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '9px 8px', minWidth: '170px' }}>
                                    {row.motivo && motivoColor ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: `${motivoColor}18`, color: motivoColor, border: `1px solid ${motivoColor}40`, whiteSpace: 'nowrap' }}>
                                          {row.motivo}
                                        </span>
                                        <button type="button" onClick={() => updatePlatoRow(row.key, 'motivo', '')}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '14px', lineHeight: 1, padding: '2px' }}
                                        >x</button>
                                      </div>
                                    ) : (
                                      <select value={row.motivo} onChange={e => updatePlatoRow(row.key, 'motivo', e.target.value)}
                                        style={{ ...thinInp, width: '100%', color: row.motivo ? 'var(--tx)' : 'var(--ts)', fontSize: '12px' }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                                      >
                                        <option value="">Seleccionar motivo...</option>
                                        {MOTIVOS_PLATO.map(m => <option key={m} value={m}>{m}</option>)}
                                      </select>
                                    )}
                                  </td>
                                  <td style={{ padding: '9px 8px', minWidth: '160px' }}>
                                    <input value={row.observacion}
                                      onChange={e => updatePlatoRow(row.key, 'observacion', e.target.value)}
                                      placeholder="Opcional"
                                      style={{ ...thinInp, width: '100%' }}
                                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                                    />
                                  </td>
                                  {verCostos && (
                                    <td style={{ padding: '9px 12px', fontSize: '13px', whiteSpace: 'nowrap', fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: costo > 0 ? '#DC2626' : 'var(--ts)', fontWeight: costo > 0 ? 600 : 400 }}>
                                      {costo > 0 ? formatCLP(costo) : '—'}
                                    </td>
                                  )}
                                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                    <StatusBadge status={status} />
                                  </td>
                                  <td style={{ padding: '9px 8px', textAlign: 'center', width: '44px' }}>
                                    <button type="button" onClick={() => removePlatoRow(row.key)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '18px', lineHeight: 1, padding: '4px 6px', borderRadius: '6px' }}
                                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEE2E2'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--rd)'; }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ts)'; }}
                                    >x</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div style={{ padding: '10px 14px', borderTop: '1px solid var(--bo)', flexShrink: 0, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button type="button" onClick={addRow} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: '1.5px dashed var(--bo)', borderRadius: '8px', padding: '7px 16px', cursor: 'pointer', fontSize: '13px', color: 'var(--ts)', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--rd)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--rd)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--bo)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ts)'; }}
                      >
                        + Agregar producto
                      </button>
                      <button type="button" onClick={addPlatoRow} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: '1.5px dashed #BFDBFE', borderRadius: '8px', padding: '7px 16px', cursor: 'pointer', fontSize: '13px', color: '#1D4ED8', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1D4ED8'; (e.currentTarget as HTMLButtonElement).style.background = '#EFF6FF'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#BFDBFE'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                      >
                        + Agregar plato
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
                <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Productos</p>
                <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: rowsValidos.length > 0 ? 'var(--tx)' : 'var(--ts)', margin: 0, lineHeight: 1.1 }}>
                  {totalLineasValidas}<span style={{ fontSize: '13px', color: 'var(--ts)', fontWeight: 400, marginLeft: '3px' }}>/{totalLineas} total</span>
                </p>
              </div>

              {verCostos && costoTotal > 0 && (
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Pérdida estimada</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: '#DC2626', margin: 0, lineHeight: 1.1 }}>
                    {formatCLP(costoTotal)}
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {sinMotivo > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: '8px', padding: '5px 11px' }}>
                    <span style={{ fontSize: '13px' }}>⚠</span>
                    <span style={{ fontSize: '12px', color: '#5B21B6', fontWeight: 600 }}>{sinMotivo} sin motivo</span>
                  </div>
                )}
                {verCostos && sinCosto > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '8px', padding: '5px 11px' }}>
                    <span style={{ fontSize: '13px' }}>⚠</span>
                    <span style={{ fontSize: '12px', color: '#92400E', fontWeight: 600 }}>{sinCosto} sin costo</span>
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
              background: guardando ? 'var(--ts)' : canSave ? '#DC2626' : 'var(--bo)',
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
              ) : 'Registrar merma →'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
