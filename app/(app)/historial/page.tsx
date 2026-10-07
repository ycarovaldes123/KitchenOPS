'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { calcCostoProduccionPP, calcTotalPP, formatCLP, formatPct, calcMerma } from '@/lib/calculos';
import { useRol } from '@/components/RolProvider';
import NavIcon from '@/components/layout/NavIcon';
import { MOTIVO_MERMA_COLOR, normalizeMotivoMerma } from '@/lib/mermas';
import './historial.css';

// ─── Helpers ────────────────────────────────────────────────────────────────

function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}
function mesInicio() {
  const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function restarMeses(n: number) {
  const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }));
  d.setMonth(d.getMonth() - n);
  return new Intl.DateTimeFormat('en-CA').format(d);
}
function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}
function fmtHora(iso: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
}

const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const DIAS_SEMANA = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const MESES_LARGOS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// "LUNES 06 DE OCTUBRE DE 2026" (la fecha es operacional, sin hora: se arma en UTC para no correr el día)
function fmtFechaLarga(fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number);
  if (!y || !m || !d) return fecha;
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS_SEMANA[dia]} ${String(d).padStart(2, '0')} DE ${MESES_LARGOS[m - 1]} DE ${y}`;
}
// "10:40 p. m."
function fmtHora12(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-CL', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Santiago' });
}
const fmtNum = (n: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(Number(n) || 0);
// Unidad en que se INGRESA la cantidad según el tipo de PP (sin convertir ni abreviar).
function unidadIngreso(tipoPP: unknown, unidadProducto: unknown) {
  const tipo = String(tipoPP ?? '').toUpperCase();
  if (tipo === 'PORCION') return 'PP';
  if (tipo === 'CC') return 'CC';
  if (tipo === 'UND') return String(unidadProducto ?? '').toUpperCase() === 'PR' ? 'PR' : 'UN';
  if (tipo === 'DIRECTO') return String(unidadProducto ?? '').toUpperCase() || 'UN';
  return 'PP';
}
// Cantidad ingresada: "1.150 CC", "13 PP", "52 UN"
function fmtIngresado(cantidad: number, tipoPP: unknown, unidadProducto: unknown) {
  return `${fmtNum(cantidad)} ${unidadIngreso(tipoPP, unidadProducto)}`;
}
// Cantidad producida en su unidad base, sin pasar a L ni kg: "1.150 CC", "2.600 GR", "52 UN"
function fmtProducidoPP(cantidad: number, total: number | null | undefined, tipoPP: unknown, gramosPorPP: unknown, unidadProducto: unknown) {
  const tipo = String(tipoPP ?? '').toUpperCase();
  const um = String(unidadProducto ?? '').toUpperCase();
  // PP por unidad: se produce en la unidad del producto (UN, PR...). Solo si el producto va en
  // GR/KG/CC/LT el total queda en gramos o cc (cantidad × gramos por unidad).
  if (tipo === 'UND' && !['GR', 'KG', 'CC', 'LT'].includes(um)) return `${fmtNum(cantidad)} ${um || 'UN'}`;
  if (total == null) return '—';
  if (tipo === 'CC' || um === 'CC' || um === 'LT') return `${fmtNum(total)} CC`;
  if (tipo === 'DIRECTO' && um && um !== 'GR') return `${fmtNum(total)} ${um}`;
  return `${fmtNum(total)} GR`;
}
// Cómo se registra el PP (bajo el nombre): "Porción · 1 PP = 200 GR", "Ingreso en CC"
function fmtTipoPP(tipoPP: unknown, gramosPorPP: unknown, unidadProducto: unknown) {
  const tipo = String(tipoPP ?? '').toUpperCase();
  const g = Number(gramosPorPP) || 0;
  if (tipo === 'PORCION') return g ? `Porción · 1 PP = ${fmtNum(g)} GR` : 'Porción · sin gramos definidos';
  if (tipo === 'UND') {
    const um = String(unidadProducto ?? '').toUpperCase();
    return ['GR', 'KG'].includes(um) && g ? `Unidad · 1 UN = ${fmtNum(g)} GR` : `Unidad · producto en ${um || 'UN'}`;
  }
  if (tipo === 'CC') return 'Ingreso en CC';
  if (tipo === 'DIRECTO') return `Directo en ${String(unidadProducto ?? '').toUpperCase() || '—'}`;
  return tipo || '—';
}

// Solo para presentación en la tabla: deriva el primer nombre sin tocar el registro guardado.
function primerNombre(nombre: string | null | undefined) {
  const limpio = String(nombre ?? '').trim();
  if (!limpio) return '—';
  return limpio.split(/\s+/)[0];
}

// Color fijo del responsable en el Historial (solo presentación, no altera registros).
// Rosado y azul por nombre; el resto en neutro. Insensible a mayúsculas y acentos.
const RESPONSABLES_ROSADO = new Set(['pamela', 'paulina', 'luisa', 'javiera']);
const RESPONSABLES_AZUL = new Set(['joaquin', 'joaqui', 'joel', 'camilo']);
type EstiloChip = { bg: string; border: string; color: string };
const CHIP_ROSADO: EstiloChip = { bg: '#FDF2F8', border: '#F9A8D4', color: '#DB2777' };
const CHIP_AZUL: EstiloChip = { bg: '#EFF6FF', border: '#93C5FD', color: '#2563EB' };
const CHIP_NEUTRO: EstiloChip = { bg: '#F5F3F0', border: '#E7E2DC', color: '#525252' };
function estiloResponsable(nombre: string | null | undefined): EstiloChip {
  const tokens = normalizarTexto(String(nombre ?? '')).split(/\s+/).filter(Boolean);
  if (tokens.some(t => RESPONSABLES_ROSADO.has(t))) return CHIP_ROSADO;
  if (tokens.some(t => RESPONSABLES_AZUL.has(t))) return CHIP_AZUL;
  return CHIP_NEUTRO;
}

function ResponsableChip({ nombre }: { nombre: string | null | undefined }) {
  const e = estiloResponsable(nombre);
  return (
    <span className="hst-chip" title={String(nombre ?? '')} style={{ background: e.bg, borderColor: e.border, color: e.color }}>
      {primerNombre(nombre).toUpperCase()}
    </span>
  );
}

function TurnoChip({ turno }: { turno: string | null | undefined }) {
  const am = String(turno ?? '').toUpperCase() === 'AM';
  return (
    <span className="hst-chip" style={am
      ? { background: '#ECFDF5', borderColor: '#A7F3D0', color: '#047857' }
      : { background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1D4ED8' }}>
      {turno || '—'}
    </span>
  );
}

// Ventana de páginas para la paginación numerada: 1 … (p-1) p (p+1) … N
function paginaRango(actual: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const ini = Math.max(2, actual - 1);
  const fin = Math.min(total - 1, actual + 1);
  if (ini > 2) out.push('…');
  for (let i = ini; i <= fin; i++) out.push(i);
  if (fin < total - 1) out.push('…');
  out.push(total);
  return out;
}

function normalizarTexto(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function calcCostoProduccion(
  cantidad: number,
  tipoPP: string | null | undefined,
  gramosPorPP: number | null | undefined,
  unidadProducto: string | null | undefined,
  costoUnitario: number,
) {
  return calcCostoProduccionPP(
    cantidad,
    { tipo_pp: tipoPP, gramos_por_pp: gramosPorPP },
    unidadProducto,
    costoUnitario
  );
}

function formatPPDisplay(item: Record<string, unknown>) {
  const codigo = String(item.codigo_producto ?? '').trim();
  const nombre = String(item.nombre_pp ?? item.nombre ?? '').trim();
  if (codigo && nombre) return `${codigo} - ${nombre}`;
  return codigo || nombre || 'Sin codigo';
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = 'produccion' | 'colacion' | 'mermas' | 'frutas' | 'inventario';
const PAGE_SIZE = 25;

type Coincidencia = { codigo_producto: string | null; nombre_pp: string; tipo_pp: string | null; gramos_por_pp: number | null; cantidad: number; total_producido: number; costo_total: number | null; registros: number };
type ResultadoBusqueda = { q: string; coincidencias: Coincidencia[] };

// Misma normalización que el buscador del servidor: todas las palabras deben estar en el texto.
function terminosBusqueda(q: string) {
  return normalizarTexto(q).split(/\s+/).filter(Boolean);
}
function coincide(texto: string, terminos: string[]) {
  const t = normalizarTexto(texto);
  return terminos.length > 0 && terminos.every(x => t.includes(x));
}

type PorDia = Record<string, { registros: number; lineas: number; costo_total: number | null }>;

type HistorialSummary = {
  por_dia?: PorDia;
  registros?: number;
  lineas?: number;
  inscritos?: number;
  productos?: number;
  platos?: number;
  cantidad_total?: number;
  costo_total?: number | null;
  promedio_registro?: number | null;
  promedio_plato?: number | null;
  promedio_productos?: number | null;
  truncated?: boolean;
};

// ─── Shared styles ──────────────────────────────────────────────────────────

const thSt: React.CSSProperties = {
  textAlign: 'left', fontSize: '10px', fontWeight: 700,
  color: 'var(--ts)', textTransform: 'uppercase',
  letterSpacing: '0.5px', padding: '10px 14px', whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--bo)', background: 'var(--bg)',
};
const tdSt: React.CSSProperties = { padding: '11px 14px', fontSize: '13px', color: 'var(--tx)' };

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: `${color}18`, color, border: `1px solid ${color}30`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function ExpandBtn({ open }: { open: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: open ? 'var(--ac)' : 'var(--bo)', color: open ? '#fff' : 'var(--ts)', fontSize: '10px', fontWeight: 700, flexShrink: 0, transition: 'all 0.2s' }}>
      {open ? '▲' : '▼'}
    </span>
  );
}

// Acciones de fila para el administrador: editar (abre el detalle en modo edición) y eliminar el movimiento.
function RowActions({ open, editing, onEdit, onDelete }: { open: boolean; editing: boolean; onEdit: () => void; onDelete: () => void }) {
  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px',
    borderRadius: '7px', border: '1px solid var(--bo)', background: 'var(--sf)', cursor: 'pointer', padding: 0,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
      <button
        type="button" title="Editar movimiento" aria-label="Editar movimiento" disabled={editing}
        onClick={e => { e.stopPropagation(); onEdit(); }}
        style={{ ...btn, color: editing ? 'var(--ts)' : 'var(--ac)', opacity: editing ? 0.5 : 1, cursor: editing ? 'default' : 'pointer' }}
      >
        <NavIcon name="pencil" size={15} />
      </button>
      <button
        type="button" title="Eliminar movimiento" aria-label="Eliminar movimiento"
        onClick={e => { e.stopPropagation(); onDelete(); }}
        style={{ ...btn, color: 'var(--rd)', borderColor: '#FCA5A5', background: '#FEF2F2' }}
      >
        <NavIcon name="trash" size={15} />
      </button>
      <ExpandBtn open={open} />
    </div>
  );
}

function DetailLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>
      {children}
    </p>
  );
}

function MetaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '4px' }}>
      <span style={{ fontSize: '13px', flexShrink: 0 }}>{icon}</span>
      <span style={{ color: 'var(--ts)' }}>{label}:</span>
      <span style={{ color: 'var(--tx)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// KPI compactos que van arriba, junto al filtro de fechas. Reutiliza el `summary` que ya
// calcula /api/historial (mismos números que mostraba el panel inferior anterior).
type KpiItem = { label: string; value: string; desc: string; tono: 'naranja' | 'azul' | 'verde' | 'neutro'; icon: string };

function KpiRow({ tab, summary, verCostos }: { tab: Tab; summary: HistorialSummary | null; verCostos: boolean }) {
  const s = summary;
  const numberFmt = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value);
  const clp = (value: number | null | undefined) => value != null ? formatCLP(value) : '—';
  const items: KpiItem[] = [];
  const costo = (desc: string) => { if (verCostos) items.push({ label: 'Costo total', value: clp(s?.costo_total), desc, tono: 'naranja', icon: 'coins' }); };
  const promedio = (label: string, value: number | null | undefined, desc: string) => { if (verCostos) items.push({ label, value: clp(value), desc, tono: 'azul', icon: 'chart-line' }); };

  if (tab === 'produccion') {
    costo('Costo de todas las producciones');
    promedio('Promedio / informe', s?.promedio_registro, 'Costo promedio por registro');
    items.push({ label: 'PP registrados', value: numberFmt(s?.lineas), desc: 'Total de PP producidos', tono: 'verde', icon: 'cooking-pot' });
    items.push({ label: 'Informes', value: numberFmt(s?.registros), desc: 'Registros en el período', tono: 'neutro', icon: 'clipboard' });
  } else if (tab === 'colacion') {
    costo('Costo de todas las colaciones');
    promedio('Promedio / plato', s?.promedio_plato, 'Costo promedio por inscrito');
    items.push({ label: 'Inscritos', value: numberFmt(s?.inscritos), desc: 'Total de inscritos', tono: 'verde', icon: 'utensils' });
    items.push({ label: 'Colaciones', value: numberFmt(s?.registros), desc: 'Registros en el período', tono: 'neutro', icon: 'clipboard' });
  } else if (tab === 'frutas') {
    costo('Costo de todas las entregas');
    promedio('Promedio / registro', s?.promedio_registro, 'Costo promedio por registro');
    items.push({ label: 'Productos', value: numberFmt(s?.lineas), desc: 'Líneas de frutas entregadas', tono: 'verde', icon: 'apple' });
    items.push({ label: 'Registros', value: numberFmt(s?.registros), desc: 'Registros en el período', tono: 'neutro', icon: 'clipboard' });
  } else if (tab === 'mermas') {
    costo('Costo de todas las mermas');
    promedio('Promedio / merma', s?.promedio_registro, 'Costo promedio por registro');
    items.push({ label: 'Productos', value: numberFmt(s?.productos), desc: 'Productos mermados', tono: 'verde', icon: 'trending' });
    items.push({ label: 'Registros', value: numberFmt(s?.registros), desc: 'Registros en el período', tono: 'neutro', icon: 'clipboard' });
  } else if (tab === 'inventario') {
    items.push({ label: 'Productos contados', value: numberFmt(s?.productos), desc: 'Líneas de conteo', tono: 'naranja', icon: 'package' });
    items.push({ label: 'Cantidad total', value: numberFmt(s?.cantidad_total), desc: 'Suma de cantidades contadas', tono: 'azul', icon: 'sigma' });
    items.push({ label: 'Promedio / toma', value: numberFmt(s?.promedio_productos), desc: 'Productos por toma', tono: 'verde', icon: 'chart-line' });
    items.push({ label: 'Tomas', value: numberFmt(s?.registros), desc: 'Registros en el período', tono: 'neutro', icon: 'clipboard' });
  }

  return (
    <>
      {items.slice(0, 4).map(item => (
        <div key={item.label} className={`hst-kpi is-${item.tono}`}>
          <div className="hst-kpi-top">
            <span className="hst-kpi-label">{item.label}</span>
            <span className="hst-kpi-icon"><NavIcon name={item.icon} size={42} strokeWidth={2} /></span>
          </div>
          <b className="hst-kpi-valor">{item.value}</b>
          <span className="hst-kpi-desc">{item.desc}</span>
        </div>
      ))}
    </>
  );
}

function PageBtn({ children, activo, disabled, onClick, label }: { children: React.ReactNode; activo?: boolean; disabled?: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={activo ? 'page' : undefined}
      style={{
        minWidth: '28px', height: '28px', padding: '0 6px', borderRadius: '7px',
        border: `1px solid ${activo ? 'var(--ac)' : 'rgba(232, 86, 10, 0.4)'}`,
        background: activo ? 'var(--ac)' : 'var(--bg)',
        color: activo ? '#fff' : 'var(--ac)',
        fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: activo ? 700 : 600,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1,
        transition: 'border-color 0.15s',
      }}
    >
      {children}
    </button>
  );
}

// Paginación numerada real: usa `total` (count del backend tras aplicar filtros/búsqueda).
function Paginacion({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hastaN = Math.min(page * pageSize, total);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '14px 20px', borderTop: '1px solid var(--bo)', background: 'var(--sf)' }}>
      <span style={{ fontSize: '12px', color: 'var(--ts)' }}>
        Mostrando {desde} a {hastaN} de {total} registro{total !== 1 ? 's' : ''}
      </span>
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <PageBtn label="Página anterior" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</PageBtn>
          {paginaRango(page, totalPages).map((n, i) => n === '…'
            ? <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--ts)', fontSize: '12px' }}>…</span>
            : <PageBtn key={n} activo={n === page} label={`Página ${n}`} onClick={() => onPage(n)}>{n}</PageBtn>)}
          <PageBtn label="Página siguiente" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>›</PageBtn>
        </div>
      )}
    </div>
  );
}

type SearchOption = {
  value: string;
  label: string;
  searchText: string;
};

function SearchablePicker({
  value,
  options,
  placeholder,
  width = '260px',
  onChange,
}: {
  value: string;
  options: SearchOption[];
  placeholder: string;
  width?: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find(opt => opt.value === value)?.label ?? '';
  const displayValue = open ? query : selectedLabel;

  const matches = useMemo(() => {
    const q = normalizarTexto(query);
    const base = q
      ? options.filter(opt => normalizarTexto(`${opt.label} ${opt.searchText}`).includes(q))
      : options;
    return base.slice(0, 12);
  }, [options, query]);

  return (
    <div style={{ position: 'relative', width }}>
      <input
        type="text"
        value={displayValue}
        placeholder={placeholder}
        onFocus={() => {
          setQuery(selectedLabel);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        style={{
          width: '100%',
          padding: '4px 8px',
          fontSize: '12px',
          borderRadius: '4px',
          border: '1px solid var(--bo)',
          background: 'var(--bg)',
          color: 'var(--tx)',
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 4px)',
            zIndex: 20,
            maxHeight: '220px',
            overflowY: 'auto',
            border: '1px solid var(--bo)',
            borderRadius: '6px',
            background: 'var(--bg)',
            boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ts)' }}>
              Sin coincidencias
            </div>
          ) : (
            matches.map(opt => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  onChange(opt.value);
                  setQuery(opt.label);
                  setOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  border: 'none',
                  borderBottom: '1px solid var(--bo)',
                  background: 'transparent',
                  color: 'var(--tx)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600 }}>{opt.label}</div>
                <div style={{ fontSize: '10px', color: 'var(--ts)', marginTop: '2px' }}>
                  {opt.searchText}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── TablaProduccion ────────────────────────────────────────────────────────

function TablaProduccion({ datos, isAdmin, onRefresh, verCostos, productos, pps, porDia, busqueda }: { datos: Record<string, unknown>[]; canEdit: boolean; isAdmin: boolean; onRefresh: () => void; verCostos: boolean; productos: Record<string, unknown>[]; pps: Record<string, unknown>[]; porDia?: PorDia; busqueda?: ResultadoBusqueda | null }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [editRendValues, setEditRendValues] = useState<Record<string, { kg_utilizados: number; rendimiento_kg: number }>>({});
  const [newRows, setNewRows] = useState<Array<{ localId: string; pp_id: string; cantidad: number }>>([]);
  const [editFecha, setEditFecha] = useState('');
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const toggle = (id: string) => {
    setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    if (editingId === id) { setEditingId(null); setEditValues({}); setEditRendValues({}); setNewRows([]); setEditFecha(''); setDeletedIds(new Set()); setSaveErr(''); }
  };
  const startEdit = (id: string, det: Record<string, unknown>[]) => {
    const vals: Record<string, number> = {};
    det.forEach(d => { vals[d.id as string] = d.cantidad as number; });
    const rendVals: Record<string, { kg_utilizados: number; rendimiento_kg: number }> = {};
    (datos.find(p => (p.id as string) === id)?.rendimiento as Record<string, unknown>[] | undefined)?.forEach(r => {
      rendVals[r.id as string] = {
        kg_utilizados: Number(r.kg_utilizados) || 0,
        rendimiento_kg: Number(r.rendimiento_kg) || 0,
      };
    });
    const fechaActual = String(datos.find(p => (p.id as string) === id)?.fecha ?? '');
    setEditingId(id); setEditValues(vals); setEditRendValues(rendVals); setNewRows([]); setEditFecha(fechaActual); setDeletedIds(new Set()); setSaveErr('');
  };
  const cancelEdit = () => { setEditingId(null); setEditValues({}); setEditRendValues({}); setNewRows([]); setEditFecha(''); setDeletedIds(new Set()); setSaveErr(''); };
  const addRow = () => {
    setNewRows(rows => [...rows, { localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`, pp_id: '', cantidad: 1 }]);
  };
  const removeDetalle = (id: string) => {
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const productosMap = new Map(productos.map(p => [p.codigo as string, p]));
  const ppsMap = new Map(pps.map(pp => [pp.id as string, pp]));
  const ppOptions = useMemo(() => pps.map(pp => ({
    value: pp.id as string,
    label: formatPPDisplay(pp),
    searchText: [pp.id, pp.nombre, pp.codigo_producto, pp.tipo_pp].filter(Boolean).join(' '),
  })), [pps]);
  const saveEditProd = async (prodId: string, det: Record<string, unknown>[], rend: Record<string, unknown>[]) => {
    setSaving(true); setSaveErr('');
    try {
      const detalle = det
        .filter(d => !deletedIds.has(d.id as string))
        .map(d => ({ id: d.id as string, cantidad: editValues[d.id as string] ?? (d.cantidad as number) }));
      const nuevos = newRows.map(r => {
        const pp = ppsMap.get(r.pp_id);
        const producto = pp?.codigo_producto ? productosMap.get(pp.codigo_producto as string) : null;
        const costoUnitario = Number(producto?.costo_promedio) || 0;
        const cantidad = Number(r.cantidad) || 0;
        const tipoPP = pp?.tipo_pp as string | null | undefined;
        const gramosPorPP = Number(pp?.gramos_por_pp) || null;
        const unidadProducto = producto?.unidad_medida as string | null | undefined;
        const total_producido = pp
          ? calcTotalPP(cantidad, { tipo_pp: tipoPP, gramos_por_pp: gramosPorPP }, unidadProducto)
          : cantidad;
        return {
          pp_id: r.pp_id,
          nombre_pp: pp?.nombre ?? '',
          tipo_pp: tipoPP ?? null,
          cantidad,
          gramos_por_pp: gramosPorPP,
          total_producido,
          codigo_producto: pp?.codigo_producto ?? null,
          costo_unitario: costoUnitario,
          costo_total: calcCostoProduccion(cantidad, tipoPP, gramosPorPP, unidadProducto, costoUnitario),
        };
      }).filter(r => r.pp_id);
      const rendimiento = rend.map(r => ({
        id: r.id as string,
        kg_utilizados: editRendValues[r.id as string]?.kg_utilizados ?? (r.kg_utilizados as number),
        rendimiento_kg: editRendValues[r.id as string]?.rendimiento_kg ?? (r.rendimiento_kg as number),
      }));
      const res = await fetch('/api/produccion', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ produccion_id: prodId, fecha: isAdmin ? editFecha : undefined, delete_ids: [...deletedIds], detalle: [...detalle, ...nuevos], rendimiento }) });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setEditingId(null); setEditValues({}); setEditRendValues({}); setNewRows([]); setEditFecha(''); setDeletedIds(new Set()); onRefresh();
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : 'Error guardando'); }
    finally { setSaving(false); }
  };
  const deleteRecord = async (prodId: string) => {
    if (!confirm('BORRAR este informe de produccion?')) return;
    const res = await fetch('/api/produccion', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ produccion_id: prodId }) });
    if (!res.ok) {
      const j = await res.json();
      setSaveErr(j.error ?? 'Error borrando');
      return;
    }
    onRefresh();
  };

  if (!datos.length) return <Empty msg="No hay informes de producción en este período." />;

  // Agrupa los informes de la página por fecha (ya vienen ordenados por fecha desc).
  const dias: { fecha: string; items: Record<string, unknown>[] }[] = [];
  for (const p of datos) {
    const fecha = String(p.fecha ?? '');
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.fecha === fecha) ultimo.items.push(p);
    else dias.push({ fecha, items: [p] });
  }

  // Con búsqueda activa los movimientos encontrados se muestran abiertos: `expanded` pasa a
  // guardar los que el usuario cerró (la tabla se vuelve a montar en cada carga).
  const terminos = busqueda ? terminosBusqueda(busqueda.q) : [];
  const autoAbrir = terminos.length > 0;
  const estaAbierto = (id: string) => expanded.has(id) !== autoAbrir;
  const abrir = (id: string) => setExpanded(s => { const n = new Set(s); if (autoAbrir) n.delete(id); else n.add(id); return n; });
  const coincidencias = busqueda?.coincidencias ?? [];

  return (
    <div className="hst-list">
      {coincidencias.length > 0 && (
        <section className="hst-coinc" aria-label="Totales de la búsqueda">
          <h4 className="hst-sec-title">
            <span className="hst-prod-ico"><NavIcon name="sigma" size={14} /></span>
            Total en el período para «{busqueda?.q}»
          </h4>
          {coincidencias.map(c => {
            const um = c.codigo_producto ? productosMap.get(c.codigo_producto)?.unidad_medida : undefined;
            return (
              <div key={`${c.codigo_producto}|${c.nombre_pp}|${c.tipo_pp}`} className="hst-coinc-row">
                <div className="hst-pp-nombre">
                  <b>{formatPPDisplay(c)}</b>
                  <small>{c.registros} registro{c.registros !== 1 ? 's' : ''} · {fmtTipoPP(c.tipo_pp, c.gramos_por_pp, um)}</small>
                </div>
                <div className="hst-pp-ing"><b>{fmtIngresado(c.cantidad, c.tipo_pp, um)}</b><small>Ingresado</small></div>
                <div className="hst-pp-total"><b>{fmtProducidoPP(c.cantidad, c.total_producido, c.tipo_pp, c.gramos_por_pp, um)}</b><small>Producido</small></div>
                {verCostos && c.costo_total != null && (
                  <div className="hst-pp-costo"><b>{formatCLP(c.costo_total)}</b><small>Costo est.</small></div>
                )}
              </div>
            );
          })}
        </section>
      )}
      {dias.map(({ fecha, items }) => {
        // Totales del día completo (del resumen del período); si no vienen, se calculan con lo visible.
        const dia = porDia?.[fecha] ?? {
          registros: items.length,
          lineas: items.reduce((s, p) => s + ((p.detalle_produccion as unknown[] | undefined)?.length ?? 0), 0),
          costo_total: items.reduce((s, p) => s + ((p.detalle_produccion as Record<string, unknown>[] | undefined) ?? []).reduce((a, d) => a + (Number(d.costo_total) || 0), 0), 0),
        };
        return (
          <section key={fecha} className="hst-day">
            <header className="hst-day-head">
              <span className="hst-day-title">{fmtFechaLarga(fecha)}</span>
              <span className="hst-day-meta">
                {dia.registros} registro{dia.registros !== 1 ? 's' : ''}
                <i aria-hidden>|</i>{dia.lineas} PP
                {verCostos && dia.costo_total != null && <><i aria-hidden>|</i><b>{formatCLP(dia.costo_total)}</b></>}
              </span>
            </header>

            {items.map(p => {
              const id   = p.id as string;
              const det  = (p.detalle_produccion as Record<string, unknown>[]) ?? [];
              const rend = (p.rendimiento as Record<string, unknown>[]) ?? [];
              const ct   = det.reduce((s, d) => s + ((d.costo_total as number) ?? 0), 0);
              const open = estaAbierto(id);
              const editando = editingId === id;
              // Con búsqueda: solo las líneas que coinciden (si ninguna coincide, el movimiento salió
              // por responsable u observación y se muestra completo). Al editar se ve todo.
              const detVisible = terminos.length && !editando ? det.filter(d => coincide(`${d.codigo_producto ?? ''} ${d.nombre_pp ?? ''}`, terminos)) : det;
              const rendVisible = terminos.length && !editando ? rend.filter(r => coincide(String(r.verdura ?? ''), terminos)) : rend;
              const filtrado = !!terminos.length && !editando && (detVisible.length > 0 || rendVisible.length > 0);
              const detMostrar = filtrado ? detVisible : det;
              const rendMostrar = filtrado ? rendVisible : rend;
              const [, mes, anio] = fmtFecha(p.fecha as string).split('/');

              return (
                <article key={id} className={`hst-mov${open ? ' is-open' : ''}`}>
                  <div className={`hst-mov-head${verCostos ? '' : ' sin-costo'}`} onClick={() => toggle(id)}>
                    <span className="hst-mov-dia">{fmtFecha(p.fecha as string).slice(0, 2)}</span>
                    <span className="hst-mov-fecha">
                      <b>{MESES_CORTOS[Number(mes) - 1]} {anio}</b>
                      {!!p.created_at && <small>{fmtHora12(p.created_at as string)}</small>}
                    </span>
                    <span className="hst-mov-resp"><ResponsableChip nombre={p.responsable_nombre as string} /></span>
                    <span className="hst-mov-turno"><TurnoChip turno={p.turno as string} /></span>
                    <span className="hst-mov-pp">
                      <b>{det.length} PP</b>
                      <small>{det.length === 1 ? 'registrado' : 'registrados'}</small>
                    </span>
                    {verCostos && (
                      <span className="hst-mov-costo">
                        <small>Costo total</small>
                        <b>{ct > 0 ? formatCLP(ct) : '—'}</b>
                      </span>
                    )}
                    <span className="hst-mov-acciones" onClick={e => e.stopPropagation()}>
                      {isAdmin && (
                        <>
                          <button type="button" className="hst-icon-btn" title="Editar" aria-label="Editar movimiento" disabled={editando}
                            onClick={() => { abrir(id); startEdit(id, det); }}>
                            <NavIcon name="pencil" size={16} />
                          </button>
                          <button type="button" className="hst-icon-btn is-danger" title="Eliminar" aria-label="Eliminar movimiento"
                            onClick={() => deleteRecord(id)}>
                            <NavIcon name="trash" size={16} />
                          </button>
                        </>
                      )}
                      <button type="button" className={`hst-icon-btn${open ? ' is-open' : ''}`} title={open ? 'Contraer' : 'Expandir'} aria-label={open ? 'Contraer' : 'Expandir'} aria-expanded={open}
                        onClick={() => toggle(id)}>
                        <NavIcon name={open ? 'chevron-up' : 'chevron-down'} size={17} />
                      </button>
                    </span>
                  </div>

                  {open && (
                    <div className="hst-mov-body">
                      {editando && (
                        <div className="hst-edit-bar">
                          {isAdmin && (
                            <label className="hst-edit-fecha">
                              <span>Fecha registro</span>
                              <input type="date" value={editFecha} onChange={e => setEditFecha(e.target.value)} />
                            </label>
                          )}
                          <button type="button" className="hst-btn-sec" onClick={addRow} disabled={saving}>+ Añadir PP</button>
                          <button type="button" className="hst-btn-ok" onClick={() => saveEditProd(id, det, rend)} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
                          <button type="button" className="hst-btn-sec" onClick={cancelEdit}>Cancelar</button>
                        </div>
                      )}
                      {saveErr && editando && <p className="hst-err">{saveErr}</p>}

                      {filtrado && (
                        <p className="hst-filtrado">
                          Mostrando solo lo que coincide con «{busqueda?.q}»: {detMostrar.length} de {det.length} PP{rend.length ? ` · ${rendMostrar.length} de ${rend.length} verduras` : ''}
                        </p>
                      )}
                      <div className={`hst-mov-grid${rendMostrar.length ? '' : ' is-single'}`}>
                        <div>
                          <h4 className="hst-sec-title"><span className="hst-prod-ico"><NavIcon name="cooking-pot" size={14} /></span>Producción PP</h4>
                          {detMostrar.length === 0 && !editando && <p className="hst-muted">{filtrado ? 'Ningún PP coincide con la búsqueda.' : 'Sin PP registrados.'}</p>}
                          <div className="hst-pp-list">
                            {detMostrar.filter(d => !deletedIds.has(d.id as string)).map(d => {
                              const qty = editando ? (editValues[d.id as string] ?? (d.cantidad as number)) : (d.cantidad as number);
                              const costoUnitarioEdit = Number(d.costo_unitario) || (Number(d.cantidad) > 0 ? Number(d.costo_total) / Number(d.cantidad) : 0);
                              const producto = d.codigo_producto ? productosMap.get(d.codigo_producto as string) : undefined;
                              const unidadProducto = producto?.unidad_medida as string | null | undefined;
                              const costoEdit = d.codigo_producto
                                ? calcCostoProduccion(qty, d.tipo_pp as string | null | undefined, d.gramos_por_pp as number | null | undefined, unidadProducto, costoUnitarioEdit)
                                : Math.round(qty * costoUnitarioEdit);
                              const total = calcTotalPP(qty, { tipo_pp: d.tipo_pp as string | null | undefined, gramos_por_pp: d.gramos_por_pp as number | null | undefined }, unidadProducto);
                              const costo = editando ? costoEdit : (d.costo_total as number);
                              return (
                                <div key={d.id as string} className={`hst-pp${editando ? ' is-edit' : ''}`}>
                                  <div className="hst-pp-nombre">
                                    <b title={formatPPDisplay(d)}>{formatPPDisplay(d)}</b>
                                    <small>{fmtTipoPP(d.tipo_pp, d.gramos_por_pp, unidadProducto)}</small>
                                  </div>
                                  <div className="hst-pp-ing">
                                    {editando ? (
                                      <span className="hst-pp-input">
                                        <input type="number" value={qty} min={0} step="any" aria-label={`Cantidad de ${formatPPDisplay(d)}`}
                                          onChange={e => setEditValues(v => ({ ...v, [d.id as string]: parseFloat(e.target.value) || 0 }))} />
                                        {unidadIngreso(d.tipo_pp, unidadProducto)}
                                      </span>
                                    ) : (
                                      <b>{fmtIngresado(qty, d.tipo_pp, unidadProducto)}</b>
                                    )}
                                    <small>Ingresado</small>
                                  </div>
                                  <div className="hst-pp-total">
                                    <b>{fmtProducidoPP(qty, total, d.tipo_pp, d.gramos_por_pp, unidadProducto)}</b>
                                    <small>Producido</small>
                                  </div>
                                  {verCostos && (
                                    <div className="hst-pp-costo">
                                      <b>{costo > 0 ? formatCLP(costo) : '—'}</b>
                                      <small>Costo est.</small>
                                    </div>
                                  )}
                                  {editando && isAdmin && (
                                    <button type="button" className="hst-quitar" title="Quitar línea" aria-label="Quitar línea" onClick={() => removeDetalle(d.id as string)}>×</button>
                                  )}
                                </div>
                              );
                            })}
                            {editando && newRows.map(row => {
                              const pp = row.pp_id ? ppsMap.get(row.pp_id) : undefined;
                              const producto = pp?.codigo_producto ? productosMap.get(pp.codigo_producto as string) : undefined;
                              const costoUnitario = Number(producto?.costo_promedio) || 0;
                              const cantidad = Number(row.cantidad) || 0;
                              const tipoPP = pp?.tipo_pp as string | null | undefined;
                              const gramosPorPP = Number(pp?.gramos_por_pp) || null;
                              const unidadProducto = producto?.unidad_medida as string | null | undefined;
                              const total = pp ? calcTotalPP(cantidad, { tipo_pp: tipoPP, gramos_por_pp: gramosPorPP }, unidadProducto) : null;
                              const costoProduccion = pp ? calcCostoProduccion(cantidad, tipoPP, gramosPorPP, unidadProducto, costoUnitario) : 0;
                              return (
                                <div key={row.localId} className="hst-pp is-edit is-new">
                                  <div className="hst-pp-nombre">
                                    <SearchablePicker
                                      value={row.pp_id}
                                      options={ppOptions}
                                      placeholder="Buscar PP o código"
                                      width="100%"
                                      onChange={value => setNewRows(v => v.map(x => x.localId === row.localId ? { ...x, pp_id: value } : x))}
                                    />
                                    <small>{pp ? fmtTipoPP(tipoPP, gramosPorPP, unidadProducto) : 'Nuevo PP: elige el producto'}</small>
                                  </div>
                                  <div className="hst-pp-ing">
                                    <span className="hst-pp-input">
                                      <input type="number" min={0} step="any" value={row.cantidad} aria-label="Cantidad del nuevo PP"
                                        onChange={e => setNewRows(v => v.map(x => x.localId === row.localId ? { ...x, cantidad: parseFloat(e.target.value) || 0 } : x))} />
                                      {pp ? unidadIngreso(tipoPP, unidadProducto) : ''}
                                    </span>
                                    <small>Ingresado</small>
                                  </div>
                                  <div className="hst-pp-total">
                                    <b>{pp ? fmtProducidoPP(cantidad, total, tipoPP, gramosPorPP, unidadProducto) : '—'}</b>
                                    <small>Producido</small>
                                  </div>
                                  {verCostos && (
                                    <div className="hst-pp-costo">
                                      <b>{costoProduccion > 0 ? formatCLP(costoProduccion) : '—'}</b>
                                      <small>Costo est.</small>
                                    </div>
                                  )}
                                  <button type="button" className="hst-quitar" title="Quitar línea" aria-label="Quitar línea" onClick={() => setNewRows(v => v.filter(x => x.localId !== row.localId))}>×</button>
                                </div>
                              );
                            })}
                          </div>

                          {!!p.observacion && (
                            <div className="hst-obs">
                              <span><NavIcon name="info" size={13} strokeWidth={2.2} />Observación</span>
                              <p>{p.observacion as string}</p>
                            </div>
                          )}
                        </div>

                        {rendMostrar.length > 0 && (
                          <div className="hst-rend">
                            <h4 className="hst-sec-title"><span className="hst-leaf"><NavIcon name="leaf" size={14} /></span>Rendimiento verduras</h4>
                            <table>
                              <thead>
                                <tr><th>Producto</th><th>Utilizado</th><th>Rendimiento</th><th>Merma</th></tr>
                              </thead>
                              <tbody>
                                {rendMostrar.map(r => {
                                  const rv = editRendValues[r.id as string] ?? { kg_utilizados: r.kg_utilizados as number, rendimiento_kg: r.rendimiento_kg as number };
                                  const m = calcMerma(rv.kg_utilizados, rv.rendimiento_kg);
                                  return (
                                    <tr key={r.id as string}>
                                      <td>{r.verdura as string}</td>
                                      <td>
                                        {editando ? (
                                          <input type="number" min={0} step="any" value={rv.kg_utilizados}
                                            onChange={e => setEditRendValues(v => ({ ...v, [r.id as string]: { kg_utilizados: parseFloat(e.target.value) || 0, rendimiento_kg: v[r.id as string]?.rendimiento_kg ?? rv.rendimiento_kg } }))} />
                                        ) : `${fmtNum(r.kg_utilizados as number)} kg`}
                                      </td>
                                      <td>
                                        {editando ? (
                                          <input type="number" min={0} step="any" value={rv.rendimiento_kg}
                                            onChange={e => setEditRendValues(v => ({ ...v, [r.id as string]: { kg_utilizados: v[r.id as string]?.kg_utilizados ?? rv.kg_utilizados, rendimiento_kg: parseFloat(e.target.value) || 0 } }))} />
                                        ) : `${fmtNum(r.rendimiento_kg as number)} kg`}
                                      </td>
                                      <td><span className={`hst-merma is-${m.estado}`}>{formatPct(m.mermaPct)}</span></td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        );
      })}
      {saveErr && !editingId && <p className="hst-err" style={{ margin: '0 0 12px' }}>{saveErr}</p>}
    </div>
  );
}

// ─── TablaColacion ──────────────────────────────────────────────────────────

function TablaColacion({ datos, isAdmin, onRefresh, verCostos, productos }: { datos: Record<string, unknown>[]; canEdit: boolean; isAdmin: boolean; onRefresh: () => void; verCostos: boolean; productos: Record<string, unknown>[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [editInscritos, setEditInscritos] = useState<number>(0);
  const [editFecha, setEditFecha] = useState('');
  const [newRows, setNewRows] = useState<Array<{ localId: string; codigo_producto: string; cantidad: number }>>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const productosMap = new Map(productos.map(p => [p.codigo as string, p]));

  const toggle = (id: string) => {
    setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    if (editingId === id) { setEditingId(null); setEditValues({}); setEditInscritos(0); setEditFecha(''); setNewRows([]); setDeletedIds(new Set()); setSaveErr(''); }
  };
  const startEdit = (id: string, det: Record<string, unknown>[], nInscritos: number) => {
    const vals: Record<string, number> = {};
    det.forEach(d => { vals[d.id as string] = d.cantidad as number; });
    const fechaActual = String(datos.find(c => (c.id as string) === id)?.fecha ?? '');
    setEditingId(id); setEditValues(vals); setEditInscritos(nInscritos); setEditFecha(fechaActual); setNewRows([]); setDeletedIds(new Set()); setSaveErr('');
  };
  const cancelEdit = () => { setEditingId(null); setEditValues({}); setEditInscritos(0); setEditFecha(''); setNewRows([]); setDeletedIds(new Set()); setSaveErr(''); };
  const addRow = () => setNewRows(rows => [...rows, { localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`, codigo_producto: '', cantidad: 1 }]);
  const removeDetalle = (id: string) => {
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const productoOptions = useMemo(() => productos.map(prod => ({
    value: prod.codigo as string,
    label: `${prod.codigo as string} · ${prod.nombre as string}`,
    searchText: [prod.codigo, prod.nombre, prod.unidad_medida].filter(Boolean).join(' '),
  })), [productos]);
  const saveEditCol = async (colId: string, det: Record<string, unknown>[]) => {
    setSaving(true); setSaveErr('');
    try {
      const detalle = det
        .filter(d => !deletedIds.has(d.id as string))
        .map(d => ({ id: d.id as string, cantidad: editValues[d.id as string] ?? (d.cantidad as number) }));
      const nuevos = newRows.map(r => {
        const p = productosMap.get(r.codigo_producto);
        const costoUnitario = Number(p?.costo_promedio) || 0;
        const cantidad = Number(r.cantidad) || 0;
        return {
          codigo_producto: r.codigo_producto,
          nombre_producto: p?.nombre ?? '',
          cantidad,
          unidad_medida: p?.unidad_medida ?? null,
          costo_unitario: costoUnitario,
          costo_total: Math.round(cantidad * costoUnitario),
        };
      }).filter(r => r.codigo_producto);
      const res = await fetch('/api/colacion', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ colacion_id: colId, fecha: isAdmin ? editFecha : undefined, n_inscritos: editInscritos, delete_ids: [...deletedIds], detalle: [...detalle, ...nuevos] }) });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setEditingId(null); setEditValues({}); setEditInscritos(0); setEditFecha(''); setNewRows([]); setDeletedIds(new Set()); onRefresh();
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : 'Error guardando'); }
    finally { setSaving(false); }
  };
  const deleteRecord = async (colId: string) => {
    if (!confirm('BORRAR esta colacion?')) return;
    const res = await fetch('/api/colacion', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ colacion_id: colId }) });
    if (!res.ok) {
      const j = await res.json();
      setSaveErr(j.error ?? 'Error borrando');
      return;
    }
    onRefresh();
  };

  if (!datos.length) return <Empty msg="No hay colaciones registradas en este período." />;

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
        <thead>
          <tr>
            {['Fecha', 'Responsable', 'Menú', 'Inscritos', ...(verCostos ? ['Costo total', 'Costo / plato'] : []), 'Acciones'].map(h => (
              <th key={h} style={{ ...thSt, textAlign: h === 'Acciones' ? 'right' : 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.map((c: Record<string, unknown>) => {
            const id  = c.id as string;
            const det = (c.detalle_colacion as Record<string, unknown>[]) ?? [];
            const ni  = (c.n_inscritos as number) ?? 0;
            const ct  = (c.costo_total as number) ?? 0;
            const cpp = ni > 0 ? Math.round(ct / ni) : null;
            const open = expanded.has(id);

            return [
              <tr key={id} onClick={() => toggle(id)}
                style={{ borderBottom: '1px solid var(--bo)', cursor: 'pointer', transition: 'background 0.12s', background: open ? 'var(--al)' : 'transparent' }}
                onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg)'; }}
                onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
              >
                <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {fmtFecha(c.fecha as string)}
                </td>
                <td style={tdSt}>
                  <ResponsableChip nombre={c.responsable_nombre as string} />
                </td>
                <td style={{ ...tdSt, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                  {c.menu as string}
                </td>
                <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums' }}>
                  {ni === 0
                    ? <span style={{ fontSize: '10px', color: '#9CA3AF', background: '#F3F4F6', padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>Histórico</span>
                    : <><strong>{ni}</strong> <span style={{ color: 'var(--ts)', fontSize: '12px' }}>personas</span></>
                  }
                </td>
                {verCostos && (
                  <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: ct > 0 ? 'var(--tx)' : 'var(--ts)' }}>
                    {ct > 0 ? formatCLP(ct) : '—'}
                  </td>
                )}
                {verCostos && (
                  <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: 'var(--ac)', fontWeight: cpp ? 700 : 400 }}>
                    {cpp ? formatCLP(cpp) : <span style={{ color: 'var(--ts)' }}>—</span>}
                  </td>
                )}
                <td style={{ ...tdSt, textAlign: 'right', width: isAdmin ? '120px' : '48px' }}>
                  {isAdmin ? <RowActions open={open} editing={editingId === id} onEdit={() => { setExpanded(s => new Set(s).add(id)); startEdit(id, det, ni); }} onDelete={() => deleteRecord(id)} /> : <ExpandBtn open={open} />}
                </td>
              </tr>,

              open && (
                <tr key={`${id}-det`}>
                  <td colSpan={verCostos ? 7 : 5} style={{ background: 'var(--al)', padding: '0 0 2px' }}>
                    <div style={{ padding: '16px 20px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>

                      {/* Meta */}
                      <div style={{ minWidth: '180px' }}>
                        <DetailLabel>Quién / cuándo</DetailLabel>
                        <MetaRow icon="👤" label="Responsable" value={c.responsable_nombre as string} />
                        {!!c.created_at && <MetaRow icon="🕐" label="Hora registro" value={fmtHora(c.created_at as string) ?? '—'} />}
                        {editingId === id && isAdmin && (
                          <div style={{ marginTop: '10px' }}>
                            <DetailLabel>Fecha registro</DetailLabel>
                            <input
                              type="date"
                              value={editFecha}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setEditFecha(e.target.value)}
                              style={{ width: '140px', padding: '5px 8px', fontSize: '13px', borderRadius: '5px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', fontFamily: "'Space Grotesk', sans-serif" }}
                            />
                          </div>
                        )}
                        <div style={{ marginTop: '10px' }}>
                          <DetailLabel>Inscritos</DetailLabel>
                          {editingId === id ? (
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={editInscritos}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setEditInscritos(parseInt(e.target.value, 10) || 0)}
                              style={{ width: '110px', padding: '5px 8px', fontSize: '13px', borderRadius: '5px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', fontFamily: "'Space Grotesk', sans-serif" }}
                            />
                          ) : (
                            <p style={{ fontSize: '13px', color: 'var(--tx)', margin: 0, fontWeight: 600 }}>
                              {ni > 0 ? `${ni} personas` : 'Histórico'}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Ingredientes */}
                      {(det.length > 0 || editingId === id) && (
                        <div style={{ flex: 1, minWidth: '240px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ingredientes utilizados</span>
                            {editingId === id && (
                              <>
                                <button onClick={e => { e.stopPropagation(); addRow(); }} disabled={saving}
                                  style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--al)', color: 'var(--ac)', border: '1px solid var(--ac)', cursor: 'pointer', fontWeight: 700 }}>
                                  + A&ntilde;adir producto
                                </button>
                                <button onClick={e => { e.stopPropagation(); saveEditCol(id, det); }} disabled={saving}
                                  style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#0D9373', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                                  {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                                <button onClick={e => { e.stopPropagation(); cancelEdit(); }}
                                  style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--bo)', color: 'var(--ts)', border: 'none', cursor: 'pointer' }}>
                                  Cancelar
                                </button>
                              </>
                            )}
                          </div>
                          {saveErr && <p style={{ color: 'var(--rd)', fontSize: '11px', margin: '0 0 6px' }}>{saveErr}</p>}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {det.filter(d => !deletedIds.has(d.id as string)).map((d, i) => {
                              const isEditing = editingId === id;
                              const qty = isEditing ? (editValues[d.id as string] ?? (d.cantidad as number)) : (d.cantidad as number);
                              const costoUnitarioEdit = Number(d.costo_unitario) || (Number(d.cantidad) > 0 ? Number(d.costo_total) / Number(d.cantidad) : 0);
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--sf)', borderRadius: '7px', padding: '7px 12px' }}>
                                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--tx)' }}>{d.nombre_producto as string}</span>
                                  {isEditing ? (
                                    <>
                                      <input type="number" value={qty} min={0} step="any"
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => setEditValues(v => ({ ...v, [d.id as string]: parseFloat(e.target.value) || 0 }))}
                                        style={{ width: '80px', padding: '3px 6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', textAlign: 'right' }} />
                                      <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{d.unidad_medida as string}</span>
                                      {verCostos && (
                                        <span style={{ fontSize: '11px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>
                                          {formatCLP(Math.round(qty * costoUnitarioEdit))}
                                        </span>
                                      )}
                                      {isAdmin && (
                                        <button
                                          type="button"
                                          onClick={e => { e.stopPropagation(); removeDetalle(d.id as string); }}
                                          title="Quitar ingrediente"
                                          style={{ border: 'none', background: 'transparent', color: '#B91C1C', cursor: 'pointer', fontSize: '16px', lineHeight: 1, fontWeight: 700, padding: '0 2px' }}
                                        >
                                          x
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <span style={{ fontSize: '12px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>{qty} {d.unidad_medida as string}</span>
                                      {verCostos && (d.costo_total as number) > 0 && (
                                        <span style={{ fontSize: '11px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>{formatCLP(d.costo_total as number)}</span>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            })}
                            {editingId === id && newRows.map(row => {
                              const p = row.codigo_producto ? productosMap.get(row.codigo_producto) : undefined;
                              const qty = Number(row.cantidad) || 0;
                              const costoUnitario = Number(p?.costo_promedio) || 0;
                              return (
                                <div key={row.localId} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--al)', borderRadius: '7px', padding: '7px 12px', border: '1px dashed var(--bo)' }}>
                                  <SearchablePicker
                                    value={row.codigo_producto}
                                    options={productoOptions}
                                    placeholder="Buscar por nombre o código"
                                    width="300px"
                                    onChange={value => setNewRows(v => v.map(x => x.localId === row.localId ? { ...x, codigo_producto: value } : x))}
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={row.cantidad}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => setNewRows(v => v.map(x => x.localId === row.localId ? { ...x, cantidad: parseFloat(e.target.value) || 0 } : x))}
                                    style={{ width: '80px', padding: '3px 6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', textAlign: 'right' }}
                                  />
                                  <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{String(p?.unidad_medida ?? '')}</span>
                                  <span style={{ fontSize: '11px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>{formatCLP(Math.round(qty * costoUnitario))}</span>
                                  <button type="button" onClick={e => { e.stopPropagation(); setNewRows(v => v.filter(x => x.localId !== row.localId)); }} style={{ border: 'none', background: 'transparent', color: 'var(--rd)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── TablaMermas ─────────────────────────────────────────────────────────────

function TablaFrutas({ datos, isAdmin, onRefresh, verCostos, productos }: { datos: Record<string, unknown>[]; canEdit: boolean; isAdmin: boolean; onRefresh: () => void; verCostos: boolean; productos: Record<string, unknown>[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [editFecha, setEditFecha] = useState('');
  const [newRows, setNewRows] = useState<Array<{ localId: string; codigo_producto: string; cantidad: number }>>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const productosMap = new Map(productos.map(p => [p.codigo as string, p]));

  const toggle = (id: string) => {
    setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    if (editingId === id) { setEditingId(null); setEditValues({}); setEditFecha(''); setNewRows([]); setDeletedIds(new Set()); setSaveErr(''); }
  };
  const startEdit = (id: string, det: Record<string, unknown>[]) => {
    const vals: Record<string, number> = {};
    det.forEach(d => { vals[d.id as string] = d.cantidad as number; });
    const fechaActual = String(datos.find(f => (f.id as string) === id)?.fecha ?? '');
    setEditingId(id); setEditValues(vals); setEditFecha(fechaActual); setNewRows([]); setDeletedIds(new Set()); setSaveErr('');
  };
  const cancelEdit = () => { setEditingId(null); setEditValues({}); setEditFecha(''); setNewRows([]); setDeletedIds(new Set()); setSaveErr(''); };
  const addRow = () => setNewRows(rows => [...rows, { localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`, codigo_producto: '', cantidad: 1 }]);
  const removeDetalle = (id: string) => {
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const productoOptions = useMemo(() => productos.map(prod => ({
    value: prod.codigo as string,
    label: `${prod.codigo as string} · ${prod.nombre as string}`,
    searchText: [prod.codigo, prod.nombre, prod.unidad_medida].filter(Boolean).join(' '),
  })), [productos]);
  const saveEditFrutas = async (frutaId: string, det: Record<string, unknown>[]) => {
    setSaving(true); setSaveErr('');
    try {
      const detalle = det
        .filter(d => !deletedIds.has(d.id as string))
        .map(d => ({ id: d.id as string, cantidad: editValues[d.id as string] ?? (d.cantidad as number) }));
      const nuevos = newRows.map(r => {
        const p = productosMap.get(r.codigo_producto);
        const costoUnitario = Number(p?.costo_promedio) || 0;
        const cantidad = Number(r.cantidad) || 0;
        return {
          codigo_producto: r.codigo_producto,
          nombre_producto: p?.nombre ?? '',
          cantidad,
          unidad_medida: p?.unidad_medida ?? null,
          costo_unitario: costoUnitario,
          costo_total: Math.round(cantidad * costoUnitario),
        };
      }).filter(r => r.codigo_producto);
      const res = await fetch('/api/frutas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fruta_id: frutaId, fecha: isAdmin ? editFecha : undefined, delete_ids: [...deletedIds], detalle: [...detalle, ...nuevos] }) });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setEditingId(null); setEditValues({}); setEditFecha(''); setNewRows([]); setDeletedIds(new Set()); onRefresh();
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : 'Error guardando'); }
    finally { setSaving(false); }
  };
  const deleteRecord = async (frutaId: string) => {
    if (!confirm('BORRAR este informe de frutas?')) return;
    const res = await fetch('/api/frutas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fruta_id: frutaId }) });
    if (!res.ok) {
      const j = await res.json();
      setSaveErr(j.error ?? 'Error borrando');
      return;
    }
    onRefresh();
  };

  if (!datos.length) return <Empty msg="No hay informes de frutas registrados en este período." />;

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
        <thead>
          <tr>
            {['Fecha', 'Responsable', 'Frutas', 'Lineas', ...(verCostos ? ['Costo total'] : []), 'Acciones'].map(h => (
              <th key={h} style={{ ...thSt, textAlign: h === 'Acciones' ? 'right' : 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.map((f: Record<string, unknown>) => {
            const id = f.id as string;
            const det = (f.detalle_frutas as Record<string, unknown>[]) ?? [];
            const ct = (f.costo_total as number) ?? det.reduce((s, d) => s + ((d.costo_total as number) ?? 0), 0);
            const open = expanded.has(id);
            const preview = det.slice(0, 3).map(d => d.nombre_producto as string);
            const extra = det.length > 3 ? det.length - 3 : 0;

            return [
              <tr key={id} onClick={() => toggle(id)}
                style={{ borderBottom: '1px solid var(--bo)', cursor: 'pointer', transition: 'background 0.12s', background: open ? 'var(--al)' : 'transparent' }}
                onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg)'; }}
                onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
              >
                <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtFecha(f.fecha as string)}</td>
                <td style={tdSt}><ResponsableChip nombre={f.responsable_nombre as string} /></td>
                <td style={{ ...tdSt, maxWidth: '300px' }}>
                  {det.length === 0 ? (
                    <span style={{ color: 'var(--ts)' }}>Sin detalle</span>
                  ) : (
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {preview.map((n, i) => (
                        <span key={i} style={{ fontSize: '11px', background: '#ECFDF5', color: '#065F46', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, whiteSpace: 'nowrap' }}>{n}</span>
                      ))}
                      {extra > 0 && <span style={{ fontSize: '11px', color: 'var(--ts)' }}>+{extra} mas</span>}
                    </div>
                  )}
                </td>
                <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums' }}>{det.length}</td>
                {verCostos && (
                  <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: ct > 0 ? 'var(--ac)' : 'var(--ts)', fontWeight: ct > 0 ? 700 : 400 }}>
                    {ct > 0 ? formatCLP(ct) : '—'}
                  </td>
                )}
                <td style={{ ...tdSt, textAlign: 'right', width: isAdmin ? '120px' : '48px' }}>
                  {isAdmin ? <RowActions open={open} editing={editingId === id} onEdit={() => { setExpanded(s => new Set(s).add(id)); startEdit(id, det); }} onDelete={() => deleteRecord(id)} /> : <ExpandBtn open={open} />}
                </td>
              </tr>,

              open && (
                <tr key={`${id}-det`}>
                  <td colSpan={verCostos ? 6 : 5} style={{ background: 'var(--al)', padding: '0 0 2px' }}>
                    <div style={{ padding: '16px 20px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: '180px' }}>
                        <DetailLabel>Quién / cuándo</DetailLabel>
                        <MetaRow icon="👤" label="Responsable" value={f.responsable_nombre as string} />
                        {!!f.created_at && <MetaRow icon="🕐" label="Hora registro" value={fmtHora(f.created_at as string) ?? '—'} />}
                        {editingId === id && isAdmin && (
                          <div style={{ marginTop: '10px' }}>
                            <DetailLabel>Fecha registro</DetailLabel>
                            <input type="date" value={editFecha} onClick={e => e.stopPropagation()} onChange={e => setEditFecha(e.target.value)}
                              style={{ width: '140px', padding: '5px 8px', fontSize: '13px', borderRadius: '5px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', fontFamily: "'Space Grotesk', sans-serif" }}
                            />
                          </div>
                        )}
                        {(f.observacion as string) && (
                          <div style={{ marginTop: '10px' }}>
                            <DetailLabel>Observación</DetailLabel>
                            <p style={{ fontSize: '13px', color: 'var(--tx)', margin: 0, lineHeight: 1.5, maxWidth: '280px' }}>{f.observacion as string}</p>
                          </div>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: '240px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Frutas entregadas</span>
                          {editingId === id && (
                            <>
                              <button onClick={e => { e.stopPropagation(); addRow(); }} disabled={saving}
                                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--al)', color: 'var(--ac)', border: '1px solid var(--ac)', cursor: 'pointer', fontWeight: 700 }}>
                                + A&ntilde;adir fruta
                              </button>
                              <button onClick={e => { e.stopPropagation(); saveEditFrutas(id, det); }} disabled={saving}
                                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#0D9373', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                                {saving ? 'Guardando...' : 'Guardar'}
                              </button>
                              <button onClick={e => { e.stopPropagation(); cancelEdit(); }}
                                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--bo)', color: 'var(--ts)', border: 'none', cursor: 'pointer' }}>
                                Cancelar
                              </button>
                            </>
                          )}
                        </div>
                        {saveErr && <p style={{ color: 'var(--rd)', fontSize: '11px', margin: '0 0 6px' }}>{saveErr}</p>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {det.filter(d => !deletedIds.has(d.id as string)).map((d, i) => {
                            const isEditing = editingId === id;
                            const qty = isEditing ? (editValues[d.id as string] ?? (d.cantidad as number)) : (d.cantidad as number);
                            const costoUnitarioEdit = Number(d.costo_unitario) || (Number(d.cantidad) > 0 ? Number(d.costo_total) / Number(d.cantidad) : 0);
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--sf)', borderRadius: '7px', padding: '7px 12px' }}>
                                <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--tx)' }}>{d.nombre_producto as string}</span>
                                {isEditing ? (
                                  <>
                                    <input type="number" value={qty} min={0} step="any" onClick={e => e.stopPropagation()} onChange={e => setEditValues(v => ({ ...v, [d.id as string]: parseFloat(e.target.value) || 0 }))}
                                      style={{ width: '80px', padding: '3px 6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', textAlign: 'right' }} />
                                    <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{d.unidad_medida as string}</span>
                                    {verCostos && <span style={{ fontSize: '11px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>{formatCLP(Math.round(qty * costoUnitarioEdit))}</span>}
                                    {isAdmin && (
                                      <button type="button" onClick={e => { e.stopPropagation(); removeDetalle(d.id as string); }} title="Quitar linea"
                                        style={{ border: 'none', background: 'transparent', color: '#B91C1C', cursor: 'pointer', fontSize: '16px', lineHeight: 1, fontWeight: 700, padding: '0 2px' }}>
                                        ×
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span style={{ fontSize: '12px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>{qty} {d.unidad_medida as string}</span>
                                    {verCostos && (d.costo_total as number) > 0 && <span style={{ fontSize: '11px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>{formatCLP(d.costo_total as number)}</span>}
                                  </>
                                )}
                              </div>
                            );
                          })}
                          {editingId === id && newRows.map(row => {
                            const p = row.codigo_producto ? productosMap.get(row.codigo_producto) : undefined;
                            const qty = Number(row.cantidad) || 0;
                            const costoUnitario = Number(p?.costo_promedio) || 0;
                            return (
                              <div key={row.localId} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--al)', borderRadius: '7px', padding: '7px 12px', border: '1px dashed var(--bo)' }}>
                                <SearchablePicker
                                  value={row.codigo_producto}
                                  options={productoOptions}
                                  placeholder="Buscar por nombre o código"
                                  width="300px"
                                  onChange={value => setNewRows(v => v.map(x => x.localId === row.localId ? { ...x, codigo_producto: value } : x))}
                                />
                                <input type="number" min={0} step="any" value={row.cantidad} onClick={e => e.stopPropagation()} onChange={e => setNewRows(v => v.map(x => x.localId === row.localId ? { ...x, cantidad: parseFloat(e.target.value) || 0 } : x))}
                                  style={{ width: '80px', padding: '3px 6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', textAlign: 'right' }}
                                />
                                <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{String(p?.unidad_medida ?? '')}</span>
                                {verCostos && <span style={{ fontSize: '11px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>{formatCLP(Math.round(qty * costoUnitario))}</span>}
                                <button type="button" onClick={e => { e.stopPropagation(); setNewRows(v => v.filter(x => x.localId !== row.localId)); }} style={{ border: 'none', background: 'transparent', color: 'var(--rd)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function TablaInventario({ datos, isAdmin, onRefresh, productos }: { datos: Record<string, unknown>[]; isAdmin: boolean; onRefresh: () => void; productos: Record<string, unknown>[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [editFecha, setEditFecha] = useState('');
  const [newRows, setNewRows] = useState<Array<{ localId: string; ubicacion: string; codigo_producto: string; cantidad: number }>>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const productosMap = new Map(productos.map(p => [p.codigo as string, p]));
  const productoOptions = useMemo(() => productos.map(prod => ({
    value: prod.codigo as string,
    label: `${prod.codigo as string} · ${prod.nombre as string}`,
    searchText: [prod.codigo, prod.nombre, prod.unidad_medida].filter(Boolean).join(' '),
  })), [productos]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (editingId === id) {
      setEditingId(null);
      setEditValues({});
      setEditFecha('');
      setNewRows([]);
      setDeletedIds(new Set());
      setSaveErr('');
    }
  };

  const startEdit = (id: string, det: Record<string, unknown>[]) => {
    const vals: Record<string, number> = {};
    det.forEach(d => { vals[d.id as string] = d.cantidad as number; });
    const fechaActual = String(datos.find(item => (item.id as string) === id)?.fecha ?? '');
    setEditingId(id);
    setEditValues(vals);
    setEditFecha(fechaActual);
    setNewRows([]);
    setDeletedIds(new Set());
    setSaveErr('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
    setEditFecha('');
    setNewRows([]);
    setDeletedIds(new Set());
    setSaveErr('');
  };

  const addRow = () => {
    setNewRows(rows => [...rows, {
      localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ubicacion: 'CAMARA CONGELADOS',
      codigo_producto: '',
      cantidad: 1,
    }]);
  };

  const removeDetalle = (id: string) => {
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const saveEditInventario = async (inventarioId: string, det: Record<string, unknown>[], observacion: string) => {
    setSaving(true);
    setSaveErr('');
    try {
      const detalle = det
        .filter(d => !deletedIds.has(d.id as string))
        .map(d => ({
          id: d.id as string,
          ubicacion: String(d.ubicacion ?? ''),
          cantidad: editValues[d.id as string] ?? (d.cantidad as number),
        }));

      const nuevos = newRows.map(row => {
        const producto = productosMap.get(row.codigo_producto);
        return {
          ubicacion: row.ubicacion,
          codigo_producto: row.codigo_producto,
          nombre_producto: producto?.nombre ?? '',
          cantidad: Number(row.cantidad) || 0,
          unidad_medida: String(producto?.unidad_medida ?? ''),
        };
      }).filter(row => row.codigo_producto);

      const res = await fetch('/api/inventario', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventario_id: inventarioId,
          fecha: editFecha,
          observacion,
          delete_ids: [...deletedIds],
          detalle: [...detalle, ...nuevos],
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Error guardando inventario');
      }
      setEditingId(null);
      setEditValues({});
      setEditFecha('');
      setNewRows([]);
      setDeletedIds(new Set());
      onRefresh();
    } catch (error: unknown) {
      setSaveErr(error instanceof Error ? error.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (inventarioId: string) => {
    if (!confirm('BORRAR este inventario?')) return;
    const res = await fetch('/api/inventario', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventario_id: inventarioId }),
    });
    if (!res.ok) {
      const json = await res.json();
      setSaveErr(json.error ?? 'Error borrando');
      return;
    }
    onRefresh();
  };

  if (!datos.length) return <Empty msg="No hay tomas de inventario registradas en este periodo." />;

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
        <thead>
          <tr>
            {['Fecha', 'Responsable', 'Ubicaciones', 'Lineas', 'Acciones'].map(h => <th key={h} style={{ ...thSt, textAlign: h === 'Acciones' ? 'right' : 'left' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {datos.map((inventario: Record<string, unknown>) => {
            const id = inventario.id as string;
            const det = (inventario.detalle_inventario as Record<string, unknown>[]) ?? [];
            const open = expanded.has(id);
            const ubicaciones = Array.from(new Set(det.map(item => String(item.ubicacion ?? '')).filter(Boolean)));
            const preview = ubicaciones.slice(0, 2);
            const extra = ubicaciones.length > 2 ? ubicaciones.length - 2 : 0;
            const observacion = String(inventario.observacion ?? '');

            return [
              <tr
                key={id}
                onClick={() => toggle(id)}
                style={{ borderBottom: '1px solid var(--bo)', cursor: 'pointer', transition: 'background 0.12s', background: open ? 'var(--al)' : 'transparent' }}
                onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg)'; }}
                onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
              >
                <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtFecha(inventario.fecha as string)}</td>
                <td style={tdSt}><ResponsableChip nombre={inventario.responsable_nombre as string} /></td>
                <td style={{ ...tdSt, maxWidth: '320px' }}>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {preview.map(ubicacion => <Chip key={ubicacion} label={ubicacion} color="#2563EB" />)}
                    {extra > 0 && <span style={{ fontSize: '11px', color: 'var(--ts)' }}>+{extra} mas</span>}
                  </div>
                </td>
                <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums' }}>{det.length}</td>
                <td style={{ ...tdSt, textAlign: 'right', width: isAdmin ? '120px' : '48px' }}>
                  {isAdmin ? <RowActions open={open} editing={editingId === id} onEdit={() => { setExpanded(s => new Set(s).add(id)); startEdit(id, det); }} onDelete={() => deleteRecord(id)} /> : <ExpandBtn open={open} />}
                </td>
              </tr>,
              open && (
                <tr key={`${id}-det`}>
                  <td colSpan={5} style={{ background: 'var(--al)', padding: '0 0 2px' }}>
                    <div style={{ padding: '16px 20px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: '190px' }}>
                        <DetailLabel>Quién / cuándo</DetailLabel>
                        <MetaRow icon="👤" label="Responsable" value={String(inventario.responsable_nombre ?? '')} />
                        {!!inventario.created_at && <MetaRow icon="🕐" label="Hora registro" value={fmtHora(inventario.created_at as string) ?? '-'} />}
                        {editingId === id && (
                          <div style={{ marginTop: '10px' }}>
                            <DetailLabel>Fecha registro</DetailLabel>
                            <input
                              type="date"
                              value={editFecha}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setEditFecha(e.target.value)}
                              style={{ width: '140px', padding: '5px 8px', fontSize: '13px', borderRadius: '5px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)' }}
                            />
                          </div>
                        )}
                        {observacion && (
                          <div style={{ marginTop: '10px' }}>
                            <DetailLabel>Observacion</DetailLabel>
                            <p style={{ fontSize: '13px', color: 'var(--tx)', margin: 0, lineHeight: 1.5, maxWidth: '280px' }}>{observacion}</p>
                          </div>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: '260px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stock registrado</span>
                          {isAdmin && editingId === id && (
                            <>
                              <button
                                onClick={e => { e.stopPropagation(); addRow(); }}
                                disabled={saving}
                                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--al)', color: 'var(--ac)', border: '1px solid var(--ac)', cursor: 'pointer', fontWeight: 700 }}
                              >
                                + Anadir linea
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); saveEditInventario(id, det, observacion); }}
                                disabled={saving}
                                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#0D9373', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                              >
                                {saving ? 'Guardando...' : 'Guardar'}
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); cancelEdit(); }}
                                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--bo)', color: 'var(--ts)', border: 'none', cursor: 'pointer' }}
                              >
                                Cancelar
                              </button>
                            </>
                          )}
                        </div>
                        {saveErr && <p style={{ color: 'var(--rd)', fontSize: '11px', margin: '0 0 6px' }}>{saveErr}</p>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {det.filter(d => !deletedIds.has(d.id as string)).map(item => {
                            const isEditing = editingId === id;
                            const qty = isEditing ? (editValues[item.id as string] ?? (item.cantidad as number)) : (item.cantidad as number);
                            return (
                              <div key={String(item.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--sf)', borderRadius: '7px', padding: '8px 12px', flexWrap: 'wrap' }}>
                                <Chip label={String(item.ubicacion ?? '')} color="#2563EB" />
                                <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--tx)' }}>{String(item.nombre_producto ?? '')}</span>
                                {isEditing ? (
                                  <>
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={qty}
                                      onClick={e => e.stopPropagation()}
                                      onChange={e => setEditValues(v => ({ ...v, [item.id as string]: parseFloat(e.target.value) || 0 }))}
                                      style={{ width: '82px', padding: '3px 6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', textAlign: 'right' }}
                                    />
                                    <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{String(item.unidad_medida ?? '')}</span>
                                    <button
                                      type="button"
                                      onClick={e => { e.stopPropagation(); removeDetalle(item.id as string); }}
                                      style={{ border: 'none', background: 'transparent', color: '#B91C1C', cursor: 'pointer', fontSize: '16px', lineHeight: 1, fontWeight: 700, padding: '0 2px' }}
                                    >
                                      ×
                                    </button>
                                  </>
                                ) : (
                                  <span style={{ fontSize: '12px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>
                                    {qty} {String(item.unidad_medida ?? '')}
                                  </span>
                                )}
                              </div>
                            );
                          })}

                          {editingId === id && newRows.map(row => {
                            const producto = row.codigo_producto ? productosMap.get(row.codigo_producto) : undefined;
                            return (
                              <div key={row.localId} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--al)', borderRadius: '7px', padding: '8px 12px', border: '1px dashed var(--bo)', flexWrap: 'wrap' }}>
                                <select
                                  value={row.ubicacion}
                                  onChange={e => setNewRows(v => v.map(item => item.localId === row.localId ? { ...item, ubicacion: e.target.value } : item))}
                                  style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--bo)', background: 'var(--bg)', color: 'var(--tx)' }}
                                >
                                  <option value="CAMARA CONGELADOS">CAMARA CONGELADOS</option>
                                  <option value="CAMARA MANTENCION">CAMARA MANTENCION</option>
                                  <option value="BODEGA SECA">BODEGA SECA</option>
                                  <option value="SALAD BAR">SALAD BAR</option>
                                  <option value="DESPACHO">DESPACHO</option>
                                  <option value="COCINA">COCINA</option>
                                  <option value="MUEBLE DE ASEO">MUEBLE DE ASEO</option>
                                  <option value="VITRINA">VITRINA</option>
                                  <option value="CAMARA BRYAN">CAMARA BRYAN</option>
                                  <option value="BODEGA PASTELERIA">BODEGA PASTELERIA</option>
                                </select>
                                <SearchablePicker
                                  value={row.codigo_producto}
                                  options={productoOptions}
                                  placeholder="Buscar producto"
                                  width="300px"
                                  onChange={value => setNewRows(v => v.map(item => item.localId === row.localId ? { ...item, codigo_producto: value } : item))}
                                />
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={row.cantidad}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => setNewRows(v => v.map(item => item.localId === row.localId ? { ...item, cantidad: parseFloat(e.target.value) || 0 } : item))}
                                  style={{ width: '82px', padding: '3px 6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', textAlign: 'right' }}
                                />
                                <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{String(producto?.unidad_medida ?? '')}</span>
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); setNewRows(v => v.filter(item => item.localId !== row.localId)); }}
                                  style={{ border: 'none', background: 'transparent', color: 'var(--rd)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

const MOTIVO_COLOR: Record<string, string> = {
  ...MOTIVO_MERMA_COLOR,
};

function TablaMermas({ datos, canEdit, isAdmin, onRefresh, verCostos, productos }: { datos: Record<string, unknown>[]; canEdit: boolean; isAdmin: boolean; onRefresh: () => void; verCostos: boolean; productos: Record<string, unknown>[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFecha, setEditFecha] = useState('');
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [newRows, setNewRows] = useState<Array<{ localId: string; codigo_producto: string; cantidad: number; motivo: string }>>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const productosMap = new Map(productos.map(p => [p.codigo as string, p]));

  const toggle = (id: string) => {
    setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    if (editingId === id) { setEditingId(null); setEditValues({}); setEditFecha(''); setNewRows([]); setDeletedIds(new Set()); setSaveErr(''); }
  };
  const startEdit = (id: string, det: Record<string, unknown>[]) => {
    const vals: Record<string, number> = {};
    det.forEach(d => { vals[d.id as string] = d.cantidad as number; });
    const fechaActual = String(datos.find(m => (m.id as string) === id)?.fecha ?? '');
    setEditingId(id); setEditValues(vals); setEditFecha(fechaActual); setNewRows([]); setDeletedIds(new Set()); setSaveErr('');
  };
  const cancelEdit = () => { setEditingId(null); setEditValues({}); setEditFecha(''); setNewRows([]); setDeletedIds(new Set()); setSaveErr(''); };
  const addRow = () => setNewRows(rows => [...rows, { localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`, codigo_producto: '', cantidad: 1, motivo: '' }]);
  const removeDetalle = (id: string) => {
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const productoOptions = useMemo(() => productos.map(prod => ({
    value: prod.codigo as string,
    label: `${prod.codigo as string} · ${prod.nombre as string}`,
    searchText: [prod.codigo, prod.nombre, prod.unidad_medida].filter(Boolean).join(' '),
  })), [productos]);
  const saveEditMer = async (mermaId: string, det: Record<string, unknown>[]) => {
    setSaving(true); setSaveErr('');
    try {
      const detalle = det
        .filter(d => !deletedIds.has(d.id as string))
        .map(d => ({ id: d.id as string, cantidad: editValues[d.id as string] ?? (d.cantidad as number) }));
      const nuevos = newRows.map(r => {
        const p = productosMap.get(r.codigo_producto);
        const costoUnitario = Number(p?.costo_promedio) || 0;
        const cantidad = Number(r.cantidad) || 0;
        return {
          codigo_producto: r.codigo_producto,
          nombre_producto: p?.nombre ?? '',
          cantidad,
          unidad_medida: p?.unidad_medida ?? null,
          motivo: normalizeMotivoMerma(r.motivo),
          costo_unitario: costoUnitario,
          costo_total: Math.round(cantidad * costoUnitario),
        };
      }).filter(r => r.codigo_producto);
      const res = await fetch('/api/mermas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merma_id: mermaId, fecha: isAdmin ? editFecha : undefined, delete_ids: [...deletedIds], detalle: [...detalle, ...nuevos] }) });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setEditingId(null); setEditValues({}); setEditFecha(''); setNewRows([]); setDeletedIds(new Set()); onRefresh();
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : 'Error guardando'); }
    finally { setSaving(false); }
  };
  const deleteRecord = async (mermaId: string) => {
    if (!confirm('BORRAR esta merma?')) return;
    const res = await fetch('/api/mermas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merma_id: mermaId }) });
    if (!res.ok) {
      const j = await res.json();
      setSaveErr(j.error ?? 'Error borrando');
      return;
    }
    onRefresh();
  };

  if (!datos.length) return <Empty msg="No hay mermas registradas en este período." />;

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
        <thead>
          <tr>
            {['Fecha', 'Responsable', 'Qué se perdió', 'Motivos', 'Productos', ...(verCostos ? ['Pérdida'] : []), 'Acciones'].map(h => (
              <th key={h} style={{ ...thSt, textAlign: h === 'Acciones' ? 'right' : 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.map((m: Record<string, unknown>) => {
            const id  = m.id as string;
            const det = (m.detalle_mermas as Record<string, unknown>[]) ?? [];
            const platos = (m.detalle_mermas_platos as Record<string, unknown>[]) ?? [];
            const ct  = det.reduce((s, d) => s + ((d.costo_total as number) ?? 0), 0);
            const open = expanded.has(id);
            // Preview: first 2 products
            const preview = det.slice(0, 2).map(d => d.nombre_producto as string);
            const extra   = det.length > 2 ? det.length - 2 : 0;
            // Unique motivos
            const motivos = [...new Set(det.map(d => normalizeMotivoMerma(d.motivo)).filter((mot): mot is NonNullable<ReturnType<typeof normalizeMotivoMerma>> => Boolean(mot)))];

            return [
              <tr key={id} onClick={() => toggle(id)}
                style={{ borderBottom: '1px solid var(--bo)', cursor: 'pointer', transition: 'background 0.12s', background: open ? '#FEF2F2' : 'transparent' }}
                onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg)'; }}
                onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
              >
                <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {fmtFecha(m.fecha as string)}
                </td>
                <td style={tdSt}>
                  <ResponsableChip nombre={m.responsable_nombre as string} />
                </td>
                <td style={{ ...tdSt, maxWidth: '260px' }}>
                  {det.length === 0 ? (
                    <span style={{ color: 'var(--ts)' }}>Sin detalle</span>
                  ) : (
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {preview.map((n, i) => (
                        <span key={i} style={{ fontSize: '11px', background: '#FEE2E2', color: '#991B1B', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, whiteSpace: 'nowrap' }}>{n}</span>
                      ))}
                      {extra > 0 && <span style={{ fontSize: '11px', color: 'var(--ts)' }}>+{extra} más</span>}
                    </div>
                  )}
                </td>
                <td style={{ ...tdSt, maxWidth: '180px' }}>
                  {motivos.length === 0 ? (
                    <span style={{ color: 'var(--ts)', fontSize: '12px' }}>—</span>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {motivos.slice(0, 2).map(mot => (
                        <Chip key={mot} label={mot} color={MOTIVO_COLOR[mot] ?? '#6B7280'} />
                      ))}
                      {motivos.length > 2 && <span style={{ fontSize: '11px', color: 'var(--ts)' }}>+{motivos.length - 2}</span>}
                    </div>
                  )}
                </td>
                <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums' }}>
                  {det.length}
                </td>
                {verCostos && (
                  <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: ct > 0 ? '#DC2626' : 'var(--ts)', fontWeight: ct > 0 ? 700 : 400 }}>
                    {ct > 0 ? formatCLP(ct) : '—'}
                  </td>
                )}
                <td style={{ ...tdSt, textAlign: 'right', width: isAdmin ? '120px' : '48px' }}>
                  {isAdmin ? <RowActions open={open} editing={editingId === id} onEdit={() => { setExpanded(s => new Set(s).add(id)); startEdit(id, det); }} onDelete={() => deleteRecord(id)} /> : <ExpandBtn open={open} />}
                </td>
              </tr>,

              open && (
                <tr key={`${id}-det`}>
                  <td colSpan={verCostos ? 7 : 6} style={{ background: '#FEF2F2', padding: '0 0 2px' }}>
                    <div style={{ padding: '16px 20px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>

                      {/* Meta */}
                      <div style={{ minWidth: '180px' }}>
                        <DetailLabel>Quién / cuándo</DetailLabel>
                        <MetaRow icon="👤" label="Responsable" value={m.responsable_nombre as string} />
                        {!!m.created_at && <MetaRow icon="🕐" label="Hora registro" value={fmtHora(m.created_at as string) ?? '—'} />}
                        {editingId === id && isAdmin && (
                          <div style={{ marginTop: '10px' }}>
                            <DetailLabel>Fecha registro</DetailLabel>
                            <input
                              type="date"
                              value={editFecha}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setEditFecha(e.target.value)}
                              style={{ width: '140px', padding: '5px 8px', fontSize: '13px', borderRadius: '5px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', fontFamily: "'Space Grotesk', sans-serif" }}
                            />
                          </div>
                        )}
                        {(m.observacion as string) && (
                          <div style={{ marginTop: '10px' }}>
                            <DetailLabel>Observación</DetailLabel>
                            <p style={{ fontSize: '13px', color: 'var(--tx)', margin: 0, lineHeight: 1.5, maxWidth: '280px' }}>{m.observacion as string}</p>
                          </div>
                        )}
                      </div>

                      {platos.length > 0 && (
                        <div style={{ flex: 1, minWidth: '300px' }}>
                          <DetailLabel>Platos preparados</DetailLabel>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {platos.map((plato, i) => {
                              const insumos = (plato.detalle_mermas_platos_insumos as Record<string, unknown>[] | undefined) ?? [];
                              const motivo = normalizeMotivoMerma(plato.motivo);
                              const motivoColor = motivo ? (MOTIVO_COLOR[motivo] ?? '#6B7280') : '#6B7280';
                              const observacionPlato = String(plato.observacion ?? '');
                              return (
                                <div key={i} style={{ background: 'var(--sf)', borderRadius: '8px', border: '1px solid #FECACA', padding: '10px 12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: insumos.length ? '8px' : 0, flexWrap: 'wrap' }}>
                                    <span style={{ flex: 1, minWidth: '180px', fontSize: '13px', fontWeight: 700, color: 'var(--tx)' }}>{plato.nombre_plato as string}</span>
                                    <span style={{ fontSize: '12px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>{Number(plato.cantidad) || 0} plato(s)</span>
                                    {motivo && (
                                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: `${motivoColor}18`, color: motivoColor, border: `1px solid ${motivoColor}40`, whiteSpace: 'nowrap' }}>
                                        {motivo}
                                      </span>
                                    )}
                                    {verCostos && Number(plato.costo_total) > 0 && (
                                      <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>{formatCLP(Number(plato.costo_total))}</span>
                                    )}
                                  </div>
                                  {observacionPlato && (
                                    <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--ts)' }}>{observacionPlato}</p>
                                  )}
                                  {insumos.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      {insumos.map((insumo, j) => (
                                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FEF2F2', borderRadius: '6px', padding: '6px 8px' }}>
                                          <span style={{ flex: 1, fontSize: '12px', color: 'var(--tx)' }}>{insumo.nombre as string}</span>
                                          <span style={{ fontSize: '11px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>
                                            {Number(insumo.cantidad_total) || 0} {String(insumo.unidad_medida ?? '')}
                                          </span>
                                          {verCostos && Number(insumo.costo_total) > 0 && (
                                            <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>{formatCLP(Number(insumo.costo_total))}</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Detalle */}
                      {(det.length > 0 || canEdit) && (
                        <div style={{ flex: 1, minWidth: '240px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Detalle de productos</span>
                            {editingId === id && (
                              <>
                                <button onClick={e => { e.stopPropagation(); addRow(); }} disabled={saving}
                                  style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--al)', color: 'var(--ac)', border: '1px solid var(--ac)', cursor: 'pointer', fontWeight: 700 }}>
                                  + A&ntilde;adir producto
                                </button>
                                <button onClick={e => { e.stopPropagation(); saveEditMer(id, det); }} disabled={saving}
                                  style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#0D9373', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                                  {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                                <button onClick={e => { e.stopPropagation(); cancelEdit(); }}
                                  style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--bo)', color: 'var(--ts)', border: 'none', cursor: 'pointer' }}>
                                  Cancelar
                                </button>
                              </>
                            )}
                          </div>
                          {saveErr && <p style={{ color: 'var(--rd)', fontSize: '11px', margin: '0 0 6px' }}>{saveErr}</p>}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {det.filter(d => !deletedIds.has(d.id as string)).map((d, i) => {
                              const isEditing = editingId === id;
                              const qty = isEditing ? (editValues[d.id as string] ?? (d.cantidad as number)) : (d.cantidad as number);
                              const motivo = normalizeMotivoMerma(d.motivo);
                              const motivoColor = motivo ? (MOTIVO_COLOR[motivo] ?? '#6B7280') : null;
                              const costoUnitarioEdit = Number(d.costo_unitario) || (Number(d.cantidad) > 0 ? Number(d.costo_total) / Number(d.cantidad) : 0);
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--sf)', borderRadius: '7px', padding: '7px 12px' }}>
                                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--tx)' }}>{d.nombre_producto as string}</span>
                                  {isEditing ? (
                                    <>
                                      <input type="number" value={qty} min={0} step="any"
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => setEditValues(v => ({ ...v, [d.id as string]: parseFloat(e.target.value) || 0 }))}
                                        style={{ width: '80px', padding: '3px 6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', textAlign: 'right' }} />
                                      <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{d.unidad_medida as string}</span>
                                      {verCostos && (
                                        <span style={{ fontSize: '11px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>
                                          {formatCLP(Math.round(qty * costoUnitarioEdit))}
                                        </span>
                                      )}
                                      {isAdmin && (
                                        <button
                                          type="button"
                                          onClick={e => { e.stopPropagation(); removeDetalle(d.id as string); }}
                                          title="Quitar linea"
                                          style={{ border: 'none', background: 'transparent', color: '#B91C1C', cursor: 'pointer', fontSize: '16px', lineHeight: 1, fontWeight: 700, padding: '0 2px' }}
                                        >
                                          x
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <span style={{ fontSize: '12px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>{qty} {d.unidad_medida as string}</span>
                                      {!isEditing && motivo && motivoColor && (
                                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: `${motivoColor}18`, color: motivoColor, border: `1px solid ${motivoColor}40`, whiteSpace: 'nowrap' }}>
                                          {motivo}
                                        </span>
                                      )}
                                      {verCostos && (d.costo_total as number) > 0 && (
                                        <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
                                          {formatCLP(d.costo_total as number)}
                                        </span>
                                      )}
                                      {isEditing && isAdmin && (
                                        <button
                                          type="button"
                                          onClick={e => { e.stopPropagation(); removeDetalle(d.id as string); }}
                                          title="Quitar linea"
                                          style={{ border: 'none', background: 'transparent', color: '#B91C1C', cursor: 'pointer', fontSize: '16px', lineHeight: 1, fontWeight: 700, padding: '0 2px' }}
                                        >
                                          ×
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            })}
                            {editingId === id && newRows.map(row => {
                              const p = row.codigo_producto ? productosMap.get(row.codigo_producto) : undefined;
                              const qty = Number(row.cantidad) || 0;
                              const costoUnitario = Number(p?.costo_promedio) || 0;
                              return (
                                <div key={row.localId} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--al)', borderRadius: '7px', padding: '7px 12px', border: '1px dashed var(--bo)' }}>
                                  <SearchablePicker
                                    value={row.codigo_producto}
                                    options={productoOptions}
                                    placeholder="Buscar por nombre o código"
                                    width="300px"
                                    onChange={value => setNewRows(v => v.map(x => x.localId === row.localId ? { ...x, codigo_producto: value } : x))}
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={row.cantidad}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => setNewRows(v => v.map(x => x.localId === row.localId ? { ...x, cantidad: parseFloat(e.target.value) || 0 } : x))}
                                    style={{ width: '80px', padding: '3px 6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', textAlign: 'right' }}
                                  />
                                  <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{String(p?.unidad_medida ?? '')}</span>
                                  <span style={{ fontSize: '11px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>{formatCLP(Math.round(qty * costoUnitario))}</span>
                                  <button type="button" onClick={e => { e.stopPropagation(); setNewRows(v => v.filter(x => x.localId !== row.localId)); }} style={{ border: 'none', background: 'transparent', color: 'var(--rd)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Empty ───────────────────────────────────────────────────────────────────

function Empty({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '52px 24px', textAlign: 'center', color: 'var(--ts)', fontSize: '14px' }}>
      <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.3 }}>📋</div>
      <p style={{ margin: 0 }}>{msg}</p>
    </div>
  );
}

// ─── Shortcuts ───────────────────────────────────────────────────────────────

function PeriodShortcuts({ desde, hasta, onSelect }: { desde: string; hasta: string; onSelect: (d: string, h: string) => void }) {
  const hoy = hoyChile();
  const shorts = [
    { label: 'Hoy',     d: hoy,            h: hoy },
    { label: 'Mes',     d: mesInicio(),    h: hoy },
    { label: '3 meses', d: restarMeses(3), h: hoy },
    { label: 'Año',     d: restarMeses(12),h: hoy },
  ];
  return (
    <div className="hst-atajos">
      {shorts.map(s => {
        const activo = desde === s.d && hasta === s.h;
        return (
          <button key={s.label} type="button" onClick={() => onSelect(s.d, s.h)} aria-pressed={activo} className={activo ? 'is-on' : undefined}>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HistorialPage() {
  const { puede, rol } = useRol();
  const canEdit = puede('historial', 'editar');
  const isAdmin = rol === 'admin';
  const verCostos = rol !== 'cocina';

  const [tab,     setTab]     = useState<Tab>('produccion');
  const [desde,   setDesde]   = useState(mesInicio());
  const [hasta,   setHasta]   = useState(hoyChile());
  const [busquedas, setBusquedas] = useState<Record<Tab, string>>({
    produccion: '',
    colacion: '',
    mermas: '',
    frutas: '',
    inventario: '',
  });
  const [datos,   setDatos]   = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<HistorialSummary | null>(null);
  const [maestros, setMaestros] = useState<{ productos: Record<string, unknown>[]; pps: Record<string, unknown>[] }>({ productos: [], pps: [] });
  const [responsable, setResponsable] = useState('');
  const [responsables, setResponsables] = useState<string[]>([]);
  const [resultadoBusqueda, setResultadoBusqueda] = useState<ResultadoBusqueda | null>(null);
  const busqueda = busquedas[tab] ?? '';

  // Cada llamada a cargar() reclama un id; si mientras espera la respuesta se dispara otra
  // consulta (ej. el usuario cambia "desde" y luego "hasta", lanzando dos fetch solapados),
  // la respuesta que llega tarde se descarta en vez de sobrescribir la tabla con un rango viejo.
  const reqIdRef = useRef(0);

  const cargar = useCallback(async (t: Tab, d: string, h: string, q: string, resp: string, offset: number) => {
    const reqId = ++reqIdRef.current;
    setLoading(true); setErr(''); setDatos([]); setSummary(null); setResultadoBusqueda(null);
    try {
      const params = new URLSearchParams({
        tipo: t,
        desde: d,
        hasta: h,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (q.trim()) params.set('q', q.trim());
      if (resp) params.set('responsable', resp);
      const res = await fetch(`/api/historial?${params.toString()}`);
      const data = await res.json();
      if (reqId !== reqIdRef.current) return; // llegó una consulta más nueva: esta respuesta ya no aplica
      if (!res.ok) throw new Error(data.error);
      setDatos(data.items ?? []);
      setTotal(data.count ?? (data.items?.length ?? 0));
      setSummary(data.summary ?? null);
      setResponsables(Array.isArray(data.responsables) ? data.responsables : []);
      setResultadoBusqueda(q.trim() ? { q: q.trim(), coincidencias: Array.isArray(data.coincidencias) ? data.coincidencias : [] } : null);
    } catch (e: unknown) {
      if (reqId !== reqIdRef.current) return;
      setErr(e instanceof Error ? e.message : 'Error cargando datos');
      setDatos([]);
      setSummary(null);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/maestros')
      .then(r => r.json())
      .then(data => {
        if (!alive) return;
        if (data.error) throw new Error(data.error);
        setMaestros({ productos: data.productos ?? [], pps: data.pps ?? [] });
      })
      .catch(() => {
        if (alive) setMaestros({ productos: [], pps: [] });
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    // Debounce fijo: al ajustar el rango se tocan dos campos (desde y hasta) casi seguidos;
    // con 250 ms se agrupan en una sola consulta en vez de lanzar dos fetch solapados.
    const timer = window.setTimeout(() => {
      void cargar(tab, desde, hasta, busqueda, responsable, (page - 1) * PAGE_SIZE);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [tab, desde, hasta, busqueda, responsable, page, cargar]);

  const refresh = useCallback(
    () => cargar(tab, desde, hasta, busqueda, responsable, (page - 1) * PAGE_SIZE),
    [cargar, tab, desde, hasta, busqueda, responsable, page],
  );

  // Todo cambio de pestaña / rango / búsqueda vuelve a la página 1, en el mismo evento que
  // origina el cambio (así el efecto de carga corre una sola vez, no dos).
  const cambiarTab = (t: Tab) => { setPage(1); setTab(t); };
  const cambiarDesde = (v: string) => { setPage(1); setDesde(v); };
  const cambiarHasta = (v: string) => { setPage(1); setHasta(v); };
  const aplicarAtajo = (d: string, h: string) => { setPage(1); setDesde(d); setHasta(h); };
  const cambiarBusqueda = (v: string) => { setPage(1); setBusquedas(prev => ({ ...prev, [tab]: v })); };
  const cambiarResponsable = (v: string) => { setPage(1); setResponsable(v); };
  const limpiarFiltros = () => { setPage(1); setBusquedas(prev => ({ ...prev, [tab]: '' })); setResponsable(''); };
  const hayFiltros = !!busqueda.trim() || !!responsable;

  const TAB_CFG: { id: Tab; label: string }[] = [
    { id: 'produccion', label: 'Producción' },
    { id: 'colacion',   label: 'Colación' },
    { id: 'frutas',     label: 'Frutas' },
    { id: 'inventario', label: 'Inventario' },
    { id: 'mermas',     label: 'Mermas' },
  ];

  return (
    <div className="page hst" style={{ maxWidth: 1560 }}>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>

      {/* Encabezado */}
      <div className="hst-head">
        <div className="hst-head-title">
          <span className="hst-head-icon"><NavIcon name="clock" size={22} strokeWidth={1.9} /></span>
          <div>
            <h1>Historial</h1>
            <p>Registros por período — haz clic en una fila para ver el detalle</p>
          </div>
        </div>
        {puede('export', 'ver') && (
          <a href="/export" className="hst-btn-sec hst-btn-lg">
            <NavIcon name="file-down" size={17} /> Exportar
          </a>
        )}
      </div>

      {/* Período + KPI */}
      <div className="hst-top">
        <div className="hst-periodo">
          <span className="hst-kpi-label">Período</span>
          <div className="hst-fechas">
            <label>
              <span>Desde</span>
              <input type="date" value={desde} onChange={e => cambiarDesde(e.target.value)} aria-label="Fecha desde" />
            </label>
            <label>
              <span>Hasta</span>
              <input type="date" value={hasta} onChange={e => cambiarHasta(e.target.value)} aria-label="Fecha hasta" />
            </label>
          </div>
          <PeriodShortcuts desde={desde} hasta={hasta} onSelect={aplicarAtajo} />
        </div>
        <KpiRow tab={tab} summary={summary} verCostos={verCostos} />
      </div>

      {/* Card con tabs */}
      <div className="hst-card">
        <div className="hst-tabs" role="tablist">
          {TAB_CFG.map(({ id, label }) => {
            const activa = tab === id;
            return (
              <button key={id} type="button" role="tab" aria-selected={activa} onClick={() => cambiarTab(id)} className={activa ? 'is-on' : undefined}>
                {label}
              </button>
            );
          })}
        </div>

        {/* Filtros: buscador general + responsable + limpiar */}
        <div className="hst-filtros">
          <label className="hst-search">
            <NavIcon name="search" size={17} />
            <input
              type="search"
              value={busqueda}
              onChange={e => cambiarBusqueda(e.target.value)}
              placeholder="Buscar producciones, productos o responsable..."
              aria-label="Buscar producciones, productos o responsable"
            />
          </label>
          <label className="hst-select">
            <span>Responsable</span>
            <select value={responsable} onChange={e => cambiarResponsable(e.target.value)}>
              <option value="">Todos</option>
              {[...new Set([...responsables, ...(responsable ? [responsable] : [])])].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <button type="button" className="hst-btn-sec" onClick={limpiarFiltros} disabled={!hayFiltros}>
            <NavIcon name="rotate-ccw" size={15} /> Limpiar filtros
          </button>
        </div>

        {/* Content */}
        {err && (
          <div style={{ padding: '16px 20px', color: 'var(--rd)', fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span>⚠</span> {err}
          </div>
        )}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ts)', fontSize: '14px' }}>
            <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--bo)', borderTopColor: 'var(--ac)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <p style={{ marginTop: '12px', marginBottom: 0 }}>Cargando registros...</p>
          </div>
        ) : (
          <>
            {tab === 'produccion' && <TablaProduccion datos={datos} canEdit={canEdit} isAdmin={isAdmin} onRefresh={refresh} verCostos={verCostos} productos={maestros.productos} pps={maestros.pps} porDia={summary?.por_dia} busqueda={resultadoBusqueda} />}
            {tab === 'colacion'   && <TablaColacion   datos={datos} canEdit={canEdit} isAdmin={isAdmin} onRefresh={refresh} verCostos={verCostos} productos={maestros.productos} />}
            {tab === 'frutas'     && <TablaFrutas     datos={datos} canEdit={canEdit} isAdmin={isAdmin} onRefresh={refresh} verCostos={verCostos} productos={maestros.productos} />}
            {tab === 'inventario' && <TablaInventario datos={datos} isAdmin={isAdmin} onRefresh={refresh} productos={maestros.productos} />}
            {tab === 'mermas'     && <TablaMermas     datos={datos} canEdit={canEdit} isAdmin={isAdmin} onRefresh={refresh} verCostos={verCostos} productos={maestros.productos} />}
            {total > 0 && <Paginacion page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
          </>
        )}
      </div>
    </div>
  );
}
