'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCLP } from '@/lib/calculos';
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
  onClose: () => void;
  onSaved: () => void;
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

export default function PlatoEditorModal({ plato, onClose, onSaved, canDelete = false, onDeleted }: Props) {
  const [productos, setProductos] = useState<ProductoMaestro[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const [codSoftland, setCodSoftland] = useState(plato?.cod_softland ?? '');
  const [nombre, setNombre] = useState(plato?.nombre ?? '');
  const [categoria, setCategoria] = useState(plato?.categoria ?? 'CLÁSICOS');
  const [tipoCarta, setTipoCarta] = useState<'ANTIGUA' | 'NUEVA'>(plato?.tipo_carta ?? 'ANTIGUA');
  const [precioCarta, setPrecioCarta] = useState(plato?.precio_carta?.toString() ?? '');
  const [fotoUrl, setFotoUrl] = useState(plato?.foto_url ?? '');
  const [activo, setActivo] = useState(plato?.activo !== false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [ingredientes, setIngredientes] = useState<IngredienteForm[]>(
    plato?.carta_ingredientes?.length ? plato.carta_ingredientes.map(rowFromIngrediente) : [emptyRow()],
  );

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

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
        id: plato?.id,
        cod_softland: codSoftland,
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
        method: plato ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando plato');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando plato');
    } finally {
      setSaving(false);
    }
  }

  async function deletePlato() {
    if (!plato || !canDelete) return;
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

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      onClick={handleBackdrop}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 520, padding: '18px' }}
    >
      <div style={{ width: '100%', maxWidth: '980px', maxHeight: '92vh', overflow: 'hidden', background: 'var(--sf)', borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--bo)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 3px', color: 'var(--ts)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
              {plato ? 'Editar plato' : 'Nuevo plato'}
            </p>
            <h2 style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: 800, color: 'var(--tx)' }}>
              {nombre.trim() || 'Ficha de plato'}
            </h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '24px', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <div style={{ padding: '18px 22px', overflowY: 'auto' }}>
          {error && (
            <div style={{ marginBottom: '14px', background: '#FEF2F2', border: '1px solid #DC2626', color: '#991B1B', borderRadius: '8px', padding: '9px 12px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--ts)', fontWeight: 700 }}>
              Código
              <input value={codSoftland} onChange={e => setCodSoftland(e.target.value)} className="field-input" style={{ minHeight: 'unset', padding: '8px 10px', fontSize: '13px' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--ts)', fontWeight: 700 }}>
              Plato
              <input value={nombre} onChange={e => setNombre(e.target.value)} className="field-input" style={{ minHeight: 'unset', padding: '8px 10px', fontSize: '13px' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--ts)', fontWeight: 700 }}>
              Categoría
              <input value={categoria} onChange={e => setCategoria(e.target.value)} list="categorias-carta" className="field-input" style={{ minHeight: 'unset', padding: '8px 10px', fontSize: '13px' }} />
              <datalist id="categorias-carta">
                {CATEGORIAS.map(c => <option key={c} value={c} />)}
              </datalist>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--ts)', fontWeight: 700 }}>
              Tipo carta
              <select value={tipoCarta} onChange={e => setTipoCarta(e.target.value as 'ANTIGUA' | 'NUEVA')} className="field-input" style={{ minHeight: 'unset', padding: '8px 10px', fontSize: '13px' }}>
                {TIPOS_CARTA.map(tipo => (
                  <option key={tipo} value={tipo}>
                    {tipo === 'NUEVA' ? 'Nueva' : 'Antigua'}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--ts)', fontWeight: 700 }}>
              Precio carta
              <input type="number" min={0} step={1} value={precioCarta} onChange={e => setPrecioCarta(e.target.value)} className="field-input" style={{ minHeight: 'unset', padding: '8px 10px', fontSize: '13px' }} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '18px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--ts)', fontWeight: 700 }}>
              Foto URL
              <input value={fotoUrl} onChange={e => setFotoUrl(e.target.value)} className="field-input" style={{ minHeight: 'unset', padding: '8px 10px', fontSize: '13px' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--ts)', fontWeight: 700 }}>
              Subir foto
              <input
                type="file"
                accept="image/*"
                onChange={e => void handleFotoFile(e.target.files?.[0] ?? null)}
                className="field-input"
                style={{ minHeight: 'unset', padding: '8px 10px', fontSize: '13px' }}
              />
            </label>
            {uploadingFoto && (
              <div style={{ display: 'flex', alignItems: 'end', color: 'var(--ts)', fontSize: '12px', fontWeight: 600 }}>
                Subiendo foto...
              </div>
            )}
            {canDelete && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'end', fontSize: '13px', color: 'var(--tx)', fontWeight: 600, minHeight: '35px' }}>
                <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
                Activo
              </label>
            )}
          </div>

          <div style={{ border: '1px solid var(--bo)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: 'var(--al)', borderBottom: '1px solid var(--bo)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '11px', color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 800, flex: 1 }}>
                Receta ({ingredientes.filter(i => i.nombre.trim() || i.codigo_producto).length})
              </span>
              <button type="button" onClick={() => setIngredientes(rows => [...rows, emptyRow()])} style={{ border: '1px solid var(--ac)', background: 'var(--sf)', color: 'var(--ac)', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                + Producto
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '860px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Producto', 'Nombre', 'Cantidad', 'UM', 'Precio unit.', 'Costo', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: '10px', color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px', padding: '8px 10px', borderBottom: '1px solid var(--bo)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ingredientes.map(row => {
                    const producto = row.codigo_producto ? productoMap.get(row.codigo_producto) : undefined;
                    const cantidad = Number(row.cantidad) || 0;
                    const precio = producto ? precioUnitarioPorUnidad(row.unidad_medida, producto) : Number(row.precio_unitario) || 0;
                    const costo = cantidad * (precio ?? 0);

                    return (
                      <tr key={row.localId} style={{ borderTop: '1px solid var(--bo)' }}>
                        <td style={{ padding: '8px 10px', width: '250px' }}>
                          <ProductSearchSelect
                            value={row.codigo_producto}
                            onChange={codigo => handleProductoChange(row.localId, codigo)}
                            productos={productos}
                            placeholder={row.pp_id ? 'PP / manual' : `Buscar en ${productos.length} productos...`}
                            allowManual
                            disabled={loadingProductos}
                          />
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            value={row.nombre}
                            onChange={e => updateRow(row.localId, { nombre: e.target.value })}
                            disabled={!!producto}
                            style={{ width: '100%', border: '1px solid var(--bo)', borderRadius: '6px', padding: '7px 8px', fontSize: '12px', background: producto ? 'var(--al)' : 'var(--bg)', color: 'var(--tx)' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', width: '110px' }}>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={row.cantidad}
                            onChange={e => updateRow(row.localId, { cantidad: e.target.value })}
                            style={{ width: '100%', border: '1px solid var(--bo)', borderRadius: '6px', padding: '7px 8px', fontSize: '12px', background: 'var(--bg)', color: 'var(--tx)' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', width: '95px' }}>
                          <input
                            value={row.unidad_medida}
                            onChange={e => handleUnidadChange(row.localId, e.target.value.toUpperCase())}
                            list="unidades-receta"
                            style={{ width: '100%', border: '1px solid var(--bo)', borderRadius: '6px', padding: '7px 8px', fontSize: '12px', background: 'var(--bg)', color: 'var(--tx)' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', width: '130px' }}>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={producto && precio != null ? String(precio) : row.precio_unitario}
                            onChange={e => updateRow(row.localId, { precio_unitario: e.target.value })}
                            disabled={!!producto}
                            style={{ width: '100%', border: '1px solid var(--bo)', borderRadius: '6px', padding: '7px 8px', fontSize: '12px', background: producto ? 'var(--al)' : 'var(--bg)', color: 'var(--tx)' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', width: '110px', fontSize: '12px', fontWeight: 700, color: 'var(--tx)', whiteSpace: 'nowrap' }}>
                          {formatCLP(Math.round(costo))}
                        </td>
                        <td style={{ padding: '8px 10px', width: '42px' }}>
                          <button type="button" onClick={() => removeRow(row.localId)} style={{ border: 'none', background: 'transparent', color: 'var(--rd)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <datalist id="unidades-receta">
                {UNIDADES.map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--bo)', display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--bg)' }}>
          {plato && canDelete && (
            <button type="button" onClick={deletePlato} disabled={saving || deleting} style={{ border: '1px solid var(--rd)', background: '#FEF2F2', color: 'var(--rd)', borderRadius: '7px', padding: '8px 14px', cursor: deleting ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 700 }}>
              {deleting ? 'Eliminando...' : 'Eliminar plato'}
            </button>
          )}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--ts)', flex: 1 }}>
            <span><strong style={{ color: 'var(--tx)' }}>{formatCLP(Math.round(costoNeto))}</strong> neto</span>
            <span><strong style={{ color: 'var(--tx)' }}>{formatCLP(costoBruto)}</strong> bruto</span>
            <span><strong style={{ color: margen == null ? 'var(--ts)' : margen >= 30 ? '#16A34A' : margen >= 25 ? '#CA8A04' : '#DC2626' }}>{margen == null ? '—' : `${margen.toFixed(1)}%`}</strong> margen</span>
          </div>
          <button type="button" onClick={onClose} disabled={saving || deleting} style={{ border: '1px solid var(--bo)', background: 'var(--sf)', color: 'var(--ts)', borderRadius: '7px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            Cancelar
          </button>
          <button type="button" onClick={save} disabled={saving || deleting} style={{ border: 'none', background: 'var(--ac)', color: '#fff', borderRadius: '7px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
