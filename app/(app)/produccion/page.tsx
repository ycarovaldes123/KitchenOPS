'use client';

import { useState, useEffect, useRef } from 'react';
import { calcTotalPP, calcMerma, formatCLP, formatPct } from '@/lib/calculos';
import type { PP, Responsable, Verdura, Producto, TipoPP } from '@/types/database';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Maestros { pps: PP[]; responsables: Responsable[]; verduras: Verdura[]; productos: Producto[]; }

interface PPRow {
  key:             number;
  pp_id:           string;
  nombre_pp:       string;
  tipo_pp:         string;
  cantidad:        string;
  gramos_por_pp:   number | null;
  codigo_producto: string | null;
  costo_unitario:  number;
  _unidad_medida:  string;
}

interface RendRow {
  key:            number;
  verdura:        string;
  kg_utilizados:  string;
  rendimiento_kg: string;
}

type RowStatus = 'ok' | 'pendiente' | 'sin-costo' | 'sin-equiv';

// ─── Utility ────────────────────────────────────────────────────────────────

let _seq = 0;
const newKey = () => ++_seq;
const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

function totalLabel(row: PPRow): string {
  const cant = parseFloat(row.cantidad) || 0;
  if (!cant || !row.pp_id) return '—';
  const total = calcTotalPP(cant, { tipo_pp: row.tipo_pp as TipoPP, gramos_por_pp: row.gramos_por_pp });
  if (row.tipo_pp === 'CC' || row.tipo_pp === 'DIRECTO') return `${total} ${row._unidad_medida || 'un'}`;
  return total >= 1000 ? `${(total / 1000).toFixed(2)} kg` : `${total} g`;
}

function calcCostoFila(row: PPRow): number {
  const cant = parseFloat(row.cantidad) || 0;
  if (!cant || !row.pp_id || !row.costo_unitario) return 0;
  const total = calcTotalPP(cant, { tipo_pp: row.tipo_pp as TipoPP, gramos_por_pp: row.gramos_por_pp });
  const um = row._unidad_medida;
  // DIRECTO: user enters in KG directly, total = cant in KG, no gram conversion
  if (row.tipo_pp === 'DIRECTO') return Math.round(total * row.costo_unitario);
  // PORCION/UND/CC con producto KG o LT: total en gramos/cc → convertir a kg/L
  if (um === 'KG' || um === 'LT') return Math.round((total / 1000) * row.costo_unitario);
  // Producto en GR: total ya en gramos
  if (um === 'GR') return Math.round(total * row.costo_unitario);
  // UN, CC, PR: usar total (incluye gramos_por_pp para UND)
  return Math.round(total * row.costo_unitario);
}

function getRowStatus(row: PPRow): RowStatus {
  if (!row.pp_id || !row.cantidad || parseFloat(row.cantidad) === 0) return 'pendiente';
  if ((row.tipo_pp === 'PORCION' || row.tipo_pp === 'UND') && !row.gramos_por_pp) return 'sin-equiv';
  if (row.costo_unitario === 0) return 'sin-costo';
  return 'ok';
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TIPO_COLOR: Record<string, string> = {
  PORCION: 'var(--ac)', UND: '#6366F1', CC: '#0EA5E9', DIRECTO: '#D97706',
};

const STATUS_CFG: Record<RowStatus, { label: string; color: string; bg: string }> = {
  ok:          { label: 'OK',         color: '#065F46', bg: '#D1FAE5' },
  pendiente:   { label: 'Incompleto', color: '#92400E', bg: '#FEF3C7' },
  'sin-costo': { label: 'Sin costo',  color: '#991B1B', bg: '#FEE2E2' },
  'sin-equiv': { label: 'Sin equiv.', color: '#5B21B6', bg: '#EDE9FE' },
};

const UNIT_LABEL: Record<string, string> = {
  PORCION: 'porc.', CC: 'cc', UND: 'und.', DIRECTO: 'kg',
};

// ─── StatusBadge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: RowStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '20px',
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px',
      background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  );
}

// ─── PPSelector ─────────────────────────────────────────────────────────────

