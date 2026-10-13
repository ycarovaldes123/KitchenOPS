'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCLP, formatPct } from '@/lib/calculos';
import NavIcon from '@/components/layout/NavIcon';
import { TIPOS_CARTA } from '@/lib/carta';
import ProductSearchSelect from './ProductSearchSelect';

interface ProductoMaestro {
  codigo: string;
  nombre: string;
  unidad_medida: string | null;
  costo_promedio?: number | null;
}

interface Ingrediente {
  id?: string;
  nombre: string | null;
  cantidad: number;
  unidad_medida: string | null;
  precio_unitario: number | null;
  costo_total: number | null;
  codigo_producto: string | null;
  pp_id: string | null;
}

interface PlatoEditable {
  id: string;
  cod_softland?: string | null;
  codigo_toteat?: string | null;
  nombre: string;
  categoria: string;
  tipo_carta?: 'ANTIGUA' | 'NUEVA';
  precio_carta: number | null;
  activo?: boolean;
  foto_url: string | null;
  carta_ingredientes: Ingrediente[];
}

interface IngredienteForm {
  localId: string;
  codigo_producto: string;
  pp_id: string | null;
  nombre: string;
  cantidad: string;
  unidad_medida: string;
  precio_unitario: string;
}

interface Props {
  plato: PlatoEditable | null;
  copyFrom?: PlatoEditable | null;
  defaultTipoCarta?: 'ANTIGUA' | 'NUEVA';
  forceCreate?: boolean;
  onCancel: () => void;
  onSaved: (id?: string) => void;
  canDelete?: boolean;
  onDeleted?: () => void;
}

const CATEGORIAS = ['PICADAS', 'CLASICOS', 'CLÁSICOS', 'SANDWICH & BURGERS', 'ENSALADAS', 'POSTRES', 'CATERING'];
const UNIDADES = ['KG', 'GR', 'LT', 'CC', 'UN', 'UND', 'PR'];
const FOTO_MAX_DIMENSION = 1600;
const FOTO_JPEG_QUALITY = 0.82;

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizarUM(um: string | null | undefined) {
  const val = (um ?? '').trim().toUpperCase();
  return val === 'UND' ? 'UN' : val;
}

function precioUnitarioPorUnidad(unidadIngrediente: string, producto: ProductoMaestro | undefined) {
  if (!producto) return null;
  const costo = Number(producto.costo_promedio) || 0;
  const iUM = normalizarUM(unidadIngrediente);
  const pUM = normalizarUM(producto.unidad_medida);
  if (!iUM || iUM === pUM) return costo;
  if (iUM === 'GR' && pUM === 'KG') return costo / 1000;
  if (iUM === 'CC' && pUM === 'LT') return costo / 1000;
  if (iUM === 'KG' && pUM === 'GR') return costo * 1000;
  if (iUM === 'LT' && pUM === 'CC') return costo * 1000;
  return costo;
}

function emptyRow(): IngredienteForm {
  return {
    localId: newId(),
    codigo_producto: '',
    pp_id: null,
    nombre: '',
    cantidad: '',
    unidad_medida: 'KG',
    precio_unitario: '',
  };
}

function rowFromIngrediente(ing: Ingrediente): IngredienteForm {
  return {
    localId: ing.id ?? newId(),
    codigo_producto: ing.codigo_producto ?? '',
    pp_id: ing.pp_id ?? null,
    nombre: ing.nombre ?? '',
    cantidad: ing.cantidad?.toString() ?? '',
    unidad_medida: ing.unidad_medida ?? 'KG',
    precio_unitario: ing.precio_unitario?.toString() ?? '',
  };
}

async function imageToOptimizedJpeg(file: File): Promise<File> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const scale = Math.min(1, FOTO_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la imagen');
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', FOTO_JPEG_QUALITY);
    });
    if (!blob) throw new Error('No se pudo comprimir la foto');

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto-plato';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, string>;
  } catch {
    if (res.status === 413 || text.toLowerCase().includes('request entity too large')) {
      return { error: 'La foto es demasiado pesada. Prueba con otra imagen o una captura mas liviana.' };
    }
    return { error: text.slice(0, 180) || 'Respuesta invalida del servidor' };
  }
}

