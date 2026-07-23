'use client';

import { useEffect, useState, useRef } from 'react';
import { useRol } from '@/components/RolProvider';
import type { Producto, PP, Responsable, TipoPP } from '@/types/database';

type Tab = 'pp' | 'recetas' | 'productos' | 'personal';

interface PPRecetaIngrediente {
  id: string;
  orden: number;
  codigo_ingrediente: string | null;
  nombre_ingrediente: string;
  cantidad: number;
  unidad_medida: string;
  costo_unitario_snap: number;
  costo_linea_calculado: number;
  sin_codigo: boolean;
  sin_costo: boolean;
}

interface PPReceta {
  id: string;
  codigo_receta: string;
  codigo_pp: string | null;
  nombre: string;
  rendimiento: number;
  unidad_rendimiento: string;
  costo_total_calculado: number;
  costo_unitario_calculado: number;
  estado: string;
  activo: boolean;
  importado_at: string | null;
  calculado_at: string | null;
  ingredientes: PPRecetaIngrediente[];
}

interface ActualizarResult {
  total_en_planilla: number;
  actualizados: number;
  insertados?: number;
  errores: string[];
  softland_sin_costo: number;
  detalle_softland_sin_costo: string[];
  pp_recalculadas?: number;
  pp_errores?: string[];
}

const TIPOS_PP: TipoPP[] = ['PORCION', 'UND', 'CC', 'DIRECTO'];
const UNIDADES = ['KG', 'GR', 'LT', 'UN', 'CC', 'PR'];

const TIPO_LABEL: Record<TipoPP, string> = {
  PORCION: 'Porción',
  UND:     'Unidad',
  CC:      'CC / ml',
  DIRECTO: 'Directo',
};

interface PPForm { nombre: string; tipo_pp: TipoPP; codigo_producto: string; gramos_por_pp: string; }
interface ProdForm { codigo: string; nombre: string; unidad_medida: string; costo_promedio: string; }

const emptyPP: PPForm   = { nombre: '', tipo_pp: 'PORCION', codigo_producto: '', gramos_por_pp: '' };
const emptyProd: ProdForm = { codigo: '', nombre: '', unidad_medida: 'KG', costo_promedio: '0' };

