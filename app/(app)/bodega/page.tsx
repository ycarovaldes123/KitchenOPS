'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRol } from '@/components/RolProvider';

interface ControlRow {
  id: string | null;
  fecha: string;
  codigo_producto: string;
  producto_nombre: string;
  unidad_medida: string;
  categoria: string;
  inventario_inicial: number;
  compras: number;
  producto_terminado: number;
  ventas: number;
  ajuste_produccion: number;
  mermas: number;
  colacion: number;
  inventario_final: number;
  stock_cocina: number;
  stock_mantencion: number;
  stock_congelado: number;
  observacion: string;
  control: number;
}

type NumericControlField =
  | 'inventario_inicial'
  | 'compras'
  | 'producto_terminado'
  | 'ventas'
  | 'ajuste_produccion'
  | 'mermas'
  | 'colacion'
  | 'inventario_final'
  | 'stock_cocina'
  | 'stock_mantencion'
  | 'stock_congelado';

const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

const numericFields: { key: NumericControlField; label: string }[] = [
  { key: 'inventario_inicial', label: 'Inicial' },
  { key: 'compras', label: 'Compras' },
  { key: 'producto_terminado', label: 'P. Term.' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'ajuste_produccion', label: 'A. Prod.' },
  { key: 'mermas', label: 'Mermas' },
  { key: 'colacion', label: 'Colacion' },
  { key: 'inventario_final', label: 'Final' },
  { key: 'stock_cocina', label: 'Cocina' },
  { key: 'stock_mantencion', label: 'C. Mantenc' },
  { key: 'stock_congelado', label: 'C. Congelado' },
];

const categoryOrder = [
  'CARNES ROJAS',
  'CARNES AVE',
  'PESCADOS',
  'EMBUTIDOS',
  'PRODUCTOS PROCESADOS',
];

function calcControl(row: Pick<ControlRow, NumericControlField>) {
  const teorico =
    row.inventario_inicial +
    row.compras +
    row.producto_terminado -
    row.ventas -
    row.ajuste_produccion -
    row.mermas -
    row.colacion;
  return row.inventario_final - teorico;
}

function toNumber(value: string) {
  if (value.trim() === '') return 0;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function formatQty(value: number) {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value);
}

function fechaLabel(value: string) {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
}

