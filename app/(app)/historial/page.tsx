'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCLP, formatPct, calcMerma } from '@/lib/calculos';
import { useRol } from '@/components/RolProvider';

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

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = 'produccion' | 'colacion' | 'mermas';

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

// ─── TablaProduccion ────────────────────────────────────────────────────────

function TablaProduccion({ datos, canEdit, onRefresh, verCostos }: { datos: Record<string, unknown>[]; canEdit: boolean; onRefresh: () => void; verCostos: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [editRendValues, setEditRendValues] = useState<Record<string, { kg_utilizados: number; rendimiento_kg: number }>>({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const toggle = (id: string) => {
    setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    if (editingId === id) { setEditingId(null); setEditValues({}); setEditRendValues({}); setSaveErr(''); }
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
    setEditingId(id); setEditValues(vals); setEditRendValues(rendVals); setSaveErr('');
  };
  const cancelEdit = () => { setEditingId(null); setEditValues({}); setEditRendValues({}); setSaveErr(''); };
  const saveEditProd = async (prodId: string, det: Record<string, unknown>[], rend: Record<string, unknown>[]) => {
    setSaving(true); setSaveErr('');
    try {
      const detalle = det.map(d => ({ id: d.id as string, cantidad: editValues[d.id as string] ?? (d.cantidad as number) }));
      const rendimiento = rend.map(r => ({
        id: r.id as string,
        kg_utilizados: editRendValues[r.id as string]?.kg_utilizados ?? (r.kg_utilizados as number),
        rendimiento_kg: editRendValues[r.id as string]?.rendimiento_kg ?? (r.rendimiento_kg as number),
      }));
      const res = await fetch('/api/produccion', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ produccion_id: prodId, detalle, rendimiento }) });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setEditingId(null); setEditValues({}); setEditRendValues({}); onRefresh();
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : 'Error guardando'); }
    finally { setSaving(false); }
  };

  if (!datos.length) return <Empty msg="No hay informes de producción en este período." />;

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
        <thead>
          <tr>
            {['Fecha', 'Turno', 'Qué se produjo', 'PP', ...(verCostos ? ['Costo est.'] : []), ''].map(h => (
              <th key={h} style={thSt}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.map((p: Record<string, unknown>) => {
            const id   = p.id as string;
            const det  = (p.detalle_produccion as Record<string, unknown>[]) ?? [];
            const rend = (p.rendimiento as Record<string, unknown>[]) ?? [];
            const ct   = det.reduce((s, d) => s + ((d.costo_total as number) ?? 0), 0);
            const open = expanded.has(id);
            // Preview: first 2 PP names
            const preview = det.slice(0, 2).map(d => d.nombre_pp as string);
            const extra   = det.length > 2 ? det.length - 2 : 0;

            return [
              <tr key={id} onClick={() => toggle(id)}
                style={{ borderBottom: '1px solid var(--bo)', cursor: 'pointer', transition: 'background 0.12s', background: open ? 'var(--al)' : 'transparent' }}
                onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg)'; }}
                onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
              >
                <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {fmtFecha(p.fecha as string)}
                </td>
                <td style={tdSt}>
                  <Chip label={p.turno as string} color={p.turno === 'AM' ? '#0D9373' : '#6366F1'} />
                </td>
                <td style={{ ...tdSt, maxWidth: '280px' }}>
                  {det.length === 0 ? (
                    <span style={{ color: 'var(--ts)' }}>Sin detalle</span>
                  ) : (
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {preview.map((n, i) => (
                        <span key={i} style={{ fontSize: '11px', background: 'var(--bo)', color: 'var(--tx)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, whiteSpace: 'nowrap' }}>{n}</span>
                      ))}
                      {extra > 0 && <span style={{ fontSize: '11px', color: 'var(--ts)' }}>+{extra} más</span>}
                    </div>
                  )}
                </td>
                <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums' }}>
                  {det.length}
                </td>
                {verCostos && (
                  <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums', color: ct > 0 ? 'var(--ac)' : 'var(--ts)', fontWeight: ct > 0 ? 600 : 400 }}>
                    {ct > 0 ? formatCLP(ct) : '—'}
                  </td>
                )}
                <td style={{ ...tdSt, textAlign: 'right', width: '48px' }}>
                  <ExpandBtn open={open} />
                </td>
              </tr>,

              open && (
                <tr key={`${id}-det`}>
                  <td colSpan={verCostos ? 6 : 5} style={{ background: 'var(--al)', padding: '0 0 2px' }}>
                    <div style={{ padding: '16px 20px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>

                      {/* Meta secundaria */}
                      <div style={{ minWidth: '180px' }}>
                        <DetailLabel>Quién / cuándo</DetailLabel>
                        <MetaRow icon="👤" label="Responsable" value={p.responsable_nombre as string} />
                        {!!p.created_at && <MetaRow icon="🕐" label="Hora registro" value={fmtHora(p.created_at as string) ?? '—'} />}
                        {(p.observacion as string) && (
                          <div style={{ marginTop: '10px' }}>
                            <DetailLabel>Observación</DetailLabel>
                            <p style={{ fontSize: '13px', color: 'var(--tx)', margin: 0, lineHeight: 1.5, maxWidth: '300px' }}>{p.observacion as string}</p>
                          </div>
                        )}
                      </div>

                      {/* PP detalle */}
                      {det.length > 0 && (
                        <div style={{ flex: 1, minWidth: '240px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            {canEdit && editingId !== id && (
                              <button onClick={e => { e.stopPropagation(); startEdit(id, det); }}
                                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--ac)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                                Editar PP y verduras
                              </button>
                            )}
                            {editingId === id && (
                              <>
                                <button onClick={e => { e.stopPropagation(); saveEditProd(id, det, rend); }} disabled={saving}
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
                          <DetailLabel>Producción PP</DetailLabel>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {det.map((d, i) => {
                              const isEditing = editingId === id;
                              const qty = isEditing ? (editValues[d.id as string] ?? (d.cantidad as number)) : (d.cantidad as number);
                              const total = isEditing
                                ? ((d.tipo_pp as string) === 'CC' || (d.tipo_pp as string) === 'DIRECTO'
                                  ? qty
                                  : qty * ((d.gramos_por_pp as number | null) ?? 1))
                                : d.total_producido as number | null;
                              const totalStr = total == null ? '—' : total >= 1000 ? `${(total / 1000).toFixed(2)} kg` : `${total} g`;
                              const costo = d.costo_total as number;
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--sf)', borderRadius: '7px', padding: '7px 12px' }}>
                                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--tx)' }}>{d.nombre_pp as string}</span>
                                  {isEditing ? (
                                    <>
                                      <input type="number" value={qty} min={0} step="any"
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => setEditValues(v => ({ ...v, [d.id as string]: parseFloat(e.target.value) || 0 }))}
                                        style={{ width: '80px', padding: '3px 6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', textAlign: 'right' }} />
                                      <span style={{ fontSize: '12px', color: 'var(--ts)' }}>PP</span>
                                    </>
                                  ) : (
                                    <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{d.cantidad as number} × {(d.gramos_por_pp as number | null) ?? '—'}</span>
                                  )}
                                  <span style={{ fontSize: '12px', color: 'var(--tl)', fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>{totalStr}</span>
                                  {verCostos && costo > 0 && <span style={{ fontSize: '11px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>{formatCLP(costo)}</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Rendimiento */}
                      {rend.length > 0 && (
                        <div style={{ minWidth: '200px' }}>
                          <DetailLabel>Rendimiento verduras</DetailLabel>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {rend.map((r, i) => {
                              const m   = calcMerma(r.kg_utilizados as number, r.rendimiento_kg as number);
                              const col = m.estado === 'alto' ? 'var(--rd)' : m.estado === 'medio' ? 'var(--am)' : 'var(--tl)';
                              const isEditing = editingId === id;
                              const rv = editRendValues[r.id as string] ?? {
                                kg_utilizados: r.kg_utilizados as number,
                                rendimiento_kg: r.rendimiento_kg as number,
                              };
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--sf)', borderRadius: '7px', padding: '7px 12px' }}>
                                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--tx)' }}>{r.verdura as string}</span>
                                  {isEditing ? (
                                    <>
                                      <input
                                        type="number"
                                        min={0}
                                        step="any"
                                        value={rv.kg_utilizados}
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => setEditRendValues(v => ({
                                          ...v,
                                          [r.id as string]: {
                                            kg_utilizados: parseFloat(e.target.value) || 0,
                                            rendimiento_kg: v[r.id as string]?.rendimiento_kg ?? rv.rendimiento_kg,
                                          },
                                        }))}
                                        style={{ width: '82px', padding: '3px 6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', textAlign: 'right' }}
                                      />
                                      <span style={{ fontSize: '12px', color: 'var(--ts)' }}>kg</span>
                                      <span style={{ fontSize: '12px', color: 'var(--ts)' }}>→</span>
                                      <input
                                        type="number"
                                        min={0}
                                        step="any"
                                        value={rv.rendimiento_kg}
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => setEditRendValues(v => ({
                                          ...v,
                                          [r.id as string]: {
                                            kg_utilizados: v[r.id as string]?.kg_utilizados ?? rv.kg_utilizados,
                                            rendimiento_kg: parseFloat(e.target.value) || 0,
                                          },
                                        }))}
                                        style={{ width: '82px', padding: '3px 6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--ac)', background: 'var(--bg)', color: 'var(--tx)', textAlign: 'right' }}
                                      />
                                      <span style={{ fontSize: '12px', color: 'var(--ts)' }}>kg</span>
                                    </>
                                  ) : (
                                    <>
                                      <span style={{ fontSize: '11px', color: 'var(--ts)' }}>{r.kg_utilizados as number} kg → {r.rendimiento_kg as number} kg</span>
                                      <span style={{ fontSize: '12px', fontWeight: 700, color: col, fontFamily: "'Space Grotesk', sans-serif" }}>{formatPct(m.mermaPct)} merma</span>
                                    </>
                                  )}
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

// ─── TablaColacion ──────────────────────────────────────────────────────────

function TablaColacion({ datos, canEdit, onRefresh, verCostos }: { datos: Record<string, unknown>[]; canEdit: boolean; onRefresh: () => void; verCostos: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [editInscritos, setEditInscritos] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const toggle = (id: string) => {
    setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    if (editingId === id) { setEditingId(null); setEditValues({}); setEditInscritos(0); setSaveErr(''); }
  };
  const startEdit = (id: string, det: Record<string, unknown>[], nInscritos: number) => {
    const vals: Record<string, number> = {};
    det.forEach(d => { vals[d.id as string] = d.cantidad as number; });
    setEditingId(id); setEditValues(vals); setEditInscritos(nInscritos); setSaveErr('');
  };
  const cancelEdit = () => { setEditingId(null); setEditValues({}); setEditInscritos(0); setSaveErr(''); };
  const saveEditCol = async (colId: string, det: Record<string, unknown>[]) => {
    setSaving(true); setSaveErr('');
    try {
      const detalle = det.map(d => ({ id: d.id as string, cantidad: editValues[d.id as string] ?? (d.cantidad as number) }));
      const res = await fetch('/api/colacion', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ colacion_id: colId, n_inscritos: editInscritos, detalle }) });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setEditingId(null); setEditValues({}); setEditInscritos(0); onRefresh();
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : 'Error guardando'); }
    finally { setSaving(false); }
  };

  if (!datos.length) return <Empty msg="No hay colaciones registradas en este período." />;

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
        <thead>
          <tr>
            {['Fecha', 'Menú', 'Inscritos', ...(verCostos ? ['Costo total', 'Costo / plato'] : []), ''].map(h => (
              <th key={h} style={thSt}>{h}</th>
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
                <td style={{ ...tdSt, textAlign: 'right', width: '48px' }}>
                  <ExpandBtn open={open} />
                </td>
              </tr>,

              open && (
                <tr key={`${id}-det`}>
                  <td colSpan={verCostos ? 6 : 4} style={{ background: 'var(--al)', padding: '0 0 2px' }}>
                    <div style={{ padding: '16px 20px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>

                      {/* Meta */}
                      <div style={{ minWidth: '180px' }}>
                        <DetailLabel>Quién / cuándo</DetailLabel>
                        <MetaRow icon="👤" label="Responsable" value={c.responsable_nombre as string} />
                        {!!c.created_at && <MetaRow icon="🕐" label="Hora registro" value={fmtHora(c.created_at as string) ?? '—'} />}
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
                      {det.length > 0 && (
                        <div style={{ flex: 1, minWidth: '240px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ingredientes utilizados</span>
                            {canEdit && editingId !== id && (
                              <button onClick={e => { e.stopPropagation(); startEdit(id, det, ni); }}
                                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--ac)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                                Editar
                              </button>
                            )}
                            {editingId === id && (
                              <>
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
                            {det.map((d, i) => {
                              const isEditing = editingId === id;
                              const qty = isEditing ? (editValues[d.id as string] ?? (d.cantidad as number)) : (d.cantidad as number);
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

const MOTIVO_COLOR: Record<string, string> = {
  'Vencimiento':        '#DC2626',
  'Mala manipulación':  '#D97706',
  'Sobreproducción':    '#6366F1',
  'Devolución':         '#0EA5E9',
  'Corte / limpieza':   '#0D9373',
  'Error de producción':'#7C3AED',
  'Otro':               '#6B7280',
};

function TablaMermas({ datos, canEdit, onRefresh, verCostos }: { datos: Record<string, unknown>[]; canEdit: boolean; onRefresh: () => void; verCostos: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const toggle = (id: string) => {
    setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    if (editingId === id) { setEditingId(null); setEditValues({}); setSaveErr(''); }
  };
  const startEdit = (id: string, det: Record<string, unknown>[]) => {
    const vals: Record<string, number> = {};
    det.forEach(d => { vals[d.id as string] = d.cantidad as number; });
    setEditingId(id); setEditValues(vals); setSaveErr('');
  };
  const cancelEdit = () => { setEditingId(null); setEditValues({}); setSaveErr(''); };
  const saveEditMer = async (mermaId: string, det: Record<string, unknown>[]) => {
    setSaving(true); setSaveErr('');
    try {
      const detalle = det.map(d => ({ id: d.id as string, cantidad: editValues[d.id as string] ?? (d.cantidad as number) }));
      const res = await fetch('/api/mermas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merma_id: mermaId, detalle }) });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setEditingId(null); setEditValues({}); onRefresh();
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : 'Error guardando'); }
    finally { setSaving(false); }
  };

  if (!datos.length) return <Empty msg="No hay mermas registradas en este período." />;

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
        <thead>
          <tr>
            {['Fecha', 'Qué se perdió', 'Motivos', 'Productos', ...(verCostos ? ['Pérdida'] : []), ''].map(h => (
              <th key={h} style={thSt}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.map((m: Record<string, unknown>) => {
            const id  = m.id as string;
            const det = (m.detalle_mermas as Record<string, unknown>[]) ?? [];
            const ct  = det.reduce((s, d) => s + ((d.costo_total as number) ?? 0), 0);
            const open = expanded.has(id);
            // Preview: first 2 products
            const preview = det.slice(0, 2).map(d => d.nombre_producto as string);
            const extra   = det.length > 2 ? det.length - 2 : 0;
            // Unique motivos
            const motivos = [...new Set(det.map(d => d.motivo as string).filter(Boolean))];

            return [
              <tr key={id} onClick={() => toggle(id)}
                style={{ borderBottom: '1px solid var(--bo)', cursor: 'pointer', transition: 'background 0.12s', background: open ? '#FEF2F2' : 'transparent' }}
                onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg)'; }}
                onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
              >
                <td style={{ ...tdSt, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {fmtFecha(m.fecha as string)}
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
                <td style={{ ...tdSt, textAlign: 'right', width: '48px' }}>
                  <ExpandBtn open={open} />
                </td>
              </tr>,

              open && (
                <tr key={`${id}-det`}>
                  <td colSpan={verCostos ? 6 : 5} style={{ background: '#FEF2F2', padding: '0 0 2px' }}>
                    <div style={{ padding: '16px 20px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>

                      {/* Meta */}
                      <div style={{ minWidth: '180px' }}>
                        <DetailLabel>Quién / cuándo</DetailLabel>
                        <MetaRow icon="👤" label="Responsable" value={m.responsable_nombre as string} />
                        {!!m.created_at && <MetaRow icon="🕐" label="Hora registro" value={fmtHora(m.created_at as string) ?? '—'} />}
                        {(m.observacion as string) && (
                          <div style={{ marginTop: '10px' }}>
                            <DetailLabel>Observación</DetailLabel>
                            <p style={{ fontSize: '13px', color: 'var(--tx)', margin: 0, lineHeight: 1.5, maxWidth: '280px' }}>{m.observacion as string}</p>
                          </div>
                        )}
                      </div>

                      {/* Detalle */}
                      {det.length > 0 && (
                        <div style={{ flex: 1, minWidth: '240px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Detalle de productos</span>
                            {canEdit && editingId !== id && (
                              <button onClick={e => { e.stopPropagation(); startEdit(id, det); }}
                                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--ac)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                                Editar
                              </button>
                            )}
                            {editingId === id && (
                              <>
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
                            {det.map((d, i) => {
                              const isEditing = editingId === id;
                              const qty = isEditing ? (editValues[d.id as string] ?? (d.cantidad as number)) : (d.cantidad as number);
                              const motivo = d.motivo as string | null;
                              const motivoColor = motivo ? (MOTIVO_COLOR[motivo] ?? '#6B7280') : null;
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
                                        <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>{formatCLP(d.costo_total as number)}</span>
                                      )}
                                    </>
                                  )}
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

function PeriodShortcuts({ onSelect }: { onSelect: (d: string, h: string) => void }) {
  const hoy = hoyChile();
  const shorts = [
    { label: 'Hoy',     d: hoy,            h: hoy },
    { label: 'Mes',     d: mesInicio(),    h: hoy },
    { label: '3 meses', d: restarMeses(3), h: hoy },
    { label: 'Año',     d: restarMeses(12),h: hoy },
  ];
  return (
    <div className="tab-row">
      {shorts.map(s => (
        <button key={s.label} type="button" onClick={() => onSelect(s.d, s.h)} className="pill-btn">
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HistorialPage() {
  const { puede, rol } = useRol();
  const canEdit = puede('historial', 'editar');
  const verCostos = rol !== 'cocina';

  const [tab,     setTab]     = useState<Tab>('produccion');
  const [desde,   setDesde]   = useState(mesInicio());
  const [hasta,   setHasta]   = useState(hoyChile());
  const [datos,   setDatos]   = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');

  const cargar = useCallback(async (t: Tab, d: string, h: string) => {
    setLoading(true); setErr(''); setDatos([]);
    try {
      const res  = await fetch(`/api/historial?tipo=${t}&desde=${d}&hasta=${h}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDatos(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    async function run() {
      await Promise.resolve();
      if (!alive) return;
      setLoading(true); setErr(''); setDatos([]);
      try {
        const res  = await fetch(`/api/historial?tipo=${tab}&desde=${desde}&hasta=${hasta}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (alive) setDatos(data);
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : 'Error cargando datos');
      } finally {
        if (alive) setLoading(false);
      }
    }
    void run();
    return () => { alive = false; };
  }, [tab, desde, hasta]);
  const refresh = useCallback(() => cargar(tab, desde, hasta), [tab, desde, hasta, cargar]);

  const TAB_CFG: { id: Tab; label: string; color: string }[] = [
    { id: 'produccion', label: 'Producción',  color: 'var(--ac)' },
    { id: 'colacion',   label: 'Colación',    color: 'var(--tl)' },
    { id: 'mermas',     label: 'Mermas',      color: 'var(--rd)' },
  ];

  return (
    <div className="page">
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 3px' }}>Historial</h1>
        <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>Registros por período — haz clic en una fila para ver el detalle</p>
      </div>

      {/* Filtros */}
      <div style={{ background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)', padding: '14px 18px', marginBottom: '14px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="date-row">
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="field-input" style={{ padding: '6px 10px', fontSize: '13px', minHeight: 'unset' }} />
          <span style={{ color: 'var(--ts)', fontSize: '13px' }}>→</span>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="field-input" style={{ padding: '6px 10px', fontSize: '13px', minHeight: 'unset' }} />
        </div>
        <PeriodShortcuts onSelect={(d, h) => { setDesde(d); setHasta(h); }} />
        {!loading && datos.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--ts)', background: 'var(--bg)', border: '1px solid var(--bo)', padding: '3px 10px', borderRadius: '20px' }}>
            {datos.length} registro{datos.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Card con tabs */}
      <div style={{ background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--bo)', background: 'var(--bg)' }}>
          {TAB_CFG.map(({ id, label, color }) => (
            <button key={id} type="button" onClick={() => setTab(id)} style={{
              padding: '13px 20px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: tab === id ? 700 : 400,
              color: tab === id ? 'var(--tx)' : 'var(--ts)',
              borderBottom: `2px solid ${tab === id ? color : 'transparent'}`,
              marginBottom: '-1px', fontFamily: 'DM Sans, sans-serif', transition: 'color 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* Content */}
        {err && (
          <div style={{ padding: '16px 20px', color: 'var(--rd)', fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span>⚠</span> {err}
          </div>
        )}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ts)', fontSize: '14px' }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--bo)', borderTopColor: 'var(--ac)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <p style={{ marginTop: '12px', marginBottom: 0 }}>Cargando registros...</p>
          </div>
        ) : (
          <>
            {tab === 'produccion' && <TablaProduccion datos={datos} canEdit={canEdit} onRefresh={refresh} verCostos={verCostos} />}
            {tab === 'colacion'   && <TablaColacion   datos={datos} canEdit={canEdit} onRefresh={refresh} verCostos={verCostos} />}
            {tab === 'mermas'     && <TablaMermas     datos={datos} canEdit={canEdit} onRefresh={refresh} verCostos={verCostos} />}
          </>
        )}
      </div>
    </div>
  );
}