export default function MaestrosPage() {
  const { rol } = useRol();
  const isAdmin = rol === 'admin';
  const canManageProductos = isAdmin || rol === 'finanzas';
  const [tab, setTab]           = useState<Tab>('pp');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pps, setPPs]           = useState<PP[]>([]);
  const [responsables, setResp] = useState<Responsable[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [ppTipoFiltro, setPPTipoFiltro] = useState<TipoPP | ''>('');

  // PP modal
  const [ppModal, setPPModal]   = useState<false | 'new' | PP>(false);
  const [ppForm, setPPForm]     = useState<PPForm>(emptyPP);
  const [ppSaving, setPPSaving] = useState(false);
  const [ppError, setPPError]   = useState('');

  // Producto modal
  const [prodModal, setProdModal]   = useState(false);
  const [prodForm, setProdForm]     = useState<ProdForm>(emptyProd);
  const [prodSaving, setProdSaving] = useState(false);
  const [prodError, setProdError]   = useState('');
  const [prodEditModal, setProdEditModal] = useState<Producto | null>(null);
  const [prodEditCode, setProdEditCode]   = useState('');
  const [prodEditName, setProdEditName]   = useState('');
  const [prodEditCost, setProdEditCost]   = useState('');
  const [prodEditSaving, setProdEditSaving] = useState(false);
  const [prodEditError, setProdEditError] = useState('');

  // Product search in PP form
  const [prodSearch, setProdSearch] = useState('');
  const [prodDropdown, setProdDropdown] = useState(false);
  const prodSearchRef = useRef<HTMLInputElement>(null);

  // Actualizar costos
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<ActualizarResult | null>(null);
  const [uploadError, setUploadError] = useState('');

  // Recetas PP
  const recetasFileRef = useRef<HTMLInputElement>(null);
  const [recetas, setRecetas] = useState<PPReceta[]>([]);
  const [recetasLoading, setRecetasLoading] = useState(false);
  const [recetasImportando, setRecetasImportando] = useState(false);
  const [recetasRecalculando, setRecetasRecalculando] = useState(false);
  const [recalcProd, setRecalcProd] = useState(false);
  const [recetasMsg, setRecetasMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedReceta, setSelectedReceta] = useState<PPReceta | null>(null);
  const [recetaSearch, setRecetaSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [rPP, rProd, rResp] = await Promise.all([
      fetch('/api/maestros/pp', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/maestros/productos', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/maestros', { cache: 'no-store' }).then(r => r.json()).then(d => d.responsables),
    ]);
    setPPs(Array.isArray(rPP) ? rPP : []);
    setProductos(Array.isArray(rProd) ? rProd : []);
    setResp(Array.isArray(rResp) ? rResp : []);
    setLoading(false);
  }

  async function loadRecetas() {
    setRecetasLoading(true);
    const r = await fetch('/api/maestros/recetas-pp').then(res => res.json());
    setRecetas(Array.isArray(r) ? r : []);
    setRecetasLoading(false);
  }

  async function importarRecetas(file: File) {
    setRecetasImportando(true);
    setRecetasMsg(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/maestros/importar-recetas-pp', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) { setRecetasMsg({ ok: false, text: d.error ?? 'Error al importar' }); return; }
      setRecetasMsg({ ok: true, text: `Importadas ${d.importadas} nuevas, actualizadas ${d.actualizadas}${d.errores?.length ? ` — ${d.errores.length} errores` : ''}` });
      loadRecetas();
    } catch {
      setRecetasMsg({ ok: false, text: 'Error de conexión' });
    } finally {
      setRecetasImportando(false);
      if (recetasFileRef.current) recetasFileRef.current.value = '';
    }
  }

  async function recalcularRecetas() {
    setRecetasRecalculando(true);
    setRecetasMsg(null);
    try {
      const r = await fetch('/api/maestros/recetas-pp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'recalcular' }) });
      const d = await r.json();
      if (!r.ok) { setRecetasMsg({ ok: false, text: d.error ?? 'Error al recalcular' }); return; }
      setRecetasMsg({ ok: true, text: `Recalculadas ${d.recalculadas} recetas${d.errores?.length ? ` — ${d.errores.length} errores` : ''}` });
      loadRecetas();
    } catch {
      setRecetasMsg({ ok: false, text: 'Error de conexión' });
    } finally {
      setRecetasRecalculando(false);
    }
  }

  async function recalcularCostosProduccion() {
    setRecalcProd(true);
    setRecetasMsg(null);
    try {
      const r = await fetch('/api/maestros/recalcular-costos-produccion', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { setRecetasMsg({ ok: false, text: d.error ?? 'Error al recalcular' }); return; }
      setRecetasMsg({
        ok: true,
        text: `Costos producción: ${d.detalle_actualizados} líneas actualizadas · ${d.pp_actualizados} PPs vinculados · ${d.detalle_sin_receta} sin receta`,
      });
      load();
    } catch {
      setRecetasMsg({ ok: false, text: 'Error de conexión' });
    } finally {
      setRecalcProd(false);
    }
  }

  // ── PP CRUD ───────────────────────────────────────────────────

  function openNewPP() {
    setPPForm(emptyPP);
    setProdSearch('');
    setPPError('');
    setPPModal('new');
  }

  function openEditPP(pp: PP) {
    setPPForm({
      nombre:          pp.nombre,
      tipo_pp:         pp.tipo_pp,
      codigo_producto: pp.codigo_producto ?? '',
      gramos_por_pp:   pp.gramos_por_pp?.toString() ?? '',
    });
    const prod = productos.find(p => p.codigo === pp.codigo_producto);
    setProdSearch(prod ? prod.nombre : '');
    setPPError('');
    setPPModal(pp);
  }

  async function savePP() {
    if (!ppForm.nombre.trim()) { setPPError('El nombre es requerido'); return; }
    setPPSaving(true);
    setPPError('');
    const body = {
      nombre:          ppForm.nombre,
      tipo_pp:         ppForm.tipo_pp,
      codigo_producto: ppForm.codigo_producto || null,
      gramos_por_pp:   ppForm.gramos_por_pp ? parseFloat(ppForm.gramos_por_pp) : null,
    };
    const isEdit = ppModal !== 'new' && ppModal !== false;
    const url    = isEdit ? `/api/maestros/pp/${(ppModal as PP).id}` : '/api/maestros/pp';
    const method = isEdit ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) { setPPError(data.error ?? 'Error al guardar'); setPPSaving(false); return; }
    setPPModal(false);
    setPPSaving(false);
    load();
  }

  async function togglePP(pp: PP) {
    await fetch(`/api/maestros/pp/${pp.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !pp.activo }) });
    load();
  }

  // ── PRODUCTO CRUD ─────────────────────────────────────────────

  async function saveProd() {
    if (!prodForm.codigo.trim() || !prodForm.nombre.trim()) { setProdError('Código y nombre son requeridos'); return; }
    setProdSaving(true);
    setProdError('');
    const body = { ...prodForm, costo_promedio: parseInt(prodForm.costo_promedio) || 0 };
    const r = await fetch('/api/maestros/productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) { setProdError(data.error ?? 'Error al guardar'); setProdSaving(false); return; }
    setProdModal(false);
    setProdSaving(false);
    load();
  }

  function openEditProd(p: Producto) {
    setProdEditModal(p);
    setProdEditCode(p.codigo);
    setProdEditName(p.nombre);
    setProdEditCost(String(p.costo_promedio ?? 0));
    setProdEditError('');
  }

  async function saveProdEdit() {
    if (!prodEditModal) return;
    const codigo = isAdmin ? prodEditCode.trim() : prodEditModal.codigo;
    const nombre = prodEditName.trim();
    const costo = Number.parseFloat(prodEditCost.replace(',', '.'));
    if (isAdmin && !codigo) { setProdEditError('El codigo es requerido'); return; }
    if (!nombre) { setProdEditError('El nombre es requerido'); return; }
    if (!Number.isFinite(costo) || costo < 0) { setProdEditError('El costo debe ser un numero valido'); return; }

    setProdEditSaving(true);
    setProdEditError('');
    const r = await fetch(`/api/maestros/productos/${encodeURIComponent(prodEditModal.codigo)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isAdmin ? { codigo, nombre, costo_promedio: costo } : { nombre, costo_promedio: costo }),
    });
    const data = await r.json();
    if (!r.ok) {
      setProdEditError(data.error ?? 'Error al guardar');
      setProdEditSaving(false);
      return;
    }
    const codigoAnterior = prodEditModal.codigo;
    const actualizado: Producto = {
      codigo: data.codigo, nombre: data.nombre, unidad_medida: data.unidad_medida,
      costo_promedio: data.costo_promedio, activo: data.activo, updated_at: data.updated_at,
    };
    setProductos(prev => prev.map(p => p.codigo === codigoAnterior ? actualizado : p));
    setProdEditModal(null);
    setProdEditSaving(false);
  }

  async function actualizarCostos(file: File) {
    setUploadLoading(true);
    setUploadError('');
    setUploadResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/maestros/actualizar-costos', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) { setUploadError(data.error ?? 'Error al procesar'); return; }
      setUploadResult(data);
      await load();
    } catch {
      setUploadError('Error de conexión');
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function toggleProducto(p: Producto) {
    await fetch(`/api/maestros/productos/${p.codigo}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !p.activo }) });
    load();
  }

  // ── Helpers ───────────────────────────────────────────────────

  const filteredPP = pps.filter(pp =>
    pp.nombre.toLowerCase().includes(search.toLowerCase()) &&
    (!ppTipoFiltro || pp.tipo_pp === ppTipoFiltro)
  );
  const filteredProd = productos.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.codigo.toLowerCase().includes(search.toLowerCase())
  );
  const filteredResp = responsables.filter(r =>
    r.nombre.toLowerCase().includes(search.toLowerCase())
  );
  const filteredProdSearch = productos.filter(p =>
    p.nombre.toLowerCase().includes(prodSearch.toLowerCase()) ||
    p.codigo.toLowerCase().includes(prodSearch.toLowerCase())
  ).slice(0, 8);

  const filteredRecetas = recetas.filter(rec =>
    rec.nombre.toLowerCase().includes(recetaSearch.toLowerCase()) ||
    rec.codigo_receta.toLowerCase().includes(recetaSearch.toLowerCase())
  );

  const recetasNoActivo = recetas.filter(r => r.estado !== 'ACTIVO');

  const needsGramos = ppForm.tipo_pp === 'PORCION' || ppForm.tipo_pp === 'UND';

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '24px', fontWeight: 800, margin: 0 }}>Maestros</h1>
          <p style={{ color: 'var(--ts)', marginTop: '4px', fontSize: '14px' }}>Datos base del sistema</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {tab === 'pp' && (
            <button onClick={openNewPP} style={btnPrimary}>+ Nuevo PP</button>
          )}
          {tab === 'recetas' && (
            <>
              <input
                ref={recetasFileRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) importarRecetas(f); }}
              />
              <button
                onClick={recalcularRecetas}
                disabled={recetasRecalculando || recetas.length === 0}
                style={btnSecondary}
              >
                {recetasRecalculando ? 'Recalculando…' : '↻ Recalcular costos PP'}
              </button>
              <button
                onClick={recalcularCostosProduccion}
                disabled={recalcProd}
                style={{ ...btnSecondary, borderColor: '#6366F1', color: '#6366F1' }}
              >
                {recalcProd ? 'Actualizando…' : '↻ Costos producción histórica'}
              </button>
              <button
                onClick={() => recetasFileRef.current?.click()}
                disabled={recetasImportando}
                style={btnPrimary}
              >
                {recetasImportando ? 'Importando…' : '↑ Importar recetas PP'}
              </button>
            </>
          )}
          {tab === 'productos' && canManageProductos && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) actualizarCostos(f); }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadLoading}
                style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {uploadLoading ? 'Actualizando…' : '↑ Actualizar costo unitario'}
              </button>
              <button onClick={() => { setProdForm(emptyProd); setProdError(''); setProdModal(true); }} style={btnPrimary}>+ Nuevo producto</button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      {(() => {
        const prodSinCosto = productos.filter(p => p.activo !== false && (p.costo_promedio === 0 || p.costo_promedio == null));
        const ppSinProd    = pps.filter(pp => pp.activo !== false && !pp.codigo_producto);
        const tabLabels: Record<Tab, React.ReactNode> = {
          pp: (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              PPs
              {ppSinProd.length > 0 && (
                <span style={{ fontSize: '10px', fontWeight: 700, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: '20px', padding: '1px 7px' }}>
                  {ppSinProd.length} sin producto
                </span>
              )}
            </span>
          ),
          recetas: (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              Recetas PP
              {recetasNoActivo.length > 0 && (
                <span style={{ fontSize: '10px', fontWeight: 700, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: '20px', padding: '1px 7px' }}>
                  {recetasNoActivo.length} pendientes
                </span>
              )}
            </span>
          ),
          productos: (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              Productos
              {prodSinCosto.length > 0 && (
                <span style={{ fontSize: '10px', fontWeight: 700, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: '20px', padding: '1px 7px' }}>
                  {prodSinCosto.length} sin costo
                </span>
              )}
            </span>
          ),
          personal: 'Personal',
        };
        return (
          <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--bo)', paddingBottom: '0' }}>
            {(['pp', 'recetas', 'productos', 'personal'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setSearch('');
                  setRecetaSearch('');
                  if (t === 'recetas' && recetas.length === 0) loadRecetas();
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '10px 16px', fontSize: '14px', fontWeight: tab === t ? 600 : 400,
                  color: tab === t ? 'var(--ac)' : 'var(--ts)',
                  borderBottom: tab === t ? '2px solid var(--ac)' : '2px solid transparent',
                  marginBottom: '-1px', transition: 'color 0.15s',
                }}
              >
                {tabLabels[t]}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Search */}
      {tab !== 'recetas' && (
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar..."
          style={{ ...inputStyle, maxWidth: '280px', marginBottom: '16px' }}
        />
      )}

      {loading ? (
        <p style={{ color: 'var(--ts)', fontSize: '14px' }}>Cargando...</p>
      ) : (
        <>
          {/* ── Tab PPs ── */}
          {tab === 'pp' && (() => {
            const sinProd = pps.filter(pp => pp.activo !== false && !pp.codigo_producto);
            return sinProd.length > 0 && (
              <SinCostoPanel
                title={`${sinProd.length} PP${sinProd.length !== 1 ? 's' : ''} sin producto/insumo vinculado — no se puede calcular costo`}
                color="#92400E" bg="#FEF3C7" border="#FDE68A"
                items={sinProd.map(pp => `${pp.nombre} (${TIPO_LABEL[pp.tipo_pp]})`)}
              />
            );
          })()}
          {tab === 'pp' && (
            <TableCard>
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>Tipo</span>
                      <select
                        value={ppTipoFiltro}
                        onChange={e => setPPTipoFiltro(e.target.value as TipoPP | '')}
                        style={{
                          fontSize: '11px', fontWeight: 500, textTransform: 'none',
                          letterSpacing: 'normal', color: 'var(--tx)', background: 'var(--sf)',
                          border: '1px solid var(--bo)', borderRadius: '6px', padding: '2px 6px',
                          cursor: 'pointer',
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="">Todos</option>
                        {TIPOS_PP.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                      </select>
                    </div>
                  </Th>
                  <Th>Producto</Th>
                  <Th>Gramos/PP</Th>
                  <Th>{''}</Th>
                </tr>
              </thead>
              <tbody>
                {filteredPP.length === 0 && (
                  <tr><td colSpan={5} style={emptyCell}>Sin resultados{ppTipoFiltro ? ` para tipo "${TIPO_LABEL[ppTipoFiltro]}"` : ''}</td></tr>
                )}
                {filteredPP.map(pp => {
                  const prod = productos.find(p => p.codigo === pp.codigo_producto);
                  return (
                    <tr key={pp.id} style={{ opacity: pp.activo ? 1 : 0.45 }}>
                      <Td><span style={{ fontWeight: 500, fontSize: '13px' }}>{pp.nombre}</span></Td>
                      <Td><Badge color={tipoBadge[pp.tipo_pp]}>{TIPO_LABEL[pp.tipo_pp]}</Badge></Td>
                      <Td style={{ fontSize: '12px', color: 'var(--ts)' }}>{prod ? prod.nombre : pp.codigo_producto ?? '—'}</Td>
                      <Td style={{ fontSize: '13px' }}>{pp.gramos_por_pp ?? '—'}</Td>
                      <Td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button onClick={() => openEditPP(pp)} style={btnSm}>Editar</button>
                          <button onClick={() => togglePP(pp)} style={{ ...btnSm, color: pp.activo ? 'var(--rd)' : 'var(--tl)' }}>
                            {pp.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableCard>
          )}

          {/* ── Tab Recetas PP ── */}
          {tab === 'recetas' && (
            <>
              {recetasMsg && (
                <div style={{ background: recetasMsg.ok ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${recetasMsg.ok ? '#BBF7D0' : '#FECACA'}`, borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: recetasMsg.ok ? '#166534' : '#DC2626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{recetasMsg.ok ? '✓' : '⚠'} {recetasMsg.text}</span>
                  <button onClick={() => setRecetasMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'inherit', opacity: 0.6 }}>×</button>
                </div>
              )}

              <input
                value={recetaSearch}
                onChange={e => { setRecetaSearch(e.target.value); setSelectedReceta(null); }}
                placeholder="Buscar receta..."
                style={{ ...inputStyle, maxWidth: '280px', marginBottom: '16px' }}
              />

              {recetasLoading ? (
                <p style={{ color: 'var(--ts)', fontSize: '14px' }}>Cargando recetas…</p>
              ) : recetas.length === 0 ? (
                <div style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '12px', padding: '48px 24px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--ts)', fontSize: '14px', marginBottom: '8px' }}>No hay recetas importadas</p>
                  <p style={{ color: 'var(--ts)', fontSize: '12px' }}>Usa &quot;↑ Importar recetas PP&quot; para cargar el archivo Recetas Torobayo Actualizadas.xlsx</p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  {/* Tabla principal */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <TableCard>
                      <thead>
                        <tr>
                          {['Código', 'Nombre', 'Rendimiento', 'Costo unit.', 'Estado', ''].map(h => <Th key={h}>{h}</Th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecetas.length === 0 && (
                          <tr><td colSpan={6} style={emptyCell}>Sin resultados</td></tr>
                        )}
                        {filteredRecetas.map(rec => (
                          <tr
                            key={rec.id}
                            style={{ cursor: 'pointer', background: selectedReceta?.id === rec.id ? 'var(--bg)' : undefined }}
                            onClick={() => setSelectedReceta(selectedReceta?.id === rec.id ? null : rec)}
                          >
                            <Td><code style={{ fontSize: '11px', background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>{rec.codigo_receta}</code></Td>
                            <Td style={{ fontWeight: 500, fontSize: '13px' }}>{rec.nombre}</Td>
                            <Td style={{ fontSize: '12px', color: 'var(--ts)' }}>{rec.rendimiento} {rec.unidad_rendimiento}</Td>
                            <Td style={{ fontSize: '13px', fontFamily: "'Space Grotesk', sans-serif" }}>
                              {rec.costo_unitario_calculado > 0
                                ? `$${rec.costo_unitario_calculado.toLocaleString('es-CL')}`
                                : <span style={{ color: 'var(--ts)', fontSize: '12px' }}>Sin calcular</span>
                              }
                            </Td>
                            <Td><RecetaEstadoBadge estado={rec.estado} /></Td>
                            <Td><span style={{ fontSize: '12px', color: 'var(--ts)' }}>{selectedReceta?.id === rec.id ? '▲' : '▶'}</span></Td>
                          </tr>
                        ))}
                      </tbody>
                    </TableCard>
                  </div>

                  {/* Panel detalle */}
                  {selectedReceta && (
                    <div style={{ width: '360px', flexShrink: 0, background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '12px', padding: '18px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                        <div>
                          <p style={{ fontSize: '11px', color: 'var(--ts)', margin: '0 0 2px' }}>{selectedReceta.codigo_receta}{selectedReceta.codigo_pp ? ` → ${selectedReceta.codigo_pp}` : ''}</p>
                          <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700, margin: 0 }}>{selectedReceta.nombre}</h3>
                        </div>
                        <button onClick={() => setSelectedReceta(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--ts)', padding: '0' }}>×</button>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                        <div style={{ flex: 1, background: 'var(--bg)', borderRadius: '8px', padding: '8px 10px' }}>
                          <p style={{ fontSize: '10px', color: 'var(--ts)', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 2px' }}>Rendimiento</p>
                          <p style={{ fontSize: '16px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>{selectedReceta.rendimiento} {selectedReceta.unidad_rendimiento}</p>
                        </div>
                        <div style={{ flex: 1, background: 'var(--bg)', borderRadius: '8px', padding: '8px 10px' }}>
                          <p style={{ fontSize: '10px', color: 'var(--ts)', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 2px' }}>Costo/{selectedReceta.unidad_rendimiento}</p>
                          <p style={{ fontSize: '16px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                            {selectedReceta.costo_unitario_calculado > 0 ? `$${selectedReceta.costo_unitario_calculado.toLocaleString('es-CL')}` : '—'}
                          </p>
                        </div>
                      </div>

                      <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px' }}>
                        Ingredientes ({selectedReceta.ingredientes?.length ?? 0})
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '380px', overflowY: 'auto' }}>
                        {(selectedReceta.ingredientes ?? []).sort((a, b) => a.orden - b.orden).map(ing => (
                          <div key={ing.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: ing.sin_codigo ? '#FEF2F2' : ing.sin_costo ? '#FFFBEB' : 'var(--bg)', borderRadius: '6px', border: `1px solid ${ing.sin_codigo ? '#FECACA' : ing.sin_costo ? '#FDE68A' : 'var(--bo)'}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: '12px', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.nombre_ingrediente}</p>
                              <p style={{ fontSize: '11px', color: 'var(--ts)', margin: 0 }}>
                                {ing.cantidad} {ing.unidad_medida}
                                {ing.sin_codigo && <span style={{ color: '#DC2626', marginLeft: '6px' }}>sin código</span>}
                                {!ing.sin_codigo && ing.sin_costo && <span style={{ color: '#92400E', marginLeft: '6px' }}>sin costo</span>}
                              </p>
                            </div>
                            <span style={{ fontSize: '12px', fontFamily: "'Space Grotesk', sans-serif", color: ing.costo_linea_calculado > 0 ? 'var(--tx)' : 'var(--ts)', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                              {ing.costo_linea_calculado > 0 ? `$${ing.costo_linea_calculado.toLocaleString('es-CL')}` : '—'}
                            </span>
                          </div>
                        ))}
                      </div>

                      {selectedReceta.costo_total_calculado > 0 && (
                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--bo)', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>Costo total receta</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>${selectedReceta.costo_total_calculado.toLocaleString('es-CL')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Tab Productos ── */}
          {tab === 'productos' && uploadError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 16px', marginBottom: '12px', fontSize: '13px', color: '#DC2626' }}>
              ⚠ {uploadError}
            </div>
          )}
          {tab === 'productos' && uploadResult && (
            <div style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '10px', padding: '14px 18px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 2px' }}>En planilla</p>
                  <p style={{ fontSize: '20px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>{uploadResult.total_en_planilla}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 2px' }}>Actualizados</p>
                  <p style={{ fontSize: '20px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: 'var(--tl)', margin: 0 }}>{uploadResult.actualizados}</p>
                </div>
                {(uploadResult.insertados ?? 0) > 0 && (
                  <div>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 2px' }}>Nuevos</p>
                    <p style={{ fontSize: '20px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: '#6366F1', margin: 0 }}>{uploadResult.insertados}</p>
                  </div>
                )}
                {uploadResult.softland_sin_costo > 0 && (
                  <div>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 2px' }}>Costo 0 en Softland</p>
                    <p style={{ fontSize: '20px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: '#92400E', margin: 0 }}>{uploadResult.softland_sin_costo}</p>
                  </div>
                )}
                {uploadResult.pp_recalculadas !== undefined && (
                  <div>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#0D9373', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 2px' }}>PPs recalculados</p>
                    <p style={{ fontSize: '20px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: '#0D9373', margin: 0 }}>{uploadResult.pp_recalculadas}</p>
                  </div>
                )}
                {uploadResult.errores.length > 0 && (
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--rd)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Errores</p>
                    {uploadResult.errores.map((e, i) => (
                      <p key={i} style={{ fontSize: '12px', color: 'var(--rd)', margin: '2px 0' }}>{e}</p>
                    ))}
                  </div>
                )}
                <button onClick={() => setUploadResult(null)} style={{ ...btnSm, marginLeft: 'auto', color: 'var(--ts)' }}>✕ Cerrar</button>
              </div>
              {uploadResult.softland_sin_costo > 0 && uploadResult.detalle_softland_sin_costo.length > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--bo)' }}>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400E', margin: '0 0 6px' }}>
                    Productos con stock 0 en Softland — costo NO actualizado (conserva último valor conocido):
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {uploadResult.detalle_softland_sin_costo.map((s, i) => (
                      <span key={i} style={{ fontSize: '11px', background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: '6px', padding: '2px 8px' }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === 'productos' && (() => {
            const sinCosto = productos.filter(p => p.activo !== false && (p.costo_promedio === 0 || p.costo_promedio == null));
            return sinCosto.length > 0 && (
              <SinCostoPanel items={sinCosto.map(p => `${p.codigo} — ${p.nombre} (${p.unidad_medida})`)} />
            );
          })()}
          {tab === 'productos' && (
            <TableCard>
              <thead>
                <tr>
                  {['Código', 'Nombre', 'Unidad', 'Costo promedio', ''].map(h => <Th key={h}>{h}</Th>)}
                </tr>
              </thead>
              <tbody>
                {filteredProd.length === 0 && (
                  <tr><td colSpan={5} style={emptyCell}>Sin resultados. Usa &quot;+ Nuevo producto&quot; o importa desde Softland.</td></tr>
                )}
                {filteredProd.map(p => {
                  const sinCosto = p.costo_promedio === 0 || p.costo_promedio == null;
                  return (
                    <tr key={p.codigo} style={{ opacity: p.activo ? 1 : 0.45 }}>
                      <Td><code style={{ fontSize: '12px', background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>{p.codigo}</code></Td>
                      <Td style={{ fontWeight: 500, fontSize: '13px' }}>{p.nombre}</Td>
                      <Td><Badge color="#6366F1">{p.unidad_medida}</Badge></Td>
                      <Td>
                        {sinCosto
                          ? <span style={{ fontSize: '12px', fontWeight: 700, color: '#991B1B', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '6px', padding: '2px 8px' }}>Sin costo</span>
                          : <span style={{ fontSize: '13px' }}>${p.costo_promedio.toLocaleString('es-CL')}</span>
                        }
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {canManageProductos && <button onClick={() => openEditProd(p)} style={btnSm}>Editar</button>}
                          {canManageProductos && (
                            <button onClick={() => toggleProducto(p)} style={{ ...btnSm, color: p.activo ? 'var(--rd)' : 'var(--tl)' }}>
                              {p.activo ? 'Desactivar' : 'Activar'}
                            </button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableCard>
          )}

          {/* ── Tab Personal ── */}
          {tab === 'personal' && (
            <TableCard>
              <thead>
                <tr>
                  {['Nombre', 'Rol', 'Iniciales', 'Estado'].map(h => <Th key={h}>{h}</Th>)}
                </tr>
              </thead>
              <tbody>
                {filteredResp.map(r => (
                  <tr key={r.id}>
                    <Td style={{ fontWeight: 500, fontSize: '13px' }}>{r.nombre}</Td>
                    <Td><Badge color={rolBadge[r.rol] ?? '#6B7280'}>{r.rol}</Badge></Td>
                    <Td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: r.color_hex ?? '#6B7280', color: '#fff', fontSize: '11px', fontWeight: 700 }}>
                        {r.iniciales}
                      </span>
                    </Td>
                    <Td><Badge color={r.activo ? 'var(--tl)' : '#9CA3AF'}>{r.activo ? 'Activo' : 'Inactivo'}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}
        </>
      )}

      {/* ── Modal PP ── */}
      {ppModal !== false && (
        <Modal title={ppModal === 'new' ? 'Nuevo PP' : 'Editar PP'} onClose={() => setPPModal(false)}>
          <label style={labelStyle}>Nombre</label>
          <input
            value={ppForm.nombre}
            onChange={e => setPPForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="PP MECHADA"
            style={{ ...inputStyle, marginBottom: '12px' }}
          />

          <label style={labelStyle}>Tipo</label>
          <select
            value={ppForm.tipo_pp}
            onChange={e => setPPForm(f => ({ ...f, tipo_pp: e.target.value as TipoPP }))}
            style={{ ...inputStyle, marginBottom: '12px' }}
          >
            {TIPOS_PP.map(t => <option key={t} value={t}>{TIPO_LABEL[t]} ({t})</option>)}
          </select>

          <label style={labelStyle}>Producto / Insumo</label>
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <input
              ref={prodSearchRef}
              value={prodSearch}
              onChange={e => { setProdSearch(e.target.value); setProdDropdown(true); if (!e.target.value) setPPForm(f => ({ ...f, codigo_producto: '' })); }}
              onFocus={() => setProdDropdown(true)}
              onBlur={() => setTimeout(() => setProdDropdown(false), 150)}
              placeholder="Buscar producto..."
              style={{ ...inputStyle, width: '100%' }}
            />
            {prodDropdown && prodSearch && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 200, maxHeight: '200px', overflowY: 'auto' }}>
                {filteredProdSearch.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--ts)' }}>Sin resultados</div>
                ) : filteredProdSearch.map(p => (
                  <button
                    key={p.codigo}
                    onMouseDown={() => {
                      setPPForm(f => ({ ...f, codigo_producto: p.codigo }));
                      setProdSearch(p.nombre);
                      setProdDropdown(false);
                    }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ fontWeight: 500 }}>{p.nombre}</span>
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--ts)' }}>{p.codigo} · {p.unidad_medida}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {needsGramos && (
            <>
              <label style={labelStyle}>
                {ppForm.tipo_pp === 'PORCION' ? 'Gramos por porción' : 'Unidades por PP'}
              </label>
              <input
                type="number"
                value={ppForm.gramos_por_pp}
                onChange={e => setPPForm(f => ({ ...f, gramos_por_pp: e.target.value }))}
                placeholder={ppForm.tipo_pp === 'PORCION' ? '200' : '1'}
                step="1"
                style={{ ...inputStyle, marginBottom: '12px' }}
              />
            </>
          )}

          {ppError && <p style={{ color: 'var(--rd)', fontSize: '12px', marginBottom: '8px' }}>{ppError}</p>}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button onClick={() => setPPModal(false)} style={btnSecondary}>Cancelar</button>
            <button onClick={savePP} disabled={ppSaving} style={btnPrimary}>{ppSaving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </Modal>
      )}

      {/* ── Modal Producto ── */}
      {prodModal && (
        <Modal title="Nuevo producto" onClose={() => setProdModal(false)}>
          <label style={labelStyle}>Código Softland</label>
          <input value={prodForm.codigo} onChange={e => setProdForm(f => ({ ...f, codigo: e.target.value }))} placeholder="0301032" style={{ ...inputStyle, marginBottom: '12px' }} />

          <label style={labelStyle}>Nombre</label>
          <input value={prodForm.nombre} onChange={e => setProdForm(f => ({ ...f, nombre: e.target.value }))} placeholder="CARNE PLATEADA" style={{ ...inputStyle, marginBottom: '12px' }} />

          <label style={labelStyle}>Unidad de medida</label>
          <select value={prodForm.unidad_medida} onChange={e => setProdForm(f => ({ ...f, unidad_medida: e.target.value }))} style={{ ...inputStyle, marginBottom: '12px' }}>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>

          <label style={labelStyle}>Costo promedio (CLP)</label>
          <input type="number" value={prodForm.costo_promedio} onChange={e => setProdForm(f => ({ ...f, costo_promedio: e.target.value }))} placeholder="0" style={{ ...inputStyle, marginBottom: '12px' }} />

          {prodError && <p style={{ color: 'var(--rd)', fontSize: '12px', marginBottom: '8px' }}>{prodError}</p>}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button onClick={() => setProdModal(false)} style={btnSecondary}>Cancelar</button>
            <button onClick={saveProd} disabled={prodSaving} style={btnPrimary}>{prodSaving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </Modal>
      )}

      {prodEditModal && (
        <Modal title="Modificar producto" onClose={() => setProdEditModal(null)}>
          <label style={labelStyle}>Codigo Softland</label>
          <input
            value={isAdmin ? prodEditCode : prodEditModal.codigo}
            onChange={e => setProdEditCode(e.target.value)}
            placeholder="0301032"
            readOnly={!isAdmin}
            style={{
              ...inputStyle,
              marginBottom: '12px',
              background: !isAdmin ? 'var(--bg)' : inputStyle.background,
              color: !isAdmin ? 'var(--ts)' : inputStyle.color,
              cursor: !isAdmin ? 'not-allowed' : 'text',
            }}
          />

          <label style={labelStyle}>Nombre</label>
          <input
            value={prodEditName}
            onChange={e => setProdEditName(e.target.value)}
            placeholder="CARNE PLATEADA"
            style={{ ...inputStyle, marginBottom: '12px' }}
          />

          <label style={labelStyle}>Costo promedio (CLP)</label>
          <input
            type="number"
            value={prodEditCost}
            onChange={e => setProdEditCost(e.target.value)}
            placeholder="0"
            step="any"
            style={{ ...inputStyle, marginBottom: '12px' }}
          />

          {prodEditError && <p style={{ color: 'var(--rd)', fontSize: '12px', marginBottom: '8px' }}>{prodEditError}</p>}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button onClick={() => setProdEditModal(null)} style={btnSecondary}>Cancelar</button>
            <button onClick={saveProdEdit} disabled={prodEditSaving} style={btnPrimary}>{prodEditSaving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function SinCostoPanel({
  items, title, color = '#991B1B', bg = '#FEF2F2', border = '#FECACA',
}: {
  items: string[];
  title?: string;
  color?: string;
  bg?: string;
  border?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '10px', marginBottom: '12px', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color }}>
          ⚠ {title ?? `${items.length} producto${items.length !== 1 ? 's' : ''} sin costo — pueden afectar el cálculo`}
        </span>
        <span style={{ fontSize: '11px', color, opacity: 0.7 }}>{open ? '▲ Ocultar' : '▼ Ver lista'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {items.map((s, i) => (
            <span key={i} style={{ fontSize: '11px', background: 'rgba(255,255,255,0.7)', color, border: `1px solid ${border}`, borderRadius: '6px', padding: '2px 8px' }}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RecetaEstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, { bg: string; color: string; border: string; label: string }> = {
    ACTIVO:     { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0', label: 'Activo' },
    PENDIENTE:  { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Pendiente' },
    INCOMPLETO: { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA', label: 'Incompleto' },
  };
  const s = map[estado] ?? map['PENDIENTE'];
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: '20px', padding: '2px 8px' }}>
      {s.label}
    </span>
  );
}

function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)' }}>{children}</th>;
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--bo)', verticalAlign: 'middle', ...style }}>{children}</td>;
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}30` }}>{children}</span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: '20px' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--sf)', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '420px', boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: 800, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--ts)' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1.5px solid var(--bo)', borderRadius: '8px',
  padding: '9px 12px', fontFamily: 'DM Sans, sans-serif', fontSize: '14px',
  background: 'var(--bg)', color: 'var(--tx)', outline: 'none',
  boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--ts)',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px',
};
const btnPrimary: React.CSSProperties = {
  background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: '8px',
  padding: '9px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  background: 'var(--bg)', color: 'var(--tx)', border: '1.5px solid var(--bo)',
  borderRadius: '8px', padding: '9px 18px', fontSize: '14px', cursor: 'pointer',
};
const btnSm: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: '12px', color: 'var(--ac)',
  cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
};
const emptyCell: React.CSSProperties = {
  padding: '32px 14px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px',
};
const tipoBadge: Record<TipoPP, string> = {
  PORCION: 'var(--ac)', UND: '#6366F1', CC: '#0D9373', DIRECTO: '#D97706',
};
const rolBadge: Record<string, string> = {
  admin: '#8B5CF6', finanzas: '#3B82F6', jefatura: 'var(--ac)', economo: '#0EA5E9', cocina: '#D97706',
};