export default function BodegaPage() {
  const { rol } = useRol();
  const [fechaControl, setFechaControl] = useState(hoyChile());
  const [controlRows, setControlRows] = useState<ControlRow[]>([]);
  const [loadingControl, setLoadingControl] = useState(false);
  const [savingControl, setSavingControl] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const puedeGuardarControl = rol === 'admin' || rol === 'finanzas' || rol === 'economo';

  const controlKpis = useMemo(() => {
    const diferencia = controlRows.reduce((sum, row) => sum + row.control, 0);
    const conDiferencia = controlRows.filter(row => Math.abs(row.control) > 0.0001).length;
    const final = controlRows.reduce((sum, row) => sum + row.inventario_final, 0);
    return { diferencia, conDiferencia, final };
  }, [controlRows]);

  const controlGroups = useMemo(() => {
    const grouped = new Map<string, ControlRow[]>();
    for (const row of controlRows) {
      const key = row.categoria || 'SIN CATEGORIA';
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => {
        const ai = categoryOrder.indexOf(a);
        const bi = categoryOrder.indexOf(b);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return a.localeCompare(b);
      })
      .map(([categoria, rows]) => ({
        categoria,
        rows: rows.sort((a, b) => a.codigo_producto.localeCompare(b.codigo_producto)),
        diferencia: rows.reduce((sum, row) => sum + row.control, 0),
      }));
  }, [controlRows]);

  useEffect(() => {
    cargarControl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarControl() {
    setErr('');
    setOk('');
    setLoadingControl(true);
    try {
      const res = await fetch(`/api/bodega/control?fecha=${fechaControl}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error cargando control de bodega');
      setControlRows(json.rows ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setLoadingControl(false);
    }
  }

  async function guardarControl() {
    setErr('');
    setOk('');
    setSavingControl(true);
    try {
      const res = await fetch('/api/bodega/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: fechaControl, rows: controlRows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error guardando control de bodega');
      setOk(`Control guardado: ${json.saved ?? 0} productos.`);
      await cargarControl();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setSavingControl(false);
    }
  }

  function updateControl(codigo: string, field: NumericControlField, value: string) {
    setControlRows(rows => rows.map(row => {
      if (row.codigo_producto !== codigo) return row;
      const next = { ...row, [field]: toNumber(value) };
      return { ...next, control: calcControl(next) };
    }));
  }

  const inp: React.CSSProperties = {
    border: '1.5px solid var(--bo)',
    borderRadius: '8px',
    padding: '8px 11px',
    fontSize: '14px',
    background: 'var(--bg)',
    color: 'var(--tx)',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
  };

  const button: React.CSSProperties = {
    background: 'var(--ac)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
  };

  return (
    <div className="page" style={{ paddingBottom: '48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 3px' }}>Bodega cocina</h1>
          <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>
            Control diario de productos carnicos, pescados, aves y embutidos.
          </p>
        </div>
      </div>

      {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: '8px', padding: '12px 16px', marginBottom: '14px', fontSize: '14px' }}>{err}</div>}
      {ok && <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46', borderRadius: '8px', padding: '12px 16px', marginBottom: '14px', fontSize: '14px' }}>{ok}</div>}

      <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--bo)', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--ts)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>C Costo - Cocina</div>
            <h2 style={{ fontSize: '16px', margin: '0 0 4px', fontWeight: 800 }}>Planilla control productos criticos</h2>
            <p style={{ color: 'var(--ts)', fontSize: '12px', margin: 0 }}>Dia: {fechaLabel(fechaControl)}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', marginBottom: '5px' }}>Fecha control</label>
              <input type="date" value={fechaControl} onChange={e => setFechaControl(e.target.value)} style={inp} />
            </div>
            <button type="button" onClick={cargarControl} disabled={loadingControl || savingControl} style={{ ...button, background: '#334155', cursor: loadingControl ? 'wait' : 'pointer' }}>
              {loadingControl ? 'Cargando...' : 'Cargar'}
            </button>
            {puedeGuardarControl && (
              <button type="button" onClick={guardarControl} disabled={loadingControl || savingControl || !controlRows.length} style={{ ...button, background: '#0D9373', cursor: savingControl ? 'wait' : 'pointer' }}>
                {savingControl ? 'Guardando...' : 'Guardar'}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(130px, 1fr))', gap: '1px', background: 'var(--bo)' }}>
          <KpiCell label="Productos" value={String(controlRows.length)} />
          <KpiCell label="Categorias" value={String(controlGroups.length)} />
          <KpiCell label="Con diferencia" value={String(controlKpis.conDiferencia)} />
          <KpiCell label="Diferencia total" value={formatQty(controlKpis.diferencia)} tone={Math.abs(controlKpis.diferencia) > 0.0001 ? 'warn' : 'ok'} />
        </div>

        <div style={{ overflowX: 'auto', background: '#F8FAFC' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '1440px' }}>
            <thead>
              <tr style={{ background: '#E2E8F0' }}>
                <th colSpan={3} style={{ ...groupHeaderStyle, position: 'sticky', left: 0, zIndex: 5, background: '#E2E8F0' }} />
                <th style={groupHeaderStyle}>Inventario</th>
                <th colSpan={2} style={groupHeaderStyle}>Ingresos</th>
                <th colSpan={4} style={groupHeaderStyle}>Salidas</th>
                <th style={groupHeaderStyle}>Inventario</th>
                <th style={groupHeaderStyle}>Control</th>
                <th colSpan={3} style={groupHeaderStyle}>Inventario final por seccion</th>
              </tr>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ ...stickyHeaderStyle, left: 0, minWidth: '82px', width: '82px', textAlign: 'center' }}>Codigo</th>
                <th style={{ ...stickyHeaderStyle, left: 82, minWidth: '220px', width: '220px', textAlign: 'left' }}>Producto</th>
                <th style={{ ...stickyHeaderStyle, left: 302, minWidth: '50px', width: '50px', textAlign: 'center' }}>U.M.</th>
                {numericFields.slice(0, 8).map(field => (
                  <th key={field.key} style={columnHeaderStyle}>{field.label}</th>
                ))}
                <th style={{ ...columnHeaderStyle, position: 'sticky', right: 0, zIndex: 6, background: '#F8FAFC', color: '#7C2D12', minWidth: '84px', width: '84px' }}>Control</th>
                {numericFields.slice(8).map(field => (
                  <th key={field.key} style={columnHeaderStyle}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {controlGroups.length === 0 ? (
                <tr><td colSpan={15} style={{ padding: '34px 16px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px', background: '#FFFFFF' }}>Sin productos criticos cargados</td></tr>
              ) : controlGroups.map(group => (
                <ControlGroup
                  key={group.categoria}
                  categoria={group.categoria}
                  diferencia={group.diferencia}
                  rows={group.rows}
                  puedeGuardarControl={puedeGuardarControl}
                  updateControl={updateControl}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCell({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div style={{ background: 'var(--sf)', padding: '12px 16px' }}>
      <div style={{ fontSize: '11px', color: 'var(--ts)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, color: tone === 'warn' ? '#B45309' : tone === 'ok' ? '#047857' : 'var(--tx)' }}>{value}</div>
    </div>
  );
}

function ControlGroup({
  categoria,
  diferencia,
  rows,
  puedeGuardarControl,
  updateControl,
}: {
  categoria: string;
  diferencia: number;
  rows: ControlRow[];
  puedeGuardarControl: boolean;
  updateControl: (codigo: string, field: NumericControlField, value: string) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={15} style={{
          background: '#EEF2FF',
          borderBottom: '1px solid #CBD5E1',
          borderTop: '1px solid #CBD5E1',
          color: '#1E293B',
          fontSize: '11px',
          fontWeight: 900,
          letterSpacing: '0.2px',
          padding: '8px 10px',
          textTransform: 'uppercase',
        }}>
          {categoria}
          <span style={{ color: '#64748B', fontWeight: 800, marginLeft: '10px' }}>{rows.length} productos</span>
          <span style={{ color: Math.abs(diferencia) > 0.0001 ? '#B45309' : '#047857', fontWeight: 900, marginLeft: '14px' }}>Control {formatQty(diferencia)}</span>
        </td>
      </tr>
      {rows.map(row => (
        <tr key={row.codigo_producto}>
          <td style={{ ...stickyCellStyle, left: 0, minWidth: '82px', width: '82px', color: '#475569', textAlign: 'center' }}>{row.codigo_producto}</td>
          <td style={{ ...stickyCellStyle, left: 82, minWidth: '220px', width: '220px', fontWeight: 700 }}>{row.producto_nombre}</td>
          <td style={{ ...stickyCellStyle, left: 302, minWidth: '50px', width: '50px', color: '#475569', textAlign: 'center' }}>{row.unidad_medida}</td>
          {numericFields.slice(0, 8).map(field => (
            <EditableQty
              key={field.key}
              value={row[field.key]}
              disabled={!puedeGuardarControl}
              onChange={value => updateControl(row.codigo_producto, field.key, value)}
            />
          ))}
          <td style={{ ...bodyCellStyle, position: 'sticky', right: 0, zIndex: 3, minWidth: '84px', width: '84px', background: '#FFFFFF', color: Math.abs(row.control) > 0.0001 ? '#B45309' : '#047857', fontWeight: 900 }}>{formatQty(row.control)}</td>
          {numericFields.slice(8).map(field => (
            <EditableQty
              key={field.key}
              value={row[field.key]}
              disabled={!puedeGuardarControl}
              onChange={value => updateControl(row.codigo_producto, field.key, value)}
            />
          ))}
        </tr>
      ))}
    </>
  );
}

function EditableQty({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <td style={bodyCellStyle}>
      <input
        type="number"
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '62px',
          border: '1px solid #CBD5E1',
          borderRadius: '4px',
          padding: '5px 6px',
          fontSize: '12px',
          textAlign: 'right',
          background: disabled ? '#F8FAFC' : '#FFFFFF',
          color: 'var(--tx)',
          fontVariantNumeric: 'tabular-nums',
        }}
      />
    </td>
  );
}

const groupHeaderStyle: React.CSSProperties = {
  padding: '7px 8px',
  textAlign: 'center',
  fontSize: '10px',
  fontWeight: 900,
  color: '#334155',
  textTransform: 'uppercase',
  borderBottom: '1px solid #CBD5E1',
  borderLeft: '1px solid #CBD5E1',
};

const columnHeaderStyle: React.CSSProperties = {
  padding: '8px 6px',
  textAlign: 'right',
  fontSize: '10px',
  fontWeight: 900,
  color: '#475569',
  textTransform: 'uppercase',
  borderBottom: '1px solid #CBD5E1',
  borderLeft: '1px solid #E2E8F0',
  minWidth: '74px',
};

const stickyHeaderStyle: React.CSSProperties = {
  ...columnHeaderStyle,
  position: 'sticky',
  zIndex: 5,
  background: '#F8FAFC',
};

const bodyCellStyle: React.CSSProperties = {
  borderBottom: '1px solid #E2E8F0',
  borderLeft: '1px solid #F1F5F9',
  padding: '5px 4px',
  textAlign: 'right',
  fontSize: '12px',
  background: '#FFFFFF',
  fontVariantNumeric: 'tabular-nums',
};

const stickyCellStyle: React.CSSProperties = {
  ...bodyCellStyle,
  position: 'sticky',
  zIndex: 2,
  textAlign: 'left',
  background: '#FFFFFF',
};
