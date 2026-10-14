'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCLP, formatPct } from '@/lib/calculos';
import NavIcon from '@/components/layout/NavIcon';
import { CATEGORIAS_CARTA, NOMBRE_TIPO_CARTA, TIPOS_CARTA, esTipoCarta, type TipoCarta } from '@/lib/carta';
import ProductSearchSelect from './ProductSearchSelect';
import SelectBuscable from './SelectBuscable';
import { PlatoFoto } from './shared';

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
  tipo_carta?: TipoCarta;
  precio_carta: number | null;
  activo?: boolean;
  foto_url: string | null;
  carta_ingredientes: Ingrediente[];
}

/** Datos para precargar un plato nuevo (p. ej. desde un producto vendido en Toteat). */
export interface PrefillPlato {
  codigo_toteat: string;
  nombre: string;
  categoria?: string;
  tipo_carta?: TipoCarta;
  precio_carta?: number | null;
  /** Texto de ayuda bajo el precio (de donde sale el valor sugerido). */
  precio_ayuda?: string;
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
  defaultTipoCarta?: TipoCarta;
  forceCreate?: boolean;
  prefill?: PrefillPlato;
  /** Rechaza crear el plato si el codigo Toteat ya esta asociado a otro (alta desde Defontana). */
  validarToteatUnico?: boolean;
  onCancel: () => void;
  onSaved: (id?: string) => void;
  canDelete?: boolean;
  onDeleted?: () => void;
  /** El servidor detecto un plato existente con el mismo codigo Toteat. */
  onAbrirExistente?: (id: string) => void;
}

const FOTO_MAX_DIMENSION = 1600;
const FOTO_JPEG_QUALITY = 0.82;
const FOTO_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
// El servidor acepta hasta 4 MB ya comprimida; el original puede ser mayor porque se reduce antes de subir.
const FOTO_MAX_ORIGINAL_MB = 20;

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizarUM(um: string | null | undefined) {
  const val = (um ?? '').trim().toUpperCase();
  return val === 'UND' ? 'UN' : val;
}

// Conversiones validas entre la unidad de la receta y la del maestro de productos.
const UNIDADES_COMPATIBLES: Record<string, string[]> = {
  KG: ['KG', 'GR'],
  GR: ['GR', 'KG'],
  LT: ['LT', 'CC'],
  CC: ['CC', 'LT'],
};

function unidadesPara(unidadProducto: string) {
  const pUM = normalizarUM(unidadProducto);
  return UNIDADES_COMPATIBLES[pUM] ?? (pUM ? [pUM] : []);
}

function unidadCompatible(unidadIngrediente: string, unidadProducto: string) {
  const iUM = normalizarUM(unidadIngrediente);
  return !iUM || unidadesPara(unidadProducto).includes(iUM);
}

// Misma formula que el servidor (app/api/carta/route.ts). Unidades sin conversion se costean 1:1,
// como siempre; el editor las marca con advertencia en vez de cambiar el calculo.
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

function parseCantidad(value: string) {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

const FORMATO_DECIMAL = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 });

function formatPrecioUnit(precio: number) {
  return precio >= 100 ? formatCLP(Math.round(precio)) : `$${FORMATO_DECIMAL.format(precio)}`;
}

function emptyRow(): IngredienteForm {
  return {
    localId: newId(),
    codigo_producto: '',
    pp_id: null,
    nombre: '',
    cantidad: '',
    unidad_medida: '',
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
    unidad_medida: ing.unidad_medida ?? '',
    precio_unitario: ing.precio_unitario?.toString() ?? '',
  };
}

function nombreArchivoDesdeUrl(url: string) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    return last.replace(/^\d{10,}-/, '') || url;
  } catch {
    return url;
  }
}

async function imageToOptimizedJpeg(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error('No se pudo leer la imagen: el archivo está dañado o no es una imagen válida.');
    }

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
// Maestro de productos compartido entre aperturas del editor: se recarga como maximo cada 5 min
// (descargarlo y parsearlo en cada "Editar" trababa la apertura del panel).
const PRODUCTOS_TTL_MS = 5 * 60 * 1000;
let productosCache: { data: ProductoMaestro[]; at: number } | null = null;

