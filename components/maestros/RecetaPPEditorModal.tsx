'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCLP } from '@/lib/calculos';
import { costoLineaPP, factorConversionUM, normalizarUM, formatCostoUnitario } from '@/lib/costo-receta-pp';
import NavIcon from '@/components/layout/NavIcon';
import ProductSearchSelect from '@/components/costos/ProductSearchSelect';
import { AREAS_RECETA_PP, areaRecetaPP, type AreaRecetaPP } from '@/components/maestros/types';

interface ProductoMaestro {
  codigo: string;
  nombre: string;
  unidad_medida: string | null;
  costo_promedio?: number | null;
}

export interface RecetaPPEditable {
  id: string;
  codigo_receta: string;
  codigo_pp: string | null;
  nombre: string;
  rendimiento: number;
  unidad_rendimiento: string;
  activo: boolean;
  area?: AreaRecetaPP | null;
  ingredientes: {
    id: string;
    orden: number;
    codigo_ingrediente: string | null;
    nombre_ingrediente: string;
    cantidad: number;
    unidad_medida: string;
  }[];
}

interface IngredienteForm {
  localId: string;
  codigo: string;
  nombre: string;
  cantidad: string;
  unidad_medida: string;
}

interface Props {
  receta: RecetaPPEditable | null;
  copyFrom?: RecetaPPEditable | null;
  /** Sección por defecto para una receta nueva (la sub-pestaña abierta). */
  areaInicial?: AreaRecetaPP;
  productos: ProductoMaestro[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}

const UNIDADES_RENDIMIENTO = ['GR', 'KG', 'CC', 'LT', 'PR', 'UN'];
const UNIDADES = ['KG', 'GR', 'LT', 'CC', 'UN', 'PR'];

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyRow(): IngredienteForm {
  return { localId: newId(), codigo: '', nombre: '', cantidad: '', unidad_medida: 'KG' };
}

export default function RecetaPPEditorModal({ receta, copyFrom = null, areaInicial = 'COCINA', productos, onClose, onSaved }: Props) {
  const source = receta ?? copyFrom;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [codigoPP, setCodigoPP] = useState(receta?.codigo_pp ?? '');
  const [nombre, setNombre] = useState(receta ? receta.nombre : copyFrom ? `${copyFrom.nombre} (COPIA)` : '');
  const [rendimiento, setRendimiento] = useState(source?.rendimiento?.toString() ?? '');
  const [unidadRend, setUnidadRend] = useState(source?.unidad_rendimiento ?? 'GR');
  const [activo, setActivo] = useState(receta?.activo !== false);
  const [area, setArea] = useState<AreaRecetaPP>(source ? areaRecetaPP(source.area) : areaInicial);
  const [ingredientes, setIngredientes] = useState<IngredienteForm[]>(
    source?.ingredientes?.length
      ? [...source.ingredientes].sort((a, b) => a.orden - b.orden).map(ing => ({
          localId: newId(),
          codigo: ing.codigo_ingrediente ?? '',
          nombre: ing.nombre_ingrediente,
          cantidad: String(ing.cantidad),
          unidad_medida: ing.unidad_medida,
        }))
      : [emptyRow()],
  );

  const bodyRef = useRef<HTMLDivElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // La página de fondo no se desplaza mientras el modal está abierto; foco inicial en el nombre
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    nombreRef.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Al fallar el guardado, mostrar el error (arriba del contenido)
  useEffect(() => {
    if (error) bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [error]);

  const productoMap = useMemo(() => new Map(productos.map(p => [p.codigo, p])), [productos]);
  // Productos 0502xxx = PP terminados; sirven para vincular la receta a su código Softland
  const productosPP = useMemo(() => productos.filter(p => p.codigo.startsWith('0502')), [productos]);

  const lineas = ingredientes.map(row => {
    const producto = row.codigo ? productoMap.get(row.codigo) : undefined;
    const precio = producto ? (Number(producto.costo_promedio) || 0) * factorConversionUM(row.unidad_medida, producto.unidad_medida ?? '') : 0;
    const costo = producto ? costoLineaPP(Number(row.cantidad) || 0, row.unidad_medida, producto.unidad_medida ?? '', Number(producto.costo_promedio) || 0) : 0;
    return { row, producto, precio, costo };
  });

  const productoPP = codigoPP ? productoMap.get(codigoPP) : undefined;
  const umNoCalza = !!productoPP && normalizarUM(productoPP.unidad_medida) !== normalizarUM(unidadRend);
  const codigoDesdePP = /^0502\d+$/.test(codigoPP) ? '0501' + codigoPP.slice(4) : null;
  // Código receta = mismo número del código PP con prefijo 0501 (0502174 → 0501174)
  const codigoRecetaFinal = codigoDesdePP ?? receta?.codigo_receta ?? 'NUEVA-xxx (automático)';

  const costoTotal = lineas.reduce((s, l) => s + l.costo, 0);
  const rendNum = Number(rendimiento) || 0;
  const costoUnitario = rendNum > 0 ? costoTotal / rendNum : 0;
  const sinCodigo = lineas.filter(l => (l.row.codigo || l.row.nombre.trim()) && !l.producto).length;
  const sinCosto = lineas.filter(l => l.producto && !(Number(l.producto.costo_promedio) > 0)).length;

  function updateRow(localId: string, patch: Partial<IngredienteForm>) {
    setIngredientes(rows => rows.map(r => r.localId === localId ? { ...r, ...patch } : r));
  }

  function handleProductoChange(localId: string, codigo: string) {
    const producto = productoMap.get(codigo);
    if (!producto) {
      updateRow(localId, { codigo: '', nombre: '' });
      return;
    }
    updateRow(localId, { codigo: producto.codigo, nombre: producto.nombre, unidad_medida: producto.unidad_medida ?? 'KG' });
  }

  function handleCodigoPPChange(codigo: string) {
    setCodigoPP(codigo);
    const producto = productoMap.get(codigo);
    if (producto && !nombre.trim()) setNombre(producto.nombre);
    if (producto?.unidad_medida && UNIDADES_RENDIMIENTO.includes(producto.unidad_medida)) setUnidadRend(producto.unidad_medida);
  }

  function removeRow(localId: string) {
    setIngredientes(rows => rows.length === 1 ? [emptyRow()] : rows.filter(r => r.localId !== localId));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        codigo_pp: codigoPP || null,
        nombre,
        rendimiento: rendNum,
        unidad_rendimiento: unidadRend,
        activo,
        area,
        ingredientes: ingredientes
          .filter(row => (Number(row.cantidad) || 0) > 0 && (row.codigo || row.nombre.trim()))
          .map(row => ({
            codigo_ingrediente: row.codigo || null,
            nombre_ingrediente: row.nombre.trim(),
            cantidad: Number(row.cantidad) || 0,
            unidad_medida: row.unidad_medida,
          })),
      };
      const res = await fetch(receta ? `/api/maestros/recetas-pp/${receta.id}` : '/api/maestros/recetas-pp', {
        method: receta ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(receta ? payload : { accion: 'crear', ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error guardando receta');
      const extra = data.errores?.length ? ` — ${data.errores.length} advertencias: ${data.errores.join('; ')}` : '';
      onSaved(receta ? `Receta "${nombre.trim().toUpperCase()}" actualizada${extra}` : `Receta ${data.codigo_receta} creada${extra}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando receta');
    } finally {
      setSaving(false);
    }
  }

  const titulo = nombre.trim() || (receta ? receta.nombre : 'Nueva receta');
  const nIngredientes = ingredientes.filter(i => i.codigo || i.nombre.trim()).length;

  return (
    <div className="rpp-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rpp-modal" role="dialog" aria-modal="true" aria-labelledby="rpp-modal-title">
        <header className="rpp-modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="rpp-modal-kicker">
              {receta ? `Editar receta PP · ${receta.codigo_receta}` : copyFrom ? `Copiar receta PP · desde ${copyFrom.codigo_receta}` : 'Nueva receta PP'}
            </p>
            <h2 id="rpp-modal-title" className="rpp-modal-title">{titulo}</h2>
          </div>
          <button type="button" className="rpp-icon-btn" aria-label="Cerrar" onClick={onClose}>
            <NavIcon name="x" size={20} />
          </button>
        </header>

        <div className="rpp-modal-body" ref={bodyRef}>
          {error && <div className="rpp-alert is-error" role="alert" style={{ margin: '0 0 16px' }}>{error}</div>}

          {/* Datos de la receta */}
          <div className="rpp-form-grid">
            <div className="rpp-field span-full-sm">
              <span className="rpp-label" id="rpp-lbl-codpp">Código PP (0502xxx)</span>
              <div aria-labelledby="rpp-lbl-codpp">
                <ProductSearchSelect
                  value={codigoPP}
                  onChange={handleCodigoPPChange}
                  productos={productosPP}
                  placeholder={codigoPP && !productoPP ? `${codigoPP} (no existe en Productos)` : 'Sin código PP (opcional)'}
                  allowManual={false}
                />
              </div>
            </div>
            <label className="rpp-field">
              <span className="rpp-label">Código receta</span>
              <input
                value={codigoRecetaFinal}
                readOnly
                title="Se genera desde el código PP: 0502xxx → 0501xxx"
                className={`rpp-input${receta && codigoRecetaFinal !== receta.codigo_receta ? ' is-changed' : ''}`}
              />
            </label>
            <label className="rpp-field span-full-sm">
              <span className="rpp-label">Nombre receta</span>
              <input ref={nombreRef} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="PP SALSA PEBRE" className="rpp-input" />
            </label>
          </div>
          <div className="rpp-form-grid is-row2">
            <label className="rpp-field">
              <span className="rpp-label">Rendimiento</span>
              <input type="number" min={0} step="any" inputMode="decimal" value={rendimiento} onChange={e => setRendimiento(e.target.value)} placeholder="2400" className="rpp-input" />
            </label>
            <label className="rpp-field">
              <span className="rpp-label">Unidad rendimiento</span>
              <select value={unidadRend} onChange={e => setUnidadRend(e.target.value)} className="rpp-input">
                {UNIDADES_RENDIMIENTO.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="rpp-field">
              <span className="rpp-label">Sección</span>
              <select value={area} onChange={e => setArea(areaRecetaPP(e.target.value))} className="rpp-input">
                {AREAS_RECETA_PP.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>
            <label className="rpp-toggle">
              <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
              Receta activa
            </label>
          </div>

          {umNoCalza && productoPP && (
            <div className="rpp-alert is-error" role="alert">
              ⚠ El código PP <strong>{productoPP.codigo}</strong> corresponde a <strong>{productoPP.nombre}</strong> (unidad {productoPP.unidad_medida}), pero esta receta rinde en <strong>{unidadRend}</strong>.
              Al guardar se le copiará el costo de esta receta a ese producto. Revisa que sea el código correcto.
            </div>
          )}

          {/* Ingredientes */}
          <section className="rpp-ing-section" aria-labelledby="rpp-ing-title">
            <div className="rpp-ing-head">
              <h3 id="rpp-ing-title">Ingredientes ({nIngredientes})</h3>
              <button type="button" className="rpp-btn rpp-btn-sm rpp-btn-accent" onClick={() => setIngredientes(rows => [...rows, emptyRow()])}>
                <NavIcon name="plus" size={14} /> Ingrediente
              </button>
            </div>
            <div className="rpp-ing-scroll">
              <table className="rpp-ing-table">
                <thead>
                  <tr>
                    <th scope="col">Producto</th>
                    <th scope="col" style={{ width: 110 }}>Cantidad</th>
                    <th scope="col" style={{ width: 92 }}>UM</th>
                    <th scope="col" className="num" style={{ width: 130 }}>Precio unit.</th>
                    <th scope="col" className="num" style={{ width: 110 }}>Costo</th>
                    <th scope="col" style={{ width: 48 }}><span className="sr-only">Quitar</span></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map(({ row, producto, precio, costo }, i) => {
                    const huerfano = !producto && (row.codigo || row.nombre.trim());
                    return (
                      <tr key={row.localId} className={huerfano ? 'is-orphan' : undefined}>
                        <td className="c-prod">
                          <div className="rpp-field" aria-label={`Producto ingrediente ${i + 1}`}>
                            <ProductSearchSelect
                              value={producto ? row.codigo : ''}
                              onChange={codigo => handleProductoChange(row.localId, codigo)}
                              productos={productos}
                              placeholder={huerfano ? `${row.codigo ? row.codigo + ' · ' : ''}${row.nombre} (sin producto — elige uno)` : `Buscar en ${productos.length} productos...`}
                              allowManual={false}
                            />
                          </div>
                        </td>
                        <td className="c-cant">
                          <input type="number" min={0} step="any" inputMode="decimal" aria-label={`Cantidad ingrediente ${i + 1}`} value={row.cantidad} onChange={e => updateRow(row.localId, { cantidad: e.target.value })} className="rpp-input" />
                        </td>
                        <td className="c-um">
                          <select aria-label={`Unidad ingrediente ${i + 1}`} value={row.unidad_medida} onChange={e => updateRow(row.localId, { unidad_medida: e.target.value })} className="rpp-input" style={{ padding: '0 8px' }}>
                            {[...new Set([...UNIDADES, row.unidad_medida])].map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="num c-precio" data-label="Precio unit." style={{ color: 'var(--ts)', whiteSpace: 'nowrap', fontFamily: "'Space Grotesk', sans-serif" }}>
                          {producto
                            ? (Number(producto.costo_promedio) > 0 ? `${formatCostoUnitario(precio, 3)} / ${row.unidad_medida}` : <span style={{ color: '#92400E', fontWeight: 600 }}>Sin costo</span>)
                            : '—'}
                        </td>
                        <td className="num c-costo" data-label="Costo" style={{ fontWeight: 700, whiteSpace: 'nowrap', fontFamily: "'Space Grotesk', sans-serif" }}>
                          {formatCLP(Math.round(costo))}
                        </td>
                        <td className="c-del">
                          <button type="button" className="rpp-remove-btn" aria-label={`Eliminar ingrediente ${i + 1}`} title="Eliminar ingrediente" onClick={() => removeRow(row.localId)}>
                            <NavIcon name="trash" size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {(sinCodigo > 0 || sinCosto > 0) && (
            <div className="rpp-alert is-warn">
              ⚠ {sinCodigo > 0 && `${sinCodigo} ingrediente${sinCodigo !== 1 ? 's' : ''} sin producto vinculado (no suma costo; la receta queda Incompleta). `}
              {sinCosto > 0 && `${sinCosto} producto${sinCosto !== 1 ? 's' : ''} con costo 0 (la receta queda Pendiente).`}
            </div>
          )}

          {/* Costos (se recalculan en vivo) */}
          <div className="rpp-costs" aria-live="polite">
            <div className="rpp-cost">
              <p className="rpp-kpi-label">Costo total neto</p>
              <p className="rpp-kpi-value">{formatCLP(Math.round(costoTotal))}</p>
            </div>
            <div className="rpp-cost">
              <p className="rpp-kpi-label">Costo con IVA</p>
              <p className="rpp-kpi-value">{formatCLP(Math.round(costoTotal * 1.19))}</p>
            </div>
            <div className="rpp-cost is-accent">
              <p className="rpp-kpi-label">Costo unitario</p>
              <p className="rpp-kpi-value">
                {rendNum > 0 ? <>{formatCostoUnitario(costoUnitario, 3)}<small>/ {unidadRend}</small></> : '—'}
              </p>
            </div>
          </div>
        </div>

        <footer className="rpp-modal-foot">
          <button type="button" className="rpp-btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="rpp-btn rpp-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </div>
    </div>
  );
}
