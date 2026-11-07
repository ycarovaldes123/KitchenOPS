'use client';

import { useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { useRol } from '@/components/RolProvider';
import type { Producto, PP, TipoPP } from '@/types/database';
import RecetaPPEditorModal from '@/components/maestros/RecetaPPEditorModal';
import RecetaPPFicha, { RecetaEstadoChip } from '@/components/maestros/RecetaPPFicha';
import PersonalTab from '@/components/maestros/PersonalTab';
import NavIcon from '@/components/layout/NavIcon';
import type { PPReceta } from '@/components/maestros/types';
import { formatCostoUnitario, formatCantidad } from '@/lib/costo-receta-pp';
import './recetas-pp.css';

type Tab = 'pp' | 'recetas' | 'productos' | 'personal';
type AreaReceta = 'COCINA' | 'SALON';

// Recetas sin sección asignada (o antes de existir la columna) quedan en Cocina.
const areaDe = (r: PPReceta): AreaReceta => (r.area === 'SALON' ? 'SALON' : 'COCINA');

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
const UNIDADES = ['KG', 'GR', 'LT', 'UN', 'CC', 'PR', 'PQ'];

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
  // Cocina solo ve la pestaña Recetas PP y en modo consulta (sin crear/editar/importar/recalcular).
  const soloLectura = rol === 'cocina';
  const tabsVisibles: Tab[] = soloLectura ? ['recetas'] : ['pp', 'recetas', 'productos', 'personal'];
  const [tab, setTab]           = useState<Tab>(soloLectura ? 'recetas' : 'pp');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pps, setPPs]           = useState<PP[]>([]);
  const [loading, setLoading]   = useState(!soloLectura);
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
  const [prodEditUnidad, setProdEditUnidad] = useState('');
  const [prodEditDefontana, setProdEditDefontana] = useState('');
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
  const [conteoLoading, setConteoLoading] = useState(false);

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
  const [recetaModal, setRecetaModal] = useState<false | 'new' | { edit: PPReceta } | { copy: PPReceta }>(false);
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [soloDuplicadas, setSoloDuplicadas] = useState(false);
  const [areaRecetas, setAreaRecetas] = useState<AreaReceta>('COCINA');
  const [ocultarProdInactivos, setOcultarProdInactivos] = useState(true);
  const [prodFamilia, setProdFamilia] = useState('');
  const [prodSinDefontana, setProdSinDefontana] = useState(false);
  const [recetaAccion, setRecetaAccion] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const recetasBodyRef = useRef<HTMLTableSectionElement>(null);
  // Bajo 1100px la ficha no cabe al lado del listado: se abre como drawer
  const fichaEnDrawer = useMediaQuery('(max-width: 1099px)');

  useEffect(() => {
    if (!fichaEnDrawer || !drawerOpen || recetaModal !== false) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fichaEnDrawer, drawerOpen, recetaModal]);

  useEffect(() => {
    if (soloLectura) loadRecetas();
    else load();
  }, []);

  async function load() {
    setLoading(true);
    const [rPP, rProd] = await Promise.all([
      fetch('/api/maestros/pp', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/maestros/productos', { cache: 'no-store' }).then(r => r.json()),
    ]);
    setPPs(Array.isArray(rPP) ? rPP : []);
    setProductos(Array.isArray(rProd) ? rProd : []);
    setLoading(false);
  }

  async function loadRecetas() {
    setRecetasLoading(true);
    const r = await fetch('/api/maestros/recetas-pp?todas=1', { cache: 'no-store' }).then(res => res.json());
    const lista: PPReceta[] = Array.isArray(r) ? r : [];
    setRecetas(lista);
    setSelectedReceta(sel => sel ? lista.find(x => x.id === sel.id) ?? null : null);
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

  function seleccionarReceta(rec: PPReceta) {
    setSelectedReceta(rec);
    setDrawerOpen(true);
  }

  // ↑/↓ recorre el listado seleccionando (revisar recetas seguidas); Enter/Espacio selecciona
  function onRecetaRowKey(e: React.KeyboardEvent<HTMLTableRowElement>, idx: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      seleccionarReceta(filteredRecetas[idx]);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = Math.min(Math.max(idx + (e.key === 'ArrowDown' ? 1 : -1), 0), filteredRecetas.length - 1);
    if (next === idx) return;
    setSelectedReceta(filteredRecetas[next]);
    recetasBodyRef.current?.querySelector<HTMLElement>(`tr[data-idx="${next}"]`)?.focus();
  }

  async function toggleReceta(rec: PPReceta) {
    setRecetaAccion(rec.id);
    setRecetasMsg(null);
    try {
      const r = await fetch(`/api/maestros/recetas-pp/${rec.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !rec.activo }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setRecetasMsg({ ok: false, text: d.error ?? 'Error al actualizar' }); return; }
      setRecetasMsg({ ok: true, text: `Receta ${rec.codigo_receta} ${rec.activo ? 'desactivada' : 'activada'}` });
      await loadRecetas();
    } finally {
      setRecetaAccion(null);
    }
  }

  async function eliminarReceta(rec: PPReceta) {
    const ok = window.confirm(`¿Eliminar definitivamente la receta ${rec.codigo_receta} "${rec.nombre}"?\n\nSe borran también sus ${rec.ingredientes?.length ?? 0} ingredientes. Esta acción no se puede deshacer; si solo ya no se usa, es mejor Desactivarla.`);
    if (!ok) return;
    setRecetaAccion(rec.id);
    setRecetasMsg(null);
    try {
      const r = await fetch(`/api/maestros/recetas-pp/${rec.id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setRecetasMsg({ ok: false, text: d.error ?? 'Error al eliminar' }); return; }
      setRecetasMsg({ ok: true, text: `Receta ${rec.codigo_receta} eliminada` });
      setSelectedReceta(null);
      await loadRecetas();
    } finally {
      setRecetaAccion(null);
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
    setProdEditUnidad((p.unidad_medida ?? '').toUpperCase());
    setProdEditDefontana(p.codigo_defontana ?? '');
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
    if (!prodEditUnidad) { setProdEditError('La unidad de medida es requerida'); return; }

    setProdEditSaving(true);
    setProdEditError('');
    const r = await fetch(`/api/maestros/productos/${encodeURIComponent(prodEditModal.codigo)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isAdmin
        ? { codigo, nombre, unidad_medida: prodEditUnidad, costo_promedio: costo, codigo_defontana: prodEditDefontana.trim() }
        : { nombre, unidad_medida: prodEditUnidad, costo_promedio: costo, codigo_defontana: prodEditDefontana.trim() }),
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
      costo_promedio: data.costo_promedio, codigo_defontana: data.codigo_defontana ?? null,
      activo: data.activo, updated_at: data.updated_at,
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

  async function descargarConteoProductos() {
    setConteoLoading(true);
    setUploadError('');
    try {
      const res = await fetch('/api/maestros/productos/conteo');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Error generando Excel de conteo');
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `Conteo_Productos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Error generando Excel de conteo');
    } finally {
      setConteoLoading(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  const filteredPP = pps.filter(pp =>
    pp.nombre.toLowerCase().includes(search.toLowerCase()) &&
    (!ppTipoFiltro || pp.tipo_pp === ppTipoFiltro)
  );
  const filteredProd = productos.filter(p =>
    (!ocultarProdInactivos || p.activo !== false) &&
    (!prodFamilia.trim() || p.codigo.startsWith(prodFamilia.trim())) &&
    (!prodSinDefontana || !(p.codigo_defontana ?? '').trim()) &&
    (p.nombre.toLowerCase().includes(search.toLowerCase()) ||
     p.codigo.toLowerCase().includes(search.toLowerCase()) ||
     (p.codigo_defontana ?? '').includes(search.trim()))
  );
  const prodInactivos = productos.filter(p => p.activo === false).length;
  const prodSinDefontanaCount = productos.filter(p =>
    (!ocultarProdInactivos || p.activo !== false) && !(p.codigo_defontana ?? '').trim()
  ).length;
  const filteredProdSearch = productos.filter(p =>
    p.nombre.toLowerCase().includes(prodSearch.toLowerCase()) ||
    p.codigo.toLowerCase().includes(prodSearch.toLowerCase())
  ).slice(0, 8);

  const recetasActivas = recetas.filter(r => r.activo !== false);
  const duplicadas = recetasDuplicadas(recetasActivas);

  const filteredRecetas = recetas.filter(rec =>
    areaDe(rec) === areaRecetas &&
    (mostrarInactivas || rec.activo !== false) &&
    (!soloDuplicadas || duplicadas.has(rec.id)) &&
    (rec.nombre.toLowerCase().includes(recetaSearch.toLowerCase()) ||
     rec.codigo_receta.toLowerCase().includes(recetaSearch.toLowerCase()) ||
     (rec.codigo_pp ?? '').includes(recetaSearch))
  );

  const recetasNoActivo = recetasActivas.filter(r => r.estado !== 'ACTIVO');
  const recetasInactivas = recetas.filter(r => areaDe(r) === areaRecetas).length - recetasActivas.filter(r => areaDe(r) === areaRecetas).length;
  const conteoArea = (a: AreaReceta) => recetas.filter(r => areaDe(r) === a && (mostrarInactivas || r.activo !== false)).length;

  const needsGramos = ppForm.tipo_pp === 'PORCION' || ppForm.tipo_pp === 'UND';

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className={tab === 'recetas' ? 'page rpp-page' : 'page'}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '28px', fontWeight: 800, margin: 0, lineHeight: 1.15 }}>Maestros</h1>
          <p style={{ color: 'var(--ts)', marginTop: '4px', fontSize: '14px' }}>Datos base del sistema</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {tab === 'pp' && (
            <button onClick={openNewPP} style={btnPrimary}>+ Nuevo PP</button>
          )}
          {tab === 'recetas' && !soloLectura && (
            <div className="rpp rpp-actions">
              <input
                ref={recetasFileRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) importarRecetas(f); }}
              />
              <button type="button" className="rpp-btn" onClick={recalcularRecetas} disabled={recetasRecalculando || recetas.length === 0}>
                <NavIcon name="refresh" size={15} /> {recetasRecalculando ? 'Recalculando…' : 'Recalcular costos PP'}
              </button>
              <button type="button" className="rpp-btn" onClick={recalcularCostosProduccion} disabled={recalcProd}>
                <NavIcon name="history" size={15} /> {recalcProd ? 'Actualizando…' : 'Costos producción histórica'}
              </button>
              <button type="button" className="rpp-btn" onClick={() => recetasFileRef.current?.click()} disabled={recetasImportando}>
                <NavIcon name="upload" size={15} /> {recetasImportando ? 'Importando…' : 'Importar recetas PP'}
              </button>
              <button type="button" className="rpp-btn rpp-btn-primary" onClick={() => setRecetaModal('new')}>
                <NavIcon name="plus" size={15} /> Nueva receta
              </button>
            </div>
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
              <button
                onClick={descargarConteoProductos}
                disabled={conteoLoading}
                style={{ ...btnSecondary, borderColor: '#0D9373', color: '#0D9373' }}
              >
                {conteoLoading ? 'Generando...' : 'Conteo'}
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
          <div role="tablist" aria-label="Maestros" style={{ display: 'flex', gap: '4px', marginBottom: '24px', boxShadow: 'inset 0 -1px 0 var(--bo)', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {tabsVisibles.map(t => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
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
                  transition: 'color 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {tabLabels[t]}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Search */}
      {tab !== 'recetas' && tab !== 'personal' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            style={{ ...inputStyle, maxWidth: '280px' }}
          />
          {tab === 'productos' && (
            <div style={{ position: 'relative' }}>
              <input
                value={prodFamilia}
                onChange={e => setProdFamilia(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="Familia (ej. 0502)"
                aria-label="Filtrar por familia"
                style={{ ...inputStyle, width: '190px', paddingRight: prodFamilia ? '32px' : '12px' }}
              />
              {prodFamilia && (
                <button
                  type="button"
                  aria-label="Limpiar familia"
                  onClick={() => setProdFamilia('')}
                  style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--ts)', fontSize: '16px', cursor: 'pointer', padding: '2px 6px' }}
                >×</button>
              )}
            </div>
          )}
          {tab === 'productos' && (
            <button
              type="button"
              aria-pressed={prodSinDefontana}
              onClick={() => setProdSinDefontana(v => !v)}
              title="Mostrar solo productos sin código Defontana"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                fontSize: '13px', fontWeight: 600, borderRadius: '999px', padding: '7px 14px',
                color: prodSinDefontana ? '#fff' : 'var(--tx)',
                background: prodSinDefontana ? 'var(--ac)' : 'var(--sf)',
                border: `1px solid ${prodSinDefontana ? 'var(--ac)' : 'var(--bo)'}`,
              }}
            >
              Sin cód. Defontana
              <span style={{
                fontSize: '11px', fontWeight: 800, borderRadius: '999px', padding: '1px 8px',
                background: prodSinDefontana ? 'rgba(255,255,255,.25)' : '#FEF3C7',
                color: prodSinDefontana ? '#fff' : '#92400E',
              }}>{prodSinDefontanaCount}</span>
            </button>
          )}
          {tab === 'productos' && (
            <button
              type="button"
              role="switch"
              aria-checked={ocultarProdInactivos}
              onClick={() => setOcultarProdInactivos(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                fontSize: '13px', fontWeight: 600, color: 'var(--tx)',
                background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '999px', padding: '6px 14px 6px 6px',
              }}
            >
              <span style={{
                position: 'relative', width: '56px', height: '26px', borderRadius: '13px', flexShrink: 0,
                background: ocultarProdInactivos ? 'var(--tl)' : '#9CA3AF', transition: 'background .15s',
              }}>
                <span style={{
                  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                  left: ocultarProdInactivos ? '8px' : 'auto', right: ocultarProdInactivos ? 'auto' : '7px',
                  fontSize: '10px', fontWeight: 800, color: '#fff', letterSpacing: '.5px',
                }}>{ocultarProdInactivos ? 'ON' : 'OFF'}</span>
                <span style={{
                  position: 'absolute', top: '3px', left: ocultarProdInactivos ? '33px' : '3px',
                  width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .15s',
                }} />
              </span>
              Ocultar desactivados{prodInactivos > 0 ? ` (${prodInactivos})` : ''}
            </button>
          )}
        </div>
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
            <div className="rpp">
              {recetasMsg && (
                <div role="status" style={{ background: recetasMsg.ok ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${recetasMsg.ok ? '#BBF7D0' : '#FECACA'}`, borderRadius: '10px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: recetasMsg.ok ? '#166534' : '#DC2626', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <span>{recetasMsg.ok ? '✓' : '⚠'} {recetasMsg.text}</span>
                  <button type="button" aria-label="Cerrar mensaje" onClick={() => setRecetasMsg(null)} className="rpp-icon-btn" style={{ width: 28, height: 28, color: 'inherit' }}><NavIcon name="x" size={14} /></button>
                </div>
              )}

              <div className="rpp-areas" role="tablist" aria-label="Sección de recetas">
                {(['COCINA', 'SALON'] as AreaReceta[]).map(a => (
                  <button
                    key={a}
                    type="button"
                    role="tab"
                    aria-selected={areaRecetas === a}
                    className={`rpp-area-btn${areaRecetas === a ? ' is-active' : ''}`}
                    onClick={() => {
                      setAreaRecetas(a);
                      if (selectedReceta && areaDe(selectedReceta) !== a) { setSelectedReceta(null); setDrawerOpen(false); }
                    }}
                  >
                    {a === 'COCINA' ? 'Cocina' : 'Salón'}
                    <span className="rpp-area-count">{conteoArea(a)}</span>
                  </button>
                ))}
              </div>

              <div className="rpp-toolbar">
                <div className="rpp-search">
                  <NavIcon name="search" size={16} />
                  <input
                    value={recetaSearch}
                    onChange={e => setRecetaSearch(e.target.value)}
                    placeholder="Buscar receta o código..."
                    aria-label="Buscar receta"
                  />
                  {recetaSearch && (
                    <button type="button" className="rpp-search-clear" aria-label="Limpiar búsqueda" onClick={() => setRecetaSearch('')}>
                      <NavIcon name="x" size={14} />
                    </button>
                  )}
                </div>
                <label className="rpp-check">
                  <input type="checkbox" checked={mostrarInactivas} onChange={e => setMostrarInactivas(e.target.checked)} />
                  Mostrar inactivas
                  {recetasInactivas > 0 && <span className="rpp-check-count">{recetasInactivas}</span>}
                </label>
                {!soloLectura && <label className="rpp-check">
                  <input type="checkbox" checked={soloDuplicadas} onChange={e => setSoloDuplicadas(e.target.checked)} />
                  Solo posibles duplicadas
                  <span className={`rpp-check-count${duplicadas.size > 0 ? ' is-warn' : ''}`}>{duplicadas.size}</span>
                </label>}
              </div>

              {recetasLoading ? (
                <p style={{ color: 'var(--ts)', fontSize: '14px' }}>Cargando recetas…</p>
              ) : recetas.length === 0 ? (
                <div className="rpp-card rpp-empty">
                  <p style={{ fontSize: '14px', margin: '0 0 8px', color: 'var(--tx)' }}>No hay recetas PP</p>
                  {!soloLectura && <p style={{ margin: 0 }}>Usa &quot;Nueva receta&quot; o &quot;Importar recetas PP&quot; (hoja PRODUCCION de Recetas Torobayo Actualizadas.xlsx)</p>}
                </div>
              ) : (
                <div className="rpp-layout">
                  {/* Listado */}
                  <div className="rpp-card rpp-table-wrap">
                    <table className="rpp-table">
                      <thead>
                        <tr>
                          <th className="col-code" scope="col">Código</th>
                          <th scope="col">Nombre</th>
                          <th className="num col-rend" scope="col">Rendimiento</th>
                          <th className="num" scope="col">Costo unit.</th>
                          <th scope="col">Estado</th>
                          <th className="rpp-chevron" aria-hidden="true" />
                        </tr>
                      </thead>
                      <tbody ref={recetasBodyRef}>
                        {filteredRecetas.length === 0 && (
                          <tr><td colSpan={6} className="rpp-empty">Sin resultados{recetaSearch ? ` para “${recetaSearch}”` : ''}</td></tr>
                        )}
                        {filteredRecetas.map((rec, idx) => {
                          const selected = selectedReceta?.id === rec.id;
                          return (
                            <tr
                              key={rec.id}
                              data-idx={idx}
                              tabIndex={0}
                              aria-selected={selected}
                              className={`rpp-row${selected ? ' is-selected' : ''}${rec.activo === false ? ' is-inactive' : ''}`}
                              onClick={() => seleccionarReceta(rec)}
                              onKeyDown={e => onRecetaRowKey(e, idx)}
                            >
                              <td className="col-code"><span className="rpp-code">{rec.codigo_receta}</span></td>
                              <td>
                                <span className="rpp-row-name">{rec.nombre}</span>
                                {!soloLectura && duplicadas.has(rec.id) && <span className="rpp-tag" title="Otra receta activa tiene el mismo nombre o código PP">Duplicada</span>}
                                <span className="rpp-row-sub">{rec.codigo_receta} · {formatCantidad(rec.rendimiento)} {rec.unidad_rendimiento}</span>
                              </td>
                              <td className="num col-rend"><span className="rpp-num">{formatCantidad(rec.rendimiento)}</span><span className="rpp-num-unit">{rec.unidad_rendimiento}</span></td>
                              <td className="num">
                                {rec.costo_unitario_calculado > 0
                                  ? <><span className="rpp-num">{formatCostoUnitario(rec.costo_unitario_calculado)}</span><span className="rpp-num-unit">/{rec.unidad_rendimiento}</span></>
                                  : <span className="rpp-muted">Sin calcular</span>}
                              </td>
                              <td><RecetaEstadoChip receta={rec} /></td>
                              <td className="rpp-chevron"><NavIcon name="chevron" size={16} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Ficha: panel sticky en escritorio; drawer bajo 1100px */}
                  {!fichaEnDrawer && (
                    <aside className="rpp-aside" aria-label="Detalle de la receta">
                      {selectedReceta ? (
                        <RecetaPPFicha
                          receta={selectedReceta}
                          duplicada={!soloLectura && duplicadas.has(selectedReceta.id)}
                          soloLectura={soloLectura}
                          busy={recetaAccion === selectedReceta.id}
                          onEdit={() => setRecetaModal({ edit: selectedReceta })}
                          onCopy={() => setRecetaModal({ copy: selectedReceta })}
                          onToggle={() => toggleReceta(selectedReceta)}
                          onDelete={() => eliminarReceta(selectedReceta)}
                        />
                      ) : (
                        <div className="rpp-card rpp-ficha-empty">
                          <NavIcon name="utensils" size={28} strokeWidth={1.5} />
                          <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--tx)' }}>Selecciona una receta</p>
                          <p style={{ margin: 0 }}>Haz clic en una fila o usa ↑ ↓ para recorrer el listado.</p>
                        </div>
                      )}
                    </aside>
                  )}
                </div>
              )}

              {fichaEnDrawer && drawerOpen && selectedReceta && (
                <>
                  <div className="rpp-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
                  <div className="rpp rpp-drawer" role="dialog" aria-modal="true" aria-label={`Ficha ${selectedReceta.nombre}`}>
                    <div className="rpp-drawer-bar">
                      <button type="button" className="rpp-btn rpp-btn-sm" onClick={() => setDrawerOpen(false)} style={{ border: 'none', paddingLeft: 4 }}>
                        <NavIcon name="back" size={16} /> Recetas
                      </button>
                      <button type="button" className="rpp-icon-btn" aria-label="Cerrar ficha" onClick={() => setDrawerOpen(false)}>
                        <NavIcon name="x" size={18} />
                      </button>
                    </div>
                    <RecetaPPFicha
                      receta={selectedReceta}
                      duplicada={!soloLectura && duplicadas.has(selectedReceta.id)}
                      soloLectura={soloLectura}
                      busy={recetaAccion === selectedReceta.id}
                      onEdit={() => setRecetaModal({ edit: selectedReceta })}
                      onCopy={() => setRecetaModal({ copy: selectedReceta })}
                      onToggle={() => toggleReceta(selectedReceta)}
                      onDelete={() => eliminarReceta(selectedReceta)}
                    />
                  </div>
                </>
              )}
            </div>
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
                  {['Cód. Defontana', 'Código', 'Nombre', 'Unidad', 'Costo promedio', ''].map(h => <Th key={h}>{h}</Th>)}
                </tr>
              </thead>
              <tbody>
                {filteredProd.length === 0 && (
                  <tr><td colSpan={6} style={emptyCell}>{prodSinDefontana && !prodFamilia && !search ? 'Todos los productos tienen código Defontana.' : prodFamilia ? `Sin productos en la familia ${prodFamilia.trim()}${search ? ` para “${search}”` : ''}.` : <>Sin resultados. Usa &quot;+ Nuevo producto&quot; o importa desde Softland.</>}</td></tr>
                )}
                {filteredProd.map(p => {
                  const sinCosto = p.costo_promedio === 0 || p.costo_promedio == null;
                  return (
                    <tr key={p.codigo} style={{ opacity: p.activo ? 1 : 0.45 }}>
                      <Td>
                        {p.codigo_defontana
                          ? <code style={{ fontSize: '12px', background: '#EFF6FF', color: '#1D4ED8', padding: '2px 6px', borderRadius: '4px' }}>{p.codigo_defontana}</code>
                          : <span style={{ fontSize: '12px', color: 'var(--ts)' }}>—</span>}
                      </Td>
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
          {tab === 'personal' && <PersonalTab canEdit={isAdmin} />}
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

      {/* ── Modal Receta PP ── */}
      {recetaModal !== false && !soloLectura && (
        <RecetaPPEditorModal
          receta={recetaModal !== 'new' && 'edit' in recetaModal ? recetaModal.edit : null}
          copyFrom={recetaModal !== 'new' && 'copy' in recetaModal ? recetaModal.copy : null}
          areaInicial={areaRecetas}
          productos={productos}
          onClose={() => setRecetaModal(false)}
          onSaved={msg => {
            setRecetaModal(false);
            setRecetasMsg({ ok: true, text: msg });
            loadRecetas();
            load();
          }}
        />
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

          <label style={labelStyle}>Codigo Defontana</label>
          <input
            value={prodEditDefontana}
            onChange={e => setProdEditDefontana(e.target.value.replace(/\D/g, ''))}
            placeholder="Vacío si aún no existe en Defontana"
            inputMode="numeric"
            style={{ ...inputStyle, marginBottom: '12px' }}
          />

          <label style={labelStyle}>Nombre</label>
          <input
            value={prodEditName}
            onChange={e => setProdEditName(e.target.value)}
            placeholder="CARNE PLATEADA"
            style={{ ...inputStyle, marginBottom: '12px' }}
          />

          <label style={labelStyle}>Unidad de medida</label>
          <select
            value={prodEditUnidad}
            onChange={e => setProdEditUnidad(e.target.value)}
            style={{ ...inputStyle, marginBottom: prodEditUnidad !== (prodEditModal.unidad_medida ?? '').toUpperCase() ? '6px' : '12px' }}
          >
            {!UNIDADES.includes(prodEditUnidad) && <option value={prodEditUnidad}>{prodEditUnidad || '—'}</option>}
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          {prodEditUnidad !== (prodEditModal.unidad_medida ?? '').toUpperCase() && (
            <p style={{ fontSize: '12px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '8px 10px', margin: '0 0 12px' }}>
              ⚠ Cambias {prodEditModal.unidad_medida || '—'} → {prodEditUnidad}. Revisa que el costo corresponda a la nueva unidad (ej. costo por GR, no por KG).
              Se recalculan las recetas PP; los registros ya guardados de producción, mermas y colación no cambian.
            </p>
          )}

          <label style={labelStyle}>Costo promedio (CLP{prodEditUnidad ? ` por ${prodEditUnidad}` : ''})</label>
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

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    onChange => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// Recetas activas que comparten nombre (ignorando tildes, signos y el prefijo PP) o código PP.
// Ej: "PP CHAMPIÑONES HIDRATADOS" y "PP. CHAMPIÑONES HIDRATADOS", o 0501015 y 0501015-B.
function recetasDuplicadas(recetas: PPReceta[]): Set<string> {
  const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '').replace(/^PP/, '');
  const grupos = new Map<string, string[]>();
  const add = (k: string, id: string) => grupos.set(k, [...(grupos.get(k) ?? []), id]);
  for (const r of recetas) {
    add('n:' + norm(r.nombre), r.id);
    if (r.codigo_pp) add('c:' + r.codigo_pp, r.id);
  }
  const ids = new Set<string>();
  for (const g of grupos.values()) if (g.length > 1) g.forEach(id => ids.add(id));
  return ids;
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