// Modo edicion del panel lateral de Costos (crear, editar o copiar un plato).
export default function PlatoEditor({ plato, copyFrom = null, defaultTipoCarta = 'ANTIGUA', forceCreate = false, onCancel, onSaved, canDelete = false, onDeleted }: Props) {
  const source = plato ?? copyFrom;
  const isCopy = forceCreate || (!plato && !!copyFrom);
  const [productos, setProductos] = useState<ProductoMaestro[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const [codSoftland, setCodSoftland] = useState(source?.cod_softland ?? '');
  const [codigoToteat, setCodigoToteat] = useState(source?.codigo_toteat ?? '');
  const [nombre, setNombre] = useState(source?.nombre ?? '');
  const [categoria, setCategoria] = useState(plato?.categoria ?? 'CLÁSICOS');
  const [tipoCarta, setTipoCarta] = useState<'ANTIGUA' | 'NUEVA'>(source?.tipo_carta ?? defaultTipoCarta);
  const [precioCarta, setPrecioCarta] = useState(source?.precio_carta?.toString() ?? '');
  const [fotoUrl, setFotoUrl] = useState(source?.foto_url ?? '');
  const [activo, setActivo] = useState(source?.activo !== false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [ingredientes, setIngredientes] = useState<IngredienteForm[]>(
    source?.carta_ingredientes?.length ? source.carta_ingredientes.map(rowFromIngrediente) : [emptyRow()],
  );

  useEffect(() => {
    let alive = true;
    fetch('/api/maestros')
      .then(r => r.json())
      .then(data => {
        if (!alive) return;
        if (data.error) throw new Error(data.error);
        setProductos(data.productos ?? []);
      })
      .catch(e => alive && setError(e instanceof Error ? e.message : 'Error cargando productos'))
      .finally(() => alive && setLoadingProductos(false));
    return () => { alive = false; };
  }, []);

  async function handleFotoFile(file: File | null) {
    if (!file) return;
    setUploadingFoto(true);
    setError('');
    try {
      if (!file.type.startsWith('image/')) throw new Error('Selecciona un archivo de imagen');
      const uploadFile = await imageToOptimizedJpeg(file);
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('plato', nombre || plato?.nombre || 'plato');
      const res = await fetch('/api/carta/foto', {
        method: 'POST',
        body: formData,
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(data.error ?? 'Error subiendo foto');
      setFotoUrl(data.url ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error subiendo foto');
    } finally {
      setUploadingFoto(false);
    }
  }

  const productoMap = useMemo(
    () => new Map(productos.map(p => [p.codigo, p])),
    [productos],
  );

  const costoNeto = useMemo(() => ingredientes.reduce((sum, row) => {
    const cantidad = Number(row.cantidad) || 0;
    const producto = row.codigo_producto ? productoMap.get(row.codigo_producto) : undefined;
    const precio = producto
      ? precioUnitarioPorUnidad(row.unidad_medida, producto)
      : Number(row.precio_unitario) || 0;
    return sum + cantidad * (precio ?? 0);
  }, 0), [ingredientes, productoMap]);

  const costoBruto = Math.round(costoNeto * 1.19);
  const precioNum = Number(precioCarta) || 0;
  const margen = precioNum > 0 ? ((precioNum - costoBruto) / precioNum) * 100 : null;

  function updateRow(localId: string, patch: Partial<IngredienteForm>) {
    setIngredientes(rows => rows.map(r => r.localId === localId ? { ...r, ...patch } : r));
  }

  function handleProductoChange(localId: string, codigo: string) {
    const producto = productoMap.get(codigo);
    if (!producto) {
      updateRow(localId, {
        codigo_producto: '',
        pp_id: null,
        nombre: '',
        unidad_medida: 'KG',
        precio_unitario: '',
      });
      return;
    }
    const unidad = producto.unidad_medida ?? 'KG';
    const precio = precioUnitarioPorUnidad(unidad, producto);
    updateRow(localId, {
      codigo_producto: producto.codigo,
      pp_id: null,
      nombre: producto.nombre,
      unidad_medida: unidad,
      precio_unitario: precio == null ? '' : String(precio),
    });
  }

  function handleUnidadChange(localId: string, unidad: string) {
    const row = ingredientes.find(r => r.localId === localId);
    const producto = row?.codigo_producto ? productoMap.get(row.codigo_producto) : undefined;
    const precio = precioUnitarioPorUnidad(unidad, producto);
    updateRow(localId, {
      unidad_medida: unidad,
      precio_unitario: producto && precio != null ? String(precio) : row?.precio_unitario ?? '',
    });
  }

  function removeRow(localId: string) {
    setIngredientes(rows => rows.length === 1 ? [emptyRow()] : rows.filter(r => r.localId !== localId));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        id: forceCreate ? undefined : plato?.id,
        cod_softland: codSoftland,
        codigo_toteat: codigoToteat,
        nombre,
        categoria,
        tipo_carta: tipoCarta,
        precio_carta: precioCarta === '' ? null : Number(precioCarta),
        foto_url: fotoUrl,
        activo,
        ingredientes: ingredientes
          .filter(row => (Number(row.cantidad) || 0) > 0 && (row.codigo_producto || row.nombre.trim()))
          .map(row => ({
            codigo_producto: row.codigo_producto || null,
            pp_id: row.pp_id,
            nombre: row.nombre.trim() || null,
            cantidad: Number(row.cantidad) || 0,
            unidad_medida: row.unidad_medida || null,
            precio_unitario: row.precio_unitario === '' ? null : Number(row.precio_unitario),
          })),
      };

      const res = await fetch('/api/carta', {
        method: plato && !forceCreate ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando plato');
      onSaved(plato && !forceCreate ? plato.id : data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando plato');
    } finally {
      setSaving(false);
    }
  }

  async function deletePlato() {
    if (!plato || forceCreate || !canDelete) return;
    const ok = window.confirm(`¿Eliminar "${plato.nombre}" de la carta? El plato dejará de aparecer en Costos, pero se conserva el registro histórico.`);
    if (!ok) return;

    setDeleting(true);
    setError('');
    try {
      const res = await fetch('/api/carta', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plato.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando plato');
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminando plato');
    } finally {
      setDeleting(false);
    }
  }

  const titulo = isCopy ? 'Copiar plato' : plato ? 'Editar plato' : 'Nuevo plato';
  const lineasReceta = ingredientes.filter(i => i.nombre.trim() || i.codigo_producto).length;
  const colorMargen = margen == null ? 'var(--ts)' : margen >= 30 ? '#059669' : margen >= 25 ? '#B45309' : '#DC2626';

  return (
    <>
      <div className="ck-side__head">
        <p className="ck-eyebrow">{titulo}</p>
        <h2 className="ck-side__title">{nombre.trim() || 'Ficha de plato'}</h2>
      </div>
      <div className="ck-side__scroll">
        <div className="ck-side__body" style={{ paddingTop: '4px' }}>
          {error && <div className="ck-error" style={{ marginTop: '14px' }}>{error}</div>}

          <div className="ck-form ck-form--side">
            <label className="ck-field">
              Código
              <input value={codSoftland} onChange={e => setCodSoftland(e.target.value)} className="ck-input" />
            </label>
            <label className="ck-field">
              Código Toteat
              <input value={codigoToteat} onChange={e => setCodigoToteat(e.target.value)} className="ck-input" />
            </label>
            <label className="ck-field ck-field--full">
              Nombre del plato
              <input value={nombre} onChange={e => setNombre(e.target.value)} className="ck-input" />
            </label>
            <label className="ck-field ck-field--full">
              Categoría
              <input value={categoria} onChange={e => setCategoria(e.target.value)} list="categorias-carta" className="ck-input" />
              <datalist id="categorias-carta">
                {CATEGORIAS.map(c => <option key={c} value={c} />)}
              </datalist>
            </label>
            <label className="ck-field">
              Tipo de carta
              <select value={tipoCarta} onChange={e => setTipoCarta(e.target.value as 'ANTIGUA' | 'NUEVA')} className="ck-input">
                {TIPOS_CARTA.map(tipo => (
                  <option key={tipo} value={tipo}>
                    {tipo === 'NUEVA' ? 'Carta actual' : 'Antigua'}
                  </option>
                ))}
              </select>
            </label>
            <label className="ck-field">
              Precio carta
              <input type="number" min={0} step={1} value={precioCarta} onChange={e => setPrecioCarta(e.target.value)} className="ck-input" />
            </label>
            <label className="ck-field ck-field--full">
              Foto URL
              <input value={fotoUrl} onChange={e => setFotoUrl(e.target.value)} className="ck-input" />
            </label>
            <label className="ck-field ck-field--full">
              {uploadingFoto ? 'Subiendo foto...' : 'Subir foto'}
              <input
                type="file"
                accept="image/*"
                onChange={e => void handleFotoFile(e.target.files?.[0] ?? null)}
                className="ck-input"
                disabled={uploadingFoto}
              />
            </label>
            {canDelete && (
              <label className="ck-check ck-field--full">
                <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
                Plato activo
              </label>
            )}
          </div>

          <div className="ck-block__title" style={{ marginTop: '22px' }}>
            <span>Receta ({lineasReceta})</span>
            <button type="button" className="ck-btn ck-btn--sm" style={{ color: 'var(--ac)', borderColor: 'var(--bo-ac)' }} onClick={() => setIngredientes(rows => [...rows, emptyRow()])}>
              <NavIcon name="plus" size={14} /> Producto
            </button>
          </div>

          <div className="ck-ings">
            {ingredientes.map(row => {
              const producto = row.codigo_producto ? productoMap.get(row.codigo_producto) : undefined;
              const cantidad = Number(row.cantidad) || 0;
              const precio = producto ? precioUnitarioPorUnidad(row.unidad_medida, producto) : Number(row.precio_unitario) || 0;
              const costo = cantidad * (precio ?? 0);

              return (
                <div key={row.localId} className="ck-ing">
                  <div className="ck-ing__top">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <ProductSearchSelect
                        value={row.codigo_producto}
                        onChange={codigo => handleProductoChange(row.localId, codigo)}
                        productos={productos}
                        placeholder={row.pp_id ? 'PP / manual' : `Buscar en ${productos.length} productos...`}
                        allowManual
                        disabled={loadingProductos}
                      />
                    </div>
                    <button type="button" className="ck-icon-btn" onClick={() => removeRow(row.localId)} aria-label="Quitar producto de la receta" title="Quitar producto">
                      <NavIcon name="trash" size={15} />
                    </button>
                  </div>
                  {!producto && (
                    <input
                      value={row.nombre}
                      onChange={e => updateRow(row.localId, { nombre: e.target.value })}
                      placeholder="Nombre del ingrediente (manual)"
                      className="ck-input ck-input--sm"
                      style={{ marginTop: '8px' }}
                    />
                  )}
                  <div className="ck-ing__grid">
                    <label className="ck-field">
                      Cantidad
                      <input type="number" min={0} step="any" value={row.cantidad}
                        onChange={e => updateRow(row.localId, { cantidad: e.target.value })} className="ck-input ck-input--sm" />
                    </label>
                    <label className="ck-field">
                      U/M
                      <input value={row.unidad_medida} list="unidades-receta"
                        onChange={e => handleUnidadChange(row.localId, e.target.value.toUpperCase())} className="ck-input ck-input--sm" />
                    </label>
                    <label className="ck-field">
                      Precio unit.
                      <input type="number" min={0} step="any"
                        value={producto && precio != null ? String(precio) : row.precio_unitario}
                        onChange={e => updateRow(row.localId, { precio_unitario: e.target.value })}
                        disabled={!!producto} className="ck-input ck-input--sm" />
                    </label>
                    <div className="ck-field">
                      Costo
                      <span className="ck-ing__costo">{formatCLP(Math.round(costo))}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <datalist id="unidades-receta">
            {UNIDADES.map(u => <option key={u} value={u} />)}
          </datalist>
        </div>
      </div>

      <div className="ck-side__foot">
        <div className="ck-side__totals">
          <div><span>Costo neto</span><strong>{formatCLP(Math.round(costoNeto))}</strong></div>
          <div><span>Costo bruto</span><strong>{formatCLP(costoBruto)}</strong></div>
          <div><span>Margen</span><strong style={{ color: colorMargen }}>{formatPct(margen)}</strong></div>
        </div>
        <div className="ck-side__buttons">
          {plato && !forceCreate && canDelete && (
            <button type="button" className="ck-btn ck-btn--danger" onClick={deletePlato} disabled={saving || deleting}>
              <NavIcon name="trash" size={15} /> {deleting ? 'Eliminando...' : 'Eliminar plato'}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="ck-btn" onClick={onCancel} disabled={saving || deleting}>
            Cancelar
          </button>
          <button type="button" className="ck-btn ck-btn--primary" onClick={save} disabled={saving || deleting || uploadingFoto}>
            <NavIcon name="save" size={15} /> {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </>
  );
}
