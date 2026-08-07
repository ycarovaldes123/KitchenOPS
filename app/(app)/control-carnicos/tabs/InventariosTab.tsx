'use client';

import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { BODEGAS_CARNICOS, BODEGA_LABEL, hoyChile } from '@/lib/config-carnicos';
import type { BodegaCarnico, CarnicoProducto, TipoInventarioCarnico } from '@/types/carnicos';
import DatosTurnoCard from '../components/DatosTurnoCard';
import ProductoCarnicoSelector from '../components/ProductoCarnicoSelector';
import type { Maestros } from '../page';

interface FilaInventario {
  localId: string;
  producto: CarnicoProducto | null;
  cantidad: string;
}

interface LoteImportado {
  bodega: BodegaCarnico;
  bodegaLabel: string;
  detalle: {
    producto_id: string;
    producto_nombre: string;
    unidad_medida: string;
    cantidad: number;
  }[];
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyFila(): FilaInventario {
  return { localId: newId(), producto: null, cantidad: '' };
}

const field: CSSProperties = {
  width: '100%', border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '8px 11px',
  fontSize: '14px', background: 'var(--bg)', color: 'var(--tx)', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
};
const label: CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ts)',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px',
};

export default function InventariosTab({ maestros }: { maestros: Maestros }) {
  const [fecha, setFecha] = useState(hoyChile());
  const [responsableId, setResponsableId] = useState('');
  // Turno AM/PM ya no se selecciona en la UI; se mantiene un valor fijo para no alterar el contrato de la API.
  const turno: 'AM' | 'PM' = 'AM';
  const [bodega, setBodega] = useState<BodegaCarnico>(BODEGAS_CARNICOS[0]);
  const [tipo, setTipo] = useState<TipoInventarioCarnico>('INICIAL');
  const [filas, setFilas] = useState<FilaInventario[]>([]);
  const [lotesImportados, setLotesImportados] = useState<LoteImportado[] | null>(null);
  const [importErrores, setImportErrores] = useState<string[]>([]);
  const [importando, setImportando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cantidadLineas, setCantidadLineas] = useState('10');
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  const respActual = maestros.responsables.find(r => r.id === responsableId);
  const esImportacionConsolidada = bodega === 'BODEGAS CONSOLIDADAS';
  const totalImportadas = lotesImportados?.reduce((sum, lote) => sum + lote.detalle.length, 0) ?? 0;
  const totalValidas = lotesImportados
    ? totalImportadas
    : esImportacionConsolidada
      ? 0
    : filas.filter(f => f.producto && Number(f.cantidad) >= 0 && f.cantidad !== '').length;

  function addFilas(cantidad: number) {
    const safeCantidad = Math.min(Math.max(Math.floor(cantidad) || 1, 1), 100);
    setFilas(prev => [...prev, ...Array.from({ length: safeCantidad }, () => emptyFila())]);
  }

  function addFila() {
    addFilas(1);
  }
  function updateFila(localId: string, patch: Partial<FilaInventario>) {
    setFilas(prev => prev.map(f => (f.localId === localId ? { ...f, ...patch } : f)));
  }
  function removeFila(localId: string) {
    setFilas(prev => prev.filter(f => f.localId !== localId));
  }

  function cambiarTipo(nuevoTipo: TipoInventarioCarnico) {
    setTipo(nuevoTipo);
    setLotesImportados(null);
    setImportErrores([]);
  }

  function cambiarBodega(nuevaBodega: BodegaCarnico) {
    setBodega(nuevaBodega);
    setLotesImportados(null);
    setImportErrores([]);
    if (nuevaBodega === 'BODEGAS CONSOLIDADAS') setFilas([]);
  }

  async function importarInventarioConsolidado(file: File | null) {
    if (!file) return;
    setErr('');
    setOk('');
    setImportErrores([]);
    setImportando(true);
    setLotesImportados(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/control-carnicos/inventarios/importar-final', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setImportErrores(Array.isArray(data.errores) ? data.errores : []);
        throw new Error(data.error ?? 'Error importando inventario');
      }
      const lotes = Array.isArray(data.lotes) ? data.lotes as LoteImportado[] : [];
      if (!lotes.length) throw new Error('El archivo no tiene conteos validos por bodega.');
      setLotesImportados(lotes);
      setImportErrores(Array.isArray(data.errores) ? data.errores : []);
      setFilas([]);
      const detalleErrores = Array.isArray(data.errores) && data.errores.length
        ? ` ${data.errores.length} fila(s) quedaron con advertencia.`
        : '';
      setOk(`Inventario ${tipo === 'INICIAL' ? 'inicial' : 'final'} importado: ${data.total ?? lotes.reduce((sum, lote) => sum + lote.detalle.length, 0)} conteo(s) separados por bodega.${detalleErrores}`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Error importando inventario');
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setOk('');
    if (!responsableId) { setErr('Selecciona un responsable.'); return; }

    const detalle = filas
      .filter(f => f.producto && f.cantidad !== '' && Number(f.cantidad) >= 0)
      .map(f => ({ producto_id: f.producto!.id, producto_nombre: f.producto!.nombre, unidad_medida: f.producto!.unidad_medida, cantidad: Number(f.cantidad) }));

    if (lotesImportados) {
      if (!lotesImportados.length || totalImportadas === 0) { setErr('Primero importa un archivo valido.'); return; }
      const resumen = lotesImportados.map(lote => `${lote.bodegaLabel}: ${lote.detalle.length}`).join(', ');
      if (!window.confirm(`Guardar inventario ${tipo === 'INICIAL' ? 'Inicial' : 'Final'} importado con ${totalImportadas} conteo(s)? ${resumen}`)) return;
    } else {
      if (esImportacionConsolidada) { setErr('Bodegas consolidadas solo se usa para importar el Excel con Camara Congelados, Camara Mantencion y Cocina.'); return; }
      if (!detalle.length) { setErr('Agrega al menos un producto con cantidad valida.'); return; }
      if (!window.confirm(`Guardar inventario ${tipo === 'INICIAL' ? 'Inicial' : 'Final'} de ${BODEGA_LABEL[bodega]} con ${detalle.length} producto(s)?`)) return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/control-carnicos/inventarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lotesImportados
          ? { fecha, responsable_id: responsableId, responsable_nombre: respActual?.nombre ?? '', turno, tipo, lotes: lotesImportados.map(lote => ({ bodega: lote.bodega, detalle: lote.detalle })) }
          : { fecha, responsable_id: responsableId, responsable_nombre: respActual?.nombre ?? '', turno, bodega, tipo, detalle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando inventario');
      const porBodega = data.porBodega && typeof data.porBodega === 'object'
        ? Object.entries(data.porBodega as Record<string, number>).map(([bod, total]) => `${BODEGA_LABEL[bod as BodegaCarnico] ?? bod}: ${total}`).join(', ')
        : `${detalle.length} producto(s) en ${BODEGA_LABEL[bodega]}`;
      setOk(`Inventario guardado: ${porBodega}.`);
      setFilas([]);
      setLotesImportados(null);
      setImportErrores([]);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Error guardando inventario');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {err && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px' }}>{err}</div>}
      {importErrores.length > 0 && (
        <div style={{ background: '#FFF7ED', border: '1px solid #FDBA74', color: '#9A3412', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px' }}>
          {importErrores.slice(0, 8).map(error => <div key={error}>{error}</div>)}
          {importErrores.length > 8 && <div>... {importErrores.length - 8} error(es) mas</div>}
        </div>
      )}
      {ok && <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px' }}>{ok}</div>}

      <div className="carnicos-grid" style={{ display: 'grid', gridTemplateColumns: '310px 1fr', gap: '14px', alignItems: 'start' }}>
        <DatosTurnoCard
          title="CONTEO INVENTARIO"
          fecha={fecha} onFecha={setFecha}
          responsableId={responsableId} onResponsable={setResponsableId} responsables={maestros.responsables}
          showObservacion={false}
        >
          <div>
            <label style={label}>Bodega <span style={{ color: 'var(--rd)' }}>*</span></label>
            <select value={bodega} onChange={e => cambiarBodega(e.target.value as BodegaCarnico)} style={{ ...field, fontWeight: 700 }}>
              {BODEGAS_CARNICOS.map(b => <option key={b} value={b}>{BODEGA_LABEL[b]}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Tipo</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {(['INICIAL', 'FINAL'] as const).map(t => (
                <button key={t} type="button" onClick={() => cambiarTipo(t)} style={{
                  border: `1.5px solid ${tipo === t ? 'var(--ac)' : 'var(--bo)'}`,
                  background: tipo === t ? 'var(--al)' : 'var(--bg)',
                  color: tipo === t ? 'var(--ac)' : 'var(--ts)',
                  borderRadius: '8px', padding: '9px', fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                }}>
                  {t === 'INICIAL' ? 'Inventario Inicial' : 'Inventario Final'}
                </button>
              ))}
            </div>
          </div>
          {esImportacionConsolidada && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={e => void importarInventarioConsolidado(e.target.files?.[0] ?? null)}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importando}
                style={{ width: '100%', border: '1.5px solid var(--ac)', background: 'var(--sf)', color: 'var(--ac)', borderRadius: '8px', padding: '9px', fontSize: '12px', fontWeight: 800, cursor: importando ? 'wait' : 'pointer' }}
              >
                {importando ? 'Validando archivo...' : 'Subir Excel consolidado'}
              </button>
            </div>
          )}
        </DatosTurnoCard>

        <section style={{ background: 'var(--sf)', border: '1px solid var(--bo)', borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '360px' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bo)', background: 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase' }}>Conteo — {BODEGA_LABEL[bodega]}</span>
              {filas.length > 0 && (
                <span style={{ background: 'var(--ac)', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>{filas.length}</span>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--ts)' }}>El mismo producto puede contarse en varias bodegas el mismo dia — el resumen las suma automaticamente.</p>
          </div>

          {lotesImportados ? (
            <div style={{ padding: '18px 20px', display: 'grid', gap: '10px' }}>
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', fontWeight: 700 }}>
                Archivo validado. Revisa el resumen por bodega y presiona Guardar conteo para registrar el inventario.
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="carnicos-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Bodega', 'Conteos', 'Primeros productos'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lotesImportados.map(lote => (
                      <tr key={lote.bodega} style={{ borderBottom: '1px solid var(--bo)' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 800 }}>{lote.bodegaLabel}</td>
                        <td style={{ padding: '9px 12px' }}>{lote.detalle.length}</td>
                        <td style={{ padding: '9px 12px', fontSize: '12px', color: 'var(--ts)' }}>
                          {lote.detalle.slice(0, 4).map(d => d.producto_nombre).join(', ')}
                          {lote.detalle.length > 4 ? ` y ${lote.detalle.length - 4} mas` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => setLotesImportados(null)} style={{ justifySelf: 'start', border: '1px solid var(--bo)', background: 'var(--sf)', color: 'var(--ts)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                Descartar importacion
              </button>
            </div>
          ) : filas.length === 0 ? (
            <div style={{ padding: '48px 32px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              {esImportacionConsolidada ? (
                <div style={{ color: 'var(--ts)', fontSize: '13px', fontWeight: 700 }}>
                  Sube el Excel consolidado para generar conteos por Camara Congelados, Camara Mantencion y Cocina.
                </div>
              ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button type="button" onClick={addFila} style={{ background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 22px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                  + Agregar primer producto
                </button>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number" min="1" max="100" value={cantidadLineas}
                    onChange={e => setCantidadLineas(e.target.value)}
                    aria-label="Cantidad de productos a agregar"
                    style={{ ...field, width: '76px', padding: '9px 10px' }}
                  />
                  <button type="button" onClick={() => addFilas(Number(cantidadLineas))} style={{
                    background: 'var(--sf)', color: 'var(--ac)', border: '1.5px solid var(--ac)',
                    borderRadius: '10px', padding: '10px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  }}>
                    Agregar cantidad
                  </button>
                </div>
              </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', flex: 1 }}>
                <table className="carnicos-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Producto', 'Unidad', 'Cantidad', ''].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', borderBottom: '1px solid var(--bo)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(fila => (
                      <tr key={fila.localId} style={{ borderBottom: '1px solid var(--bo)' }}>
                        <td style={{ padding: '9px 12px', minWidth: '260px' }}>
                          <ProductoCarnicoSelector
                            productos={maestros.productos}
                            selectedId={fila.producto?.id ?? ''}
                            selectedNombre={fila.producto?.nombre ?? ''}
                            selectedUM={fila.producto?.unidad_medida ?? ''}
                            onSelect={producto => updateFila(fila.localId, { producto })}
                            onClear={() => updateFila(fila.localId, { producto: null, cantidad: '' })}
                          />
                        </td>
                        <td style={{ padding: '9px 12px', fontSize: '12px', color: 'var(--ts)' }}>{fila.producto?.unidad_medida ?? '-'}</td>
                        <td style={{ padding: '9px 12px', width: '140px' }}>
                          <input type="number" min={0} step="any" value={fila.cantidad} onChange={e => updateFila(fila.localId, { cantidad: e.target.value })} style={{ ...field, width: '110px' }} placeholder="0" />
                        </td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', width: '44px' }}>
                          <button type="button" onClick={() => removeFila(fila.localId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '18px', lineHeight: 1 }}>x</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '11px 14px', borderTop: '1px solid var(--bo)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button type="button" onClick={addFila} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: '1.5px dashed var(--bo)', borderRadius: '8px', padding: '8px 18px', cursor: 'pointer', fontSize: '13px', color: 'var(--ts)' }}>
                  + Agregar producto
                </button>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number" min="1" max="100" value={cantidadLineas}
                    onChange={e => setCantidadLineas(e.target.value)}
                    aria-label="Cantidad de productos a agregar"
                    style={{ ...field, width: '74px', padding: '8px 10px' }}
                  />
                  <button type="button" onClick={() => addFilas(Number(cantidadLineas))} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: '1.5px dashed var(--bo)', borderRadius: '8px', padding: '8px 18px', cursor: 'pointer', fontSize: '13px', color: 'var(--ts)' }}>
                    Agregar cantidad
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <div style={{ marginTop: '14px', background: 'var(--sf)', borderRadius: '14px', border: '1px solid var(--bo)', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--ts)', marginRight: 'auto' }}>
          {lotesImportados ? `${totalValidas} conteo(s) importado(s) listo(s) para guardar` : `${totalValidas}/${filas.length} producto(s) listo(s) para guardar`}
        </span>
        <button type="submit" disabled={saving || totalValidas === 0} style={{ border: 'none', background: saving ? 'var(--ts)' : totalValidas ? '#0D9373' : 'var(--bo)', color: '#fff', borderRadius: '10px', padding: '12px 28px', cursor: totalValidas ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 800, minWidth: '200px' }}>
          {saving ? 'Guardando...' : 'Guardar conteo'}
        </button>
      </div>

      <style>{`
        @media (max-width: 1023px) {
          .carnicos-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </form>
  );
}