export default function PlatoEditor({
  plato, copyFrom = null, defaultTipoCarta = 'ANTIGUA', forceCreate = false, prefill, validarToteatUnico = false,
  onCancel, onSaved, canDelete = false, onDeleted, onAbrirExistente,
}: Props) {
  const source = plato ?? copyFrom;
  const isCopy = forceCreate || (!plato && !!copyFrom);
  const [productos, setProductos] = useState<ProductoMaestro[]>(() => productosCache?.data ?? []);
  const [loadingProductos, setLoadingProductos] = useState(() => !productosCache);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [platoExistente, setPlatoExistente] = useState<string | null>(null);

  const [codSoftland, setCodSoftland] = useState(source?.cod_softland ?? '');
  const [codigoToteat, setCodigoToteat] = useState(source?.codigo_toteat ?? prefill?.codigo_toteat ?? '');
  const [nombre, setNombre] = useState(source?.nombre ?? prefill?.nombre ?? '');
  const [categoria, setCategoria] = useState(source?.categoria ?? prefill?.categoria ?? '');
  const [tipoCarta, setTipoCarta] = useState<TipoCarta>(() => {
    const tipo = source?.tipo_carta ?? prefill?.tipo_carta ?? defaultTipoCarta;
    return esTipoCarta(tipo) ? tipo : 'ANTIGUA';
  });
  const [precioCarta, setPrecioCarta] = useState(source?.precio_carta?.toString() ?? prefill?.precio_carta?.toString() ?? '');
  const [fotoUrl, setFotoUrl] = useState(source?.foto_url ?? '');
  const [fotoNombre, setFotoNombre] = useState('');
  const [activo, setActivo] = useState(source?.activo !== false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [ingredientes, setIngredientes] = useState<IngredienteForm[]>(
    source?.carta_ingredientes?.length ? source.carta_ingredientes.map(rowFromIngrediente) : [emptyRow()],
  );
  // Fila recien agregada: su buscador recibe el foco al montarse.
  const [filaNueva, setFilaNueva] = useState<string | null>(null);
  const ingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (productosCache && Date.now() - productosCache.at < PRODUCTOS_TTL_MS) return;
    let alive = true;
    fetch('/api/maestros')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        productosCache = { data: data.productos ?? [], at: Date.now() };
        if (alive) setProductos(productosCache.data);
      })
      .catch(e => alive && setError(e instanceof Error ? e.message : 'Error cargando productos'))
      .finally(() => alive && setLoadingProductos(false));
    return () => { alive = false; };
  }, []);

  // Categoria antigua fuera de la lista oficial: se conserva como opcion para no perderla al editar.
  const opcionesCategoria = useMemo(() => {
    const lista: string[] = [...CATEGORIAS_CARTA];
    const actual = source?.categoria?.trim().toUpperCase();
    if (actual && !lista.includes(actual)) lista.push(actual);
    return lista.map(c => ({ value: c, label: c }));
  }, [source?.categoria]);

  const opcionesCarta = useMemo(() => TIPOS_CARTA.map(t => ({ value: t, label: NOMBRE_TIPO_CARTA[t] })), []);

  async function handleFotoFile(file: File | null) {
    if (fotoInputRef.current) fotoInputRef.current.value = '';
    if (!file) return;
    setError('');
    if (!FOTO_TIPOS.includes(file.type)) {
      setError('Formato de foto no permitido. Usa JPG, PNG o WEBP.');
      return;
    }
    if (file.size > FOTO_MAX_ORIGINAL_MB * 1024 * 1024) {
      setError(`La foto pesa más de ${FOTO_MAX_ORIGINAL_MB} MB. Usa una imagen más liviana.`);
      return;
    }
    setUploadingFoto(true);
    try {
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
      setFotoNombre(file.name);
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

  // Costo de cada fila: precio desde el maestro (o el guardado si el producto ya no esta en el maestro).
  const filas = useMemo(() => ingredientes.map(row => {
    const producto = row.codigo_producto ? productoMap.get(row.codigo_producto) : undefined;
    const cantidad = parseCantidad(row.cantidad);
    const precio = producto
      ? precioUnitarioPorUnidad(row.unidad_medida, producto)
      : row.precio_unitario === '' ? null : Number(row.precio_unitario);
    const sinCosto = !!row.codigo_producto && !(Number(producto?.costo_promedio) > 0) && !(producto == null && (precio ?? 0) > 0);
    const costo = Number.isFinite(cantidad) && cantidad > 0 && precio != null && Number.isFinite(precio) ? cantidad * precio : 0;
    const umIncompatible = !!producto && !unidadCompatible(row.unidad_medida, producto.unidad_medida ?? '');
    return { row, producto, precio, costo, sinCosto, umIncompatible };
  }), [ingredientes, productoMap]);

  const costoNeto = filas.reduce((sum, f) => sum + f.costo, 0);
  const costoBruto = Math.round(costoNeto * 1.19);
  const precioNum = Number(precioCarta) || 0;
  const margen = precioNum > 0 && costoNeto > 0 ? ((precioNum - costoBruto) / precioNum) * 100 : null;
  const filasSinCosto = filas.filter(f => f.sinCosto).length;

  function updateRow(localId: string, patch: Partial<IngredienteForm>) {
    setIngredientes(rows => rows.map(r => r.localId === localId ? { ...r, ...patch } : r));
  }

  function enfocar(localId: string, selector: string) {
    requestAnimationFrame(() => {
      const el = ingsRef.current?.querySelector<HTMLInputElement>(`[data-row="${localId}"] ${selector}`);
      el?.focus();
      el?.select?.();
    });
  }

  // Al elegir un producto: nombre, U/M y precio salen siempre del maestro (la U/M anterior no se arrastra).
  function handleProductoChange(localId: string, codigo: string) {
    const producto = productoMap.get(codigo);
    if (!producto) {
      updateRow(localId, { codigo_producto: '', pp_id: null, nombre: '', unidad_medida: '', precio_unitario: '' });
      return;
    }
    const unidad = normalizarUM(producto.unidad_medida);
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

  function agregarFila() {
    const fila = emptyRow();
    setIngredientes(rows => [...rows, fila]);
    setFilaNueva(fila.localId);
  }

  // Enter en Cantidad: pasa al buscador del siguiente ingrediente (o agrega una fila nueva).
  function siguienteIngrediente(localId: string) {
    const idx = ingredientes.findIndex(r => r.localId === localId);
    const siguiente = ingredientes[idx + 1];
    if (siguiente) enfocar(siguiente.localId, '.ck-ing__buscar input');
    else agregarFila();
  }

  function removeRow(localId: string) {
    setIngredientes(rows => rows.length === 1 ? [emptyRow()] : rows.filter(r => r.localId !== localId));
  }

  function validar(): string | null {
    if (!nombre.trim()) return 'Falta el nombre del plato.';
    if (!categoria.trim() || !opcionesCategoria.some(o => o.value === categoria)) return 'Elige una categoría de la lista.';
    if (!esTipoCarta(tipoCarta)) return 'Elige un tipo de carta de la lista.';
    if (precioCarta !== '' && !(Number(precioCarta) >= 0)) return 'El precio carta no es un número válido.';
    for (const f of filas) {
      const tieneProducto = !!f.row.codigo_producto || !!f.row.nombre.trim();
      const cantidad = parseCantidad(f.row.cantidad);
      if (!tieneProducto) {
        if (f.row.cantidad.trim() !== '') return 'Hay una fila con cantidad pero sin producto: elige el producto o quita la fila.';
        continue;
      }
      const etiqueta = f.producto?.nombre ?? f.row.nombre ?? f.row.codigo_producto;
      if (f.row.cantidad.trim() === '' || !Number.isFinite(cantidad) || cantidad <= 0) return `Ingresa una cantidad válida para ${etiqueta}.`;
      if (f.producto && !f.row.unidad_medida) return `Falta la unidad de medida de ${etiqueta}.`;
    }
    return null;
  }

  async function save() {
    if (saving) return;
    setError('');
    setPlatoExistente(null);
    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }
    const codigos = ingredientes.map(r => r.codigo_producto).filter(Boolean);
    const repetidos = [...new Set(codigos.filter((c, i) => codigos.indexOf(c) !== i))];
    if (repetidos.length) {
      const nombres = repetidos.map(c => productoMap.get(c)?.nombre ?? c).join(', ');
      if (!window.confirm(`Estos productos están más de una vez en la receta: ${nombres}. ¿Guardar igual?`)) return;
    }

    setSaving(true);
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
        validar_toteat_unico: validarToteatUnico || undefined,
        ingredientes: ingredientes
          .filter(row => parseCantidad(row.cantidad) > 0 && (row.codigo_producto || row.nombre.trim()))
          .map(row => ({
            codigo_producto: row.codigo_producto || null,
            pp_id: row.pp_id,
            nombre: row.nombre.trim() || null,
            cantidad: parseCantidad(row.cantidad),
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
      if (!res.ok) {
        if (data.plato_existente) setPlatoExistente(data.plato_existente);
        throw new Error(data.error ?? 'Error guardando plato');
      }
      onSaved(plato && !forceCreate ? plato.id : data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando plato');
    } finally {
      setSaving(false);
    }
  }

  // F12 guarda el plato (atajo pedido por cocina); se ignora mientras se guarda o sube la foto.
  const atajoGuardar = useRef<(() => void) | null>(null);
  useEffect(() => {
    atajoGuardar.current = saving || deleting || uploadingFoto ? null : () => void save();
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F12') return;
      e.preventDefault();
      atajoGuardar.current?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

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
          <div className="ck-form ck-form--side">
            <label className="ck-field">
              Código Softland
              <input value={codSoftland} onChange={e => setCodSoftland(e.target.value)} className="ck-input" />
            </label>
            <label className="ck-field">
              Código Toteat
              <input value={codigoToteat} onChange={e => setCodigoToteat(e.target.value)} className="ck-input" />
            </label>
            <label className="ck-field ck-field--full ck-field--half">
              Nombre del plato
              <input value={nombre} onChange={e => setNombre(e.target.value)} className="ck-input" autoFocus={!plato && !forceCreate && !prefill} />
            </label>
            <div className="ck-field ck-field--full ck-field--half">
              Categoría
              <SelectBuscable value={categoria} onChange={setCategoria} opciones={opcionesCategoria} ariaLabel="Categoría" placeholder="Elegir categoría..." />
            </div>
            <div className="ck-field">
              Tipo de carta
              <SelectBuscable value={tipoCarta} onChange={v => esTipoCarta(v) && setTipoCarta(v)} opciones={opcionesCarta} ariaLabel="Tipo de carta" />
            </div>
            <label className="ck-field">
              Precio carta
              <input type="number" min={0} step={1} value={precioCarta} onChange={e => setPrecioCarta(e.target.value)} className="ck-input" />
              {prefill?.precio_ayuda && precioCarta === String(prefill.precio_carta ?? '') && (
                <span className="ck-field__hint">{prefill.precio_ayuda}</span>
              )}
            </label>
            <div className="ck-field ck-field--full ck-field--half">
              Foto
              <div className="ck-foto">
                <div className="ck-foto__thumb"><PlatoFoto src={fotoUrl || null} alt={nombre || 'Plato'} iconSize={18} /></div>
                <div className="ck-foto__info">
                  <strong title={fotoUrl || undefined}>{fotoUrl ? (fotoNombre || nombreArchivoDesdeUrl(fotoUrl)) : 'Sin foto'}</strong>
                  <span>{uploadingFoto ? 'Subiendo...' : 'JPG, PNG o WEBP'}</span>
                </div>
                <button type="button" className="ck-btn ck-btn--sm" onClick={() => fotoInputRef.current?.click()} disabled={uploadingFoto}>
                  <NavIcon name="image" size={14} /> {uploadingFoto ? 'Subiendo...' : fotoUrl ? 'Reemplazar' : 'Subir foto'}
                </button>
                {fotoUrl && !uploadingFoto && (
                  <button type="button" className="ck-icon-btn" onClick={() => { setFotoUrl(''); setFotoNombre(''); }} aria-label="Quitar foto" title="Quitar foto">
                    <NavIcon name="x" size={15} />
                  </button>
                )}
                <input
                  ref={fotoInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={e => void handleFotoFile(e.target.files?.[0] ?? null)}
                  hidden
                />
              </div>
            </div>
            <label className="ck-field ck-field--full ck-field--half">
              Foto URL
              <input value={fotoUrl} onChange={e => { setFotoUrl(e.target.value); setFotoNombre(''); }} className="ck-input" placeholder="Se completa al subir una foto" />
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
            <button type="button" className="ck-btn ck-btn--sm" style={{ color: 'var(--ac)', borderColor: 'var(--bo-ac)' }} onClick={agregarFila}>
              <NavIcon name="plus" size={14} /> Producto
            </button>
          </div>

          <div className="ck-ings" ref={ingsRef}>
            <div className="ck-ing ck-ing--head" aria-hidden="true">
              <span>Código</span><span>Ingrediente</span><span>Cantidad</span><span>U/M</span>
              <span className="num">Precio unit.</span><span className="num">Costo</span><span />
            </div>
            {filas.map(({ row, producto, precio, costo, sinCosto, umIncompatible }) => {
              const unidadProducto = normalizarUM(producto?.unidad_medida);
              const opcionesUM = producto ? [...unidadesPara(unidadProducto)] : [];
              const umActual = normalizarUM(row.unidad_medida);
              if (umActual && producto && !opcionesUM.includes(umActual)) opcionesUM.push(umActual);
              const vinculado = !!producto;
              const huerfano = !producto && (!!row.codigo_producto || !!row.nombre.trim());

              return (
                <div key={row.localId} className={`ck-ing${vinculado ? ' is-linked' : ''}`} data-row={row.localId}>
                  {vinculado && <span className="ck-ing__code" title="Código de producto">{producto.codigo}</span>}
                  <div className={`ck-ing__buscar${vinculado ? '' : ' is-wide'}`}>
                    <ProductSearchSelect
                      value={row.codigo_producto}
                      onChange={codigo => handleProductoChange(row.localId, codigo)}
                      onSeleccionado={() => enfocar(row.localId, 'input[data-cantidad]')}
                      productos={productos}
                      soloNombre
                      autoFocus={row.localId === filaNueva}
                      placeholder={huerfano
                        ? `${row.codigo_producto ? row.codigo_producto + ' · ' : ''}${row.nombre} — elige el producto del maestro`
                        : loadingProductos ? 'Cargando productos...' : `Buscar código o nombre (${productos.length} productos)...`}
                      allowManual={false}
                      disabled={loadingProductos}
                    />
                  </div>
                  <label className="ck-ing__cell">
                    <span className="ck-ing__lbl">Cantidad</span>
                    <input
                      type="number" min={0} step="any" inputMode="decimal" data-cantidad
                      value={row.cantidad}
                      onChange={e => updateRow(row.localId, { cantidad: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); siguienteIngrediente(row.localId); } }}
                      className="ck-input ck-input--sm"
                    />
                  </label>
                  <label className="ck-ing__cell">
                    <span className="ck-ing__lbl">U/M</span>
                    {producto ? (
                      <select
                        value={umActual}
                        onChange={e => handleUnidadChange(row.localId, e.target.value)}
                        className={`ck-input ck-input--sm${umIncompatible ? ' is-warn' : ''}`}
                        disabled={opcionesUM.length < 2}
                        title={umIncompatible ? `Unidad distinta al maestro (${unidadProducto}) sin conversión: se costea 1:1` : undefined}
                      >
                        {opcionesUM.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : (
                      <span className="ck-ing__static">{row.unidad_medida || '—'}</span>
                    )}
                  </label>
                  <div className="ck-ing__cell num">
                    <span className="ck-ing__lbl">Precio unit.</span>
                    <span className={`ck-ing__static${sinCosto ? ' is-warn' : ''}`}>
                      {!row.codigo_producto && !huerfano ? '—' : sinCosto ? 'Sin costo' : precio != null ? formatPrecioUnit(precio) : '—'}
                    </span>
                  </div>
                  <div className="ck-ing__cell num">
                    <span className="ck-ing__lbl">Costo</span>
                    <span className="ck-ing__costo">{costo > 0 ? formatCLP(Math.round(costo)) : '—'}</span>
                  </div>
                  <button type="button" className="ck-icon-btn ck-ing__del" tabIndex={-1} onClick={() => removeRow(row.localId)} aria-label="Quitar producto de la receta" title="Quitar producto">
                    <NavIcon name="trash" size={15} />
                  </button>
                  {(umIncompatible || huerfano) && (
                    <p className="ck-ing__warn">
                      <NavIcon name="triangle-alert" size={13} />
                      {huerfano
                        ? 'Ingrediente sin producto del maestro: búscalo para vincularlo.'
                        : `Unidad ${umActual} distinta al maestro (${unidadProducto}) y sin conversión: se costea 1:1. Revisa la cantidad o la unidad.`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="ck-side__foot">
        {error && (
          <div className="ck-error" role="alert" style={{ margin: '0 0 10px' }}>
            {error}
            {platoExistente && onAbrirExistente && (
              <button type="button" className="ck-btn ck-btn--sm" style={{ marginLeft: '10px' }} onClick={() => onAbrirExistente(platoExistente)}>
                Abrir plato existente
              </button>
            )}
          </div>
        )}
        <div className="ck-side__totals">
          <div><span>Costo neto</span><strong>{formatCLP(Math.round(costoNeto))}</strong></div>
          <div><span>Costo bruto</span><strong>{formatCLP(costoBruto)}</strong></div>
          <div><span>Margen</span><strong style={{ color: colorMargen }}>{formatPct(margen)}</strong></div>
        </div>
        {filasSinCosto > 0 && (
          <p className="ck-side__aviso"><NavIcon name="triangle-alert" size={13} /> {filasSinCosto} ingrediente{filasSinCosto !== 1 ? 's' : ''} sin costo en el maestro: el costo del plato está incompleto.</p>
        )}
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
          <button type="button" className="ck-btn ck-btn--primary" onClick={() => void save()} title="Guardar (F12)" disabled={saving || deleting || uploadingFoto}>
            <NavIcon name="save" size={15} /> {saving ? 'Guardando...' : 'Guardar'}
            {!saving && <kbd className="ck-kbd">F12</kbd>}
          </button>
        </div>
      </div>
    </>
  );
}