function PPSelector({ pps, selectedId, selectedName, tipoPP, onSelect, onClear }: {
  pps: PP[]; selectedId: string; selectedName: string; tipoPP: string;
  onSelect: (pp: PP) => void; onClear: () => void;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const ref      = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? pps.filter(p => p.nombre.toLowerCase().includes(query.toLowerCase()))
    : pps;

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
    const color = TIPO_COLOR[tipoPP] || '#6B7280';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span style={{
          fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', flexShrink: 0,
          background: `${color}18`, color, border: `1px solid ${color}40`,
          whiteSpace: 'nowrap',
        }}>{tipoPP}</span>
        <span style={{ fontSize: '13px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedName}
        </span>
        <button type="button" onClick={onClear} title="Quitar PP"
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
        <span>Seleccionar PP...</span>
        <span style={{ fontSize: '9px', transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
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
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Buscar en ${pps.length} PPs...`}
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
                {pps.length === 0 ? 'Sin PPs configurados. Ve a Maestros.' : 'Sin coincidencias'}
              </div>
            ) : filtered.map(pp => {
              const color = TIPO_COLOR[pp.tipo_pp] || '#6B7280';
              return (
                <button key={pp.id} type="button"
                  onClick={() => { onSelect(pp); setOpen(false); setQuery(''); }}
                  style={{
                    width: '100%', textAlign: 'left', background: 'none', border: 'none',
                    padding: '8px 12px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'DM Sans, sans-serif',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--al)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{
                    fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
                    background: `${color}18`, color, border: `1px solid ${color}40`,
                    flexShrink: 0, minWidth: '50px', textAlign: 'center', whiteSpace: 'nowrap',
                  }}>{pp.tipo_pp}</span>
                  <span style={{ fontSize: '13px', color: 'var(--tx)', flex: 1 }}>{pp.nombre}</span>
                  {pp.gramos_por_pp && (
                    <span style={{ fontSize: '11px', color: 'var(--ts)', flexShrink: 0 }}>
                      {pp.gramos_por_pp} {pp.tipo_pp === 'CC' ? 'cc' : 'g/pp'}
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

// ─── EmptyPP ────────────────────────────────────────────────────────────────

function EmptyPP({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ padding: '52px 32px', textAlign: 'center' }}>
      <div style={{ fontSize: '44px', marginBottom: '14px', opacity: 0.35, lineHeight: 1 }}>🍳</div>
      <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--tx)', margin: '0 0 6px', fontFamily: 'Syne, sans-serif' }}>
        Sin PPs en este turno
      </p>
      <p style={{ fontSize: '13px', color: 'var(--ts)', margin: '0 0 22px', lineHeight: 1.5 }}>
        Agrega los productos en proceso<br />elaborados durante el turno
      </p>
      <button type="button" onClick={onAdd} style={{
        background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: '10px',
        padding: '10px 22px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        + Agregar primer PP
      </button>
    </div>
  );
}

// ─── EmptyRend ───────────────────────────────────────────────────────────────

function EmptyRend({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ padding: '52px 32px', textAlign: 'center' }}>
      <div style={{ fontSize: '44px', marginBottom: '14px', opacity: 0.35, lineHeight: 1 }}>🥕</div>
      <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--tx)', margin: '0 0 6px', fontFamily: 'Syne, sans-serif' }}>
        Sin registros de rendimiento
      </p>
      <p style={{ fontSize: '13px', color: 'var(--ts)', margin: '0 0 22px', lineHeight: 1.5 }}>
        Registra el rendimiento de verduras<br />y materias primas procesadas
      </p>
      <button type="button" onClick={onAdd} style={{
        background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: '10px',
        padding: '10px 22px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        + Registrar rendimiento
      </button>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProduccionPage() {
  const [maestros,      setMaestros]      = useState<Maestros | null>(null);
  const [cargando,      setCargando]      = useState(true);
  const [fecha,         setFecha]         = useState(hoyChile());
  const [responsableId, setResponsableId] = useState('');
  const [turno,         setTurno]         = useState<'AM' | 'PM'>('AM');
  const [observacion,   setObservacion]   = useState('');
  const [ppRows,        setPPRows]        = useState<PPRow[]>([]);
  const [rendRows,      setRendRows]      = useState<RendRow[]>([]);
  const [tab,           setTab]           = useState<'pp' | 'rendimiento'>('pp');
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

  // ── PP handlers ───────────────────────────────────────────────────────────

  function addPPRow() {
    setPPRows(rows => [...rows, {
      key: newKey(), pp_id: '', nombre_pp: '', tipo_pp: 'PORCION',
      cantidad: '', gramos_por_pp: null, codigo_producto: null,
      costo_unitario: 0, _unidad_medida: '',
    }]);
    setTab('pp');
  }

  function selectPP(key: number, pp: PP) {
    const prod = maestros?.productos.find(p => p.codigo === pp.codigo_producto);
    setPPRows(rows => rows.map(r => r.key !== key ? r : {
      ...r, pp_id: pp.id, nombre_pp: pp.nombre, tipo_pp: pp.tipo_pp,
      gramos_por_pp: pp.gramos_por_pp, codigo_producto: pp.codigo_producto,
      costo_unitario: prod?.costo_promedio ?? 0, _unidad_medida: prod?.unidad_medida ?? '',
    }));
  }

  function clearPP(key: number) {
    setPPRows(rows => rows.map(r => r.key !== key ? r : {
      ...r, pp_id: '', nombre_pp: '', tipo_pp: 'PORCION',
      cantidad: '', gramos_por_pp: null, codigo_producto: null,
      costo_unitario: 0, _unidad_medida: '',
    }));
  }

  function removePPRow(key: number)              { setPPRows(rows => rows.filter(r => r.key !== key)); }
  function updateCantidad(key: number, v: string) { setPPRows(rows => rows.map(r => r.key !== key ? r : { ...r, cantidad: v })); }

  // ── Rendimiento handlers ──────────────────────────────────────────────────

  function addRendRow() {
    setRendRows(rows => [...rows, { key: newKey(), verdura: '', kg_utilizados: '', rendimiento_kg: '' }]);
    setTab('rendimiento');
  }

  function removeRendRow(key: number) { setRendRows(rows => rows.filter(r => r.key !== key)); }

  function updateRend(key: number, field: 'verdura' | 'kg_utilizados' | 'rendimiento_kg', value: string) {
    setRendRows(rows => rows.map(r => r.key !== key ? r : { ...r, [field]: value }));
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setOk('');
    if (!responsableId)      { setErr('Selecciona un responsable antes de guardar.'); return; }
    if (!observacion.trim()) { setErr('La observación del turno es obligatoria.'); return; }

    const detalle = ppRows
      .filter(r => r.pp_id && parseFloat(r.cantidad) > 0)
      .map(r => {
        const cant  = parseFloat(r.cantidad);
        const total = calcTotalPP(cant, { tipo_pp: r.tipo_pp as TipoPP, gramos_por_pp: r.gramos_por_pp });
        return {
          pp_id: r.pp_id, nombre_pp: r.nombre_pp, tipo_pp: r.tipo_pp,
          cantidad: cant, gramos_por_pp: r.gramos_por_pp, total_producido: total,
          codigo_producto: r.codigo_producto, costo_unitario: r.costo_unitario,
          costo_total: calcCostoFila(r),
        };
      });

    if (!detalle.length) { setErr('Ingresa al menos un PP con cantidad válida.'); return; }

    const responsable = maestros?.responsables.find(r => r.id === responsableId);
    const rendimiento = rendRows
      .filter(r => r.verdura && parseFloat(r.kg_utilizados) > 0 && parseFloat(r.rendimiento_kg) > 0)
      .map(r => ({
        fecha, verdura: r.verdura,
        kg_utilizados: parseFloat(r.kg_utilizados),
        rendimiento_kg: parseFloat(r.rendimiento_kg),
        responsable_nombre: responsable?.nombre ?? '',
      }));

    setGuardando(true);
    try {
      const res = await fetch('/api/produccion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha, responsable_id: responsableId,
          responsable_nombre: responsable?.nombre ?? '',
          turno, observacion: observacion.trim(), detalle, rendimiento,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');

      setOk(`Informe guardado — ${detalle.length} PP${detalle.length !== 1 ? 's' : ''}, turno ${turno}, responsable ${responsable?.nombre ?? ''}.`);
      setFecha(hoyChile()); setResponsableId(''); setObservacion('');
      setPPRows([]); setRendRows([]); setTab('pp');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setGuardando(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const respActual  = maestros?.responsables.find(r => r.id === responsableId);
  const ppValidos   = ppRows.filter(r => r.pp_id && parseFloat(r.cantidad) > 0);
  const costoTotal  = ppRows.reduce((s, r) => s + calcCostoFila(r), 0);
  const warnings    = ppRows.filter(r => { const s = getRowStatus(r); return s === 'sin-costo' || s === 'sin-equiv'; }).length;
  const rendCount   = rendRows.filter(r => r.verdura).length;
  const canSave     = !!responsableId && ppValidos.length > 0;

  // ── Shared styles ─────────────────────────────────────────────────────────

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

  // ── Loading ───────────────────────────────────────────────────────────────

  if (cargando) return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ padding: '80px 32px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid var(--bo)', borderTopColor: 'var(--ac)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <p style={{ color: 'var(--ts)', fontSize: '14px', marginTop: '16px' }}>Cargando datos del turno...</p>
      </div>
    </>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 800px) { .prod-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={{ padding: '20px 28px 48px', maxWidth: '1400px' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 3px' }}>Producción</h1>
            <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>
              Registro diario de productos en proceso
              {respActual && <> · <strong style={{ color: 'var(--tx)' }}>{respActual.nombre}</strong></>}
              {' · Turno '}
              <strong style={{ color: 'var(--ac)' }}>{turno}</strong>
            </p>
          </div>
          {ppRows.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', background: 'var(--sf)', border: '1px solid var(--bo)', padding: '4px 12px', borderRadius: '20px', color: 'var(--ts)' }}>
                {ppRows.length} PP
              </span>
              {costoTotal > 0 && (
                <span style={{ fontSize: '12px', fontWeight: 700, background: 'var(--al)', border: '1px solid var(--ac)', padding: '4px 12px', borderRadius: '20px', color: 'var(--ac)' }}>
                  {formatCLP(costoTotal)} est.
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
          <div className="prod-grid" style={{ display: 'grid', gridTemplateColumns: '310px 1fr', gap: '14px', alignItems: 'start' }}>

            {/* ── Left card: Datos del turno ───────────────────────────────── */}
            <div style={{ background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

              <p style={{ fontFamily: 'Syne, sans-serif', fontSize: '12px', fontWeight: 800, color: 'var(--ts)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Datos del turno
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
                <label style={lbl}>
                  Responsable <span style={{ color: 'var(--rd)' }}>*</span>
                </label>
                {respActual ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 12px', borderRadius: '9px',
                    border: '1.5px solid var(--tl)', background: '#ECFDF5',
                  }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                      background: respActual.color_hex ?? 'var(--ac)', color: '#fff',
                      fontSize: '11px', fontWeight: 700,
                    }}>{respActual.iniciales ?? respActual.nombre.slice(0, 2)}</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, flex: 1, color: '#065F46' }}>{respActual.nombre}</span>
                    <button type="button" onClick={() => setResponsableId('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6EE7B7', fontSize: '16px', padding: '2px' }}
                    >×</button>
                  </div>
                ) : (
                  <select value={responsableId} onChange={e => setResponsableId(e.target.value)}
                    style={{ ...inp, color: responsableId ? 'var(--tx)' : 'var(--ts)' }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                  >
                    <option value="">Seleccionar responsable...</option>
                    {maestros?.responsables.map(r => (
                      <option key={r.id} value={r.id}>{r.nombre}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Turno AM/PM */}
              <div>
                <label style={lbl}>Turno</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {(['AM', 'PM'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setTurno(t)} style={{
                      padding: '10px 0', borderRadius: '9px', cursor: 'pointer',
                      fontFamily: 'DM Sans, sans-serif', fontSize: '15px',
                      fontWeight: turno === t ? 700 : 500,
                      border: `2px solid ${turno === t ? 'var(--ac)' : 'var(--bo)'}`,
                      background: turno === t ? 'var(--al)' : 'var(--bg)',
                      color: turno === t ? 'var(--ac)' : 'var(--ts)',
                      transition: 'all 0.15s',
                    }}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Observación */}
              <div>
                <label style={lbl}>
                  Observación <span style={{ color: 'var(--rd)' }}>*</span>
                </label>
                <textarea
                  value={observacion}
                  onChange={e => setObservacion(e.target.value)}
                  placeholder="Describe el turno: novedades, incidencias, contexto..."
                  rows={5}
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                />
              </div>

              {/* Atajo rendimiento */}
              <div style={{ borderTop: '1px solid var(--bo)', paddingTop: '14px' }}>
                <p style={{ ...lbl, marginBottom: '8px' }}>Rendimiento verduras</p>
                <button type="button" onClick={addRendRow} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  background: 'none', border: '1.5px dashed var(--bo)', borderRadius: '8px',
                  padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--ts)',
                  fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ac)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ac)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--bo)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ts)'; }}
                >
                  + Agregar rendimiento
                  {rendCount > 0 && (
                    <span style={{ background: 'var(--ac)', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>
                      {rendCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* ── Right card: PP + Rendimiento ────────────────────────────── */}
            <div style={{ background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '480px' }}>

              {/* Tab bar */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--bo)', background: 'var(--bg)', flexShrink: 0 }}>
                {[
                  { id: 'pp' as const,          label: 'Producción PP',       count: ppRows.length },
                  { id: 'rendimiento' as const, label: 'Rendimiento verduras', count: rendCount },
                ].map(({ id, label, count }) => (
                  <button key={id} type="button" onClick={() => setTab(id)} style={{
                    padding: '13px 20px', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '13px', fontWeight: tab === id ? 700 : 400,
                    color: tab === id ? 'var(--tx)' : 'var(--ts)',
                    borderBottom: `2px solid ${tab === id ? 'var(--ac)' : 'transparent'}`,
                    marginBottom: '-1px', fontFamily: 'DM Sans, sans-serif',
                    display: 'flex', alignItems: 'center', gap: '6px', transition: 'color 0.15s',
                  }}>
                    {label}
                    {count > 0 && (
                      <span style={{
                        background: tab === id ? 'var(--ac)' : 'var(--bo)',
                        color: tab === id ? '#fff' : 'var(--ts)',
                        borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700,
                      }}>{count}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── Tab PP ────────────────────────────────────────────────── */}
              {tab === 'pp' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {ppRows.length === 0 ? (
                    <EmptyPP onAdd={addPPRow} />
                  ) : (
                    <>
                      <div style={{ overflowX: 'auto', flex: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
                          <thead>
                            <tr style={{ background: 'var(--bg)' }}>
                              {['Producto en proceso', 'Cant.', 'Total prod.', 'Costo est.', 'Estado', ''].map((h, i) => (
                                <th key={i} style={{
                                  padding: '10px 12px', textAlign: i === 5 ? 'center' : 'left',
                                  fontSize: '10px', fontWeight: 700, color: 'var(--ts)',
                                  textTransform: 'uppercase', letterSpacing: '0.5px',
                                  borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap',
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ppRows.map(row => {
                              const status = getRowStatus(row);
                              const costo  = calcCostoFila(row);
                              return (
                                <tr key={row.key} style={{ borderBottom: '1px solid var(--bo)' }}>
                                  {/* PP Selector */}
                                  <td style={{ padding: '9px 12px', minWidth: '220px' }}>
                                    <PPSelector
                                      pps={maestros?.pps ?? []}
                                      selectedId={row.pp_id}
                                      selectedName={row.nombre_pp}
                                      tipoPP={row.tipo_pp}
                                      onSelect={pp => selectPP(row.key, pp)}
                                      onClear={() => clearPP(row.key)}
                                    />
                                  </td>
                                  {/* Cantidad */}
                                  <td style={{ padding: '9px 8px', width: '120px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <input
                                        type="number" min="0" step="any" value={row.cantidad}
                                        onChange={e => updateCantidad(row.key, e.target.value)}
                                        placeholder="0"
                                        style={{ ...thinInp, width: '68px' }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                                      />
                                      {row.pp_id && (
                                        <span style={{ fontSize: '10px', color: 'var(--ts)', whiteSpace: 'nowrap' }}>
                                          {UNIT_LABEL[row.tipo_pp] ?? 'u.'}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  {/* Total */}
                                  <td style={{ padding: '9px 12px', fontSize: '13px', color: 'var(--tx)', whiteSpace: 'nowrap', fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums' }}>
                                    {totalLabel(row)}
                                  </td>
                                  {/* Costo */}
                                  <td style={{ padding: '9px 12px', fontSize: '13px', whiteSpace: 'nowrap', fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: costo > 0 ? 'var(--tx)' : 'var(--ts)' }}>
                                    {costo > 0 ? formatCLP(costo) : '—'}
                                  </td>
                                  {/* Status */}
                                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                    <StatusBadge status={status} />
                                  </td>
                                  {/* Delete */}
                                  <td style={{ padding: '9px 8px', textAlign: 'center', width: '44px' }}>
                                    <button type="button" onClick={() => removePPRow(row.key)}
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
                      {/* Add row */}
                      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--bo)', flexShrink: 0 }}>
                        <button type="button" onClick={addPPRow} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          background: 'none', border: '1.5px dashed var(--bo)', borderRadius: '8px',
                          padding: '7px 16px', cursor: 'pointer', fontSize: '13px', color: 'var(--ts)',
                          fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                        }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ac)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ac)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--bo)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ts)'; }}
                        >
                          + Agregar PP
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Tab Rendimiento ───────────────────────────────────────── */}
              {tab === 'rendimiento' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {rendRows.length === 0 ? (
                    <EmptyRend onAdd={addRendRow} />
                  ) : (
                    <>
                      <div style={{ overflowX: 'auto', flex: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                          <thead>
                            <tr style={{ background: 'var(--bg)' }}>
                              {['Verdura / MP', 'KG utilizados', 'KG rendidos', 'Merma kg', 'Merma %', ''].map((h, i) => (
                                <th key={i} style={{
                                  padding: '10px 12px', textAlign: i === 5 ? 'center' : 'left',
                                  fontSize: '10px', fontWeight: 700, color: 'var(--ts)',
                                  textTransform: 'uppercase', letterSpacing: '0.5px',
                                  borderBottom: '1px solid var(--bo)', whiteSpace: 'nowrap',
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rendRows.map(row => {
                              const kgu = parseFloat(row.kg_utilizados) || 0;
                              const kgr = parseFloat(row.rendimiento_kg) || 0;
                              const m   = (kgu > 0 && kgr > 0) ? calcMerma(kgu, kgr) : null;
                              const col = !m ? 'var(--ts)' : m.estado === 'alto' ? 'var(--rd)' : m.estado === 'medio' ? 'var(--am)' : 'var(--tl)';
                              return (
                                <tr key={row.key} style={{ borderBottom: '1px solid var(--bo)' }}>
                                  <td style={{ padding: '9px 12px', minWidth: '180px' }}>
                                    <select value={row.verdura} onChange={e => updateRend(row.key, 'verdura', e.target.value)}
                                      style={{ ...thinInp, width: '100%', color: row.verdura ? 'var(--tx)' : 'var(--ts)' }}
                                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                                    >
                                      <option value="">Seleccionar...</option>
                                      {maestros?.verduras.map(v => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
                                    </select>
                                  </td>
                                  <td style={{ padding: '9px 8px', width: '130px' }}>
                                    <input type="number" min="0" step="0.01" value={row.kg_utilizados}
                                      onChange={e => updateRend(row.key, 'kg_utilizados', e.target.value)}
                                      placeholder="0.00" style={{ ...thinInp, width: '90px' }}
                                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                                    />
                                  </td>
                                  <td style={{ padding: '9px 8px', width: '130px' }}>
                                    <input type="number" min="0" step="0.01" value={row.rendimiento_kg}
                                      onChange={e => updateRend(row.key, 'rendimiento_kg', e.target.value)}
                                      placeholder="0.00" style={{ ...thinInp, width: '90px' }}
                                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--bo)')}
                                    />
                                  </td>
                                  <td style={{ padding: '9px 12px', fontSize: '13px', color: col, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                    {m ? `${m.mermaKg.toFixed(2)} kg` : '—'}
                                  </td>
                                  <td style={{ padding: '9px 12px', fontSize: '13px', fontWeight: 700, color: col, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                    {m ? formatPct(m.mermaPct) : '—'}
                                  </td>
                                  <td style={{ padding: '9px 8px', textAlign: 'center', width: '44px' }}>
                                    <button type="button" onClick={() => removeRendRow(row.key)}
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
                        <button type="button" onClick={addRendRow} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          background: 'none', border: '1.5px dashed var(--bo)', borderRadius: '8px',
                          padding: '7px 16px', cursor: 'pointer', fontSize: '13px', color: 'var(--ts)',
                          fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                        }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ac)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ac)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--bo)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ts)'; }}
                        >
                          + Agregar verdura
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Summary + Save bar ──────────────────────────────────────────── */}
          <div style={{
            marginTop: '14px', background: 'var(--sf)', borderRadius: '14px',
            border: '1px solid var(--bo)', padding: '16px 22px',
            display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
          }}>
            {/* Metrics */}
            <div style={{ display: 'flex', gap: '24px', flex: 1, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>PPs registrados</p>
                <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: ppValidos.length > 0 ? 'var(--tx)' : 'var(--ts)', margin: 0, lineHeight: 1.1 }}>
                  {ppValidos.length}
                  <span style={{ fontSize: '13px', color: 'var(--ts)', fontWeight: 400, marginLeft: '3px' }}>
                    /{ppRows.length} total
                  </span>
                </p>
              </div>

              {costoTotal > 0 && (
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Costo estimado</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: 'var(--ac)', margin: 0, lineHeight: 1.1 }}>
                    {formatCLP(costoTotal)}
                  </p>
                </div>
              )}

              {rendCount > 0 && (
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Rendimiento</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: 'var(--tx)', margin: 0, lineHeight: 1.1 }}>
                    {rendCount} <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--ts)' }}>verdura{rendCount !== 1 ? 's' : ''}</span>
                  </p>
                </div>
              )}

              {/* Warnings */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {warnings > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '8px', padding: '5px 11px' }}>
                    <span style={{ fontSize: '13px' }}>⚠</span>
                    <span style={{ fontSize: '12px', color: '#92400E', fontWeight: 600 }}>{warnings} PP sin costo/equivalencia</span>
                  </div>
                )}
                {!responsableId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '5px 11px' }}>
                    <span style={{ fontSize: '13px' }}>⚠</span>
                    <span style={{ fontSize: '12px', color: '#991B1B', fontWeight: 600 }}>Falta responsable</span>
                  </div>
                )}
                {ppValidos.length === 0 && ppRows.length === 0 && (
                  <span style={{ fontSize: '13px', color: 'var(--ts)' }}>Agrega al menos un PP para guardar</span>
                )}
              </div>
            </div>

            {/* Save button */}
            <button type="submit" disabled={guardando} style={{
              background: guardando ? 'var(--ts)' : canSave ? 'var(--ac)' : 'var(--bo)',
              color: canSave || guardando ? '#fff' : 'var(--ts)',
              border: 'none', borderRadius: '10px', padding: '12px 28px',
              fontSize: '14px', fontWeight: 700,
              cursor: guardando ? 'wait' : canSave ? 'pointer' : 'not-allowed',
              fontFamily: 'DM Sans, sans-serif',
              display: 'flex', alignItems: 'center', gap: '8px',
              transition: 'all 0.2s', flexShrink: 0, minWidth: '230px', justifyContent: 'center',
            }}>
              {guardando ? (
                <>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Guardando...
                </>
              ) : (
                'Guardar informe de producción →'
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
