'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Opcion = 'ge_produccion' | 'gs_produccion' | 'consumo_merma' | 'consumo_colacion' | 'consumo_inventario';

const OPCIONES: { value: Opcion; titulo: string; formato: string; desc: string }[] = [
  { value: 'ge_produccion', titulo: 'Producción PP (ingreso)', formato: 'GE_PRODUCCION · concepto 10', desc: 'PP terminados del mes (códigos 0502), una guía "PRODUCCION <MES>".' },
  { value: 'gs_produccion', titulo: 'Producción (salida de insumos)', formato: 'GS_PRODUCCION · concepto 09', desc: 'Insumos usados en cada PP según su receta; una guía por PP. Cta 1-1-06-05.' },
  { value: 'consumo_merma', titulo: 'Merma', formato: 'GS_CONSUMO · concepto 07', desc: 'Merma de productos + insumos de platos dados de baja, guía "MERMA <MES>".' },
  { value: 'consumo_colacion', titulo: 'Colación personal', formato: 'GS_CONSUMO · concepto 07', desc: 'Ingredientes de las colaciones del mes, guía "COLACION PERSONAL <MES>".' },
  { value: 'consumo_inventario', titulo: 'Toma de inventario', formato: 'GS_CONSUMO · concepto 07', desc: 'Lo contado en la toma elegida, como guía de Merma o de Colación.' },
];

interface Fila { guia: string; codigo: string; descripcion: string; cantidad: number }
interface Aviso { tipo: 'excluido' | 'revisar'; detalle: string }
interface Vista {
  filas: Fila[]; guias: string[]; avisos: Aviso[]; fechaTexto: string;
  fechasInventario?: { fecha: string; productos: number }[]; fechaInventario?: string | null;
}

function mesAnterior() {
  const hoy = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }));
  hoy.setDate(1); hoy.setMonth(hoy.getMonth() - 1);
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

const fmtCant = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 4 });
const fmtFecha = (iso: string) => iso.split('-').reverse().join('/');

const labelSt = {
  display: 'block' as const, fontSize: '11px', fontWeight: 600 as const,
  color: 'var(--ts)', textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: '4px',
};
const inputSt = {
  width: '100%', border: '1.5px solid var(--bo)', borderRadius: '8px',
  padding: '8px 11px', fontSize: '14px', background: 'var(--bg)',
  color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif',
};

export default function SoftlandPanel() {
  const [opcion, setOpcion] = useState<Opcion>('ge_produccion');
  const [mes, setMes] = useState(mesAnterior());
  const [folio, setFolio] = useState('');
  const [guiaInv, setGuiaInv] = useState<'merma' | 'colacion'>('merma');
  const [fechaInv, setFechaInv] = useState('');
  const [vista, setVista] = useState<Vista | null>(null);
  const [cargando, setCargando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [err, setErr] = useState('');
  const [verTodo, setVerTodo] = useState(false);

  const unaGuia = opcion !== 'gs_produccion';

  const params = useMemo(() => {
    const p = new URLSearchParams({ mes });
    if (opcion === 'ge_produccion' || opcion === 'gs_produccion') p.set('archivo', opcion);
    else {
      p.set('archivo', 'gs_consumo');
      p.set('fuente', opcion.replace('consumo_', ''));
      if (opcion === 'consumo_inventario') {
        p.set('guia', guiaInv);
        if (fechaInv) p.set('fecha_inv', fechaInv);
      }
    }
    return p;
  }, [opcion, mes, guiaInv, fechaInv]);

  const cargar = useCallback(async (p: URLSearchParams) => {
    setCargando(true); setErr('');
    try {
      const r = await fetch(`/api/export/softland?${p.toString()}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error al preparar la planilla');
      setVista(d);
    } catch (e) {
      setVista(null);
      setErr(e instanceof Error ? e.message : 'Error al preparar la planilla');
    } finally {
      setCargando(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- vista previa al cambiar planilla/mes/opciones
  useEffect(() => { if (/^\d{4}-\d{2}$/.test(mes)) void cargar(params); }, [params, mes, cargar]);

  function cambiarOpcion(o: Opcion) { setOpcion(o); setFechaInv(''); setVerTodo(false); }

  async function descargar() {
    const folioNum = folio.trim();
    if (folioNum && !/^\d+$/.test(folioNum)) { setErr('El folio debe ser un número entero.'); return; }
    setDescargando(true); setErr('');
    try {
      const p = new URLSearchParams(params);
      p.set('formato', 'xlsx');
      if (folioNum && unaGuia) p.set('folio', folioNum);
      const r = await fetch(`/api/export/softland?${p.toString()}`);
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? 'Error al generar el archivo'); }
      const nombre = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? `Softland_${mes}.xlsx`;
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setDescargando(false);
    }
  }

  const excluidos = vista?.avisos.filter(a => a.tipo === 'excluido') ?? [];
  const revisar = vista?.avisos.filter(a => a.tipo === 'revisar') ?? [];
  const filasVisibles = verTodo ? vista?.filas ?? [] : (vista?.filas ?? []).slice(0, 12);
  const sel = OPCIONES.find(o => o.value === opcion)!;

  return (
    <div style={{ background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)', padding: '20px', marginTop: '20px' }}>
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: 800, margin: '0 0 2px' }}>Planillas Softland</h2>
      <p style={{ color: 'var(--ts)', fontSize: '13px', margin: '0 0 16px' }}>
        Archivos para cargar en Softland con el formato de contabilidad: bodega 11, CC 08, fecha = último día del mes (texto) y folio vacío hasta que se asigne.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px', marginBottom: '16px' }}>
        {OPCIONES.map(o => {
          const on = o.value === opcion;
          return (
            <button key={o.value} type="button" onClick={() => cambiarOpcion(o.value)} aria-pressed={on}
              style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                border: `1.5px solid ${on ? 'var(--ac)' : 'var(--bo)'}`, background: on ? 'var(--al)' : 'var(--bg)',
              }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '14px', color: 'var(--tx)' }}>{o.titulo}</span>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: on ? 'var(--ac)' : 'var(--ts)', marginTop: '2px' }}>{o.formato}</span>
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: '13px', color: 'var(--ts)', margin: '0 0 14px' }}>{sel.desc}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div>
          <label style={labelSt}>Mes</label>
          <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={inputSt} />
        </div>
        <div>
          <label style={labelSt}>Folio (opcional)</label>
          <input inputMode="numeric" value={unaGuia ? folio : ''} disabled={!unaGuia} onChange={e => setFolio(e.target.value.replace(/\D/g, ''))}
            placeholder={unaGuia ? 'Vacío hasta asignar' : 'Una guía por PP: se asigna en Excel'} style={{ ...inputSt, opacity: unaGuia ? 1 : 0.6 }} />
        </div>
        {opcion === 'consumo_inventario' && (
          <>
            <div>
              <label style={labelSt}>Guía</label>
              <select value={guiaInv} onChange={e => setGuiaInv(e.target.value as 'merma' | 'colacion')} style={inputSt}>
                <option value="merma">Merma</option>
                <option value="colacion">Colación personal</option>
              </select>
            </div>
            <div>
              <label style={labelSt}>Toma de inventario</label>
              <select value={fechaInv || vista?.fechaInventario || ''} onChange={e => setFechaInv(e.target.value)} style={inputSt}
                disabled={!vista?.fechasInventario?.length}>
                {!vista?.fechasInventario?.length && <option value="">Sin tomas en el mes</option>}
                {vista?.fechasInventario?.map(f => <option key={f.fecha} value={f.fecha}>{fmtFecha(f.fecha)} · {f.productos} líneas</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {err && (
        <div style={{ background: '#FEF2F2', border: '1px solid var(--rd)', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', color: 'var(--rd)', fontSize: '14px' }}>
          ⚠ {err}
        </div>
      )}

      {cargando ? (
        <p style={{ fontSize: '13px', color: 'var(--ts)' }}>Preparando vista previa...</p>
      ) : vista && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '12px', fontSize: '13px', color: 'var(--ts)' }}>
            <span><b style={{ color: 'var(--tx)', fontSize: '16px' }}>{vista.filas.length}</b> filas</span>
            <span><b style={{ color: 'var(--tx)', fontSize: '16px' }}>{vista.guias.length}</b> guía{vista.guias.length !== 1 ? 's' : ''}</span>
            <span>Fecha <b style={{ color: 'var(--tx)' }}>{vista.fechaTexto}</b></span>
            {excluidos.length > 0 && <span style={{ color: '#B91C1C' }}>{excluidos.length} fuera del archivo</span>}
            {revisar.length > 0 && <span style={{ color: '#B45309' }}>{revisar.length} para revisar</span>}
          </div>

          {vista.filas.length > 0 && (
            <div style={{ overflowX: 'auto', border: '1px solid var(--bo)', borderRadius: '10px', marginBottom: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Descripción guía', 'Código', 'Descripción', 'Cantidad'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Cantidad' ? 'right' : 'left', padding: '8px 10px', fontSize: '11px', color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filasVisibles.map((f, i) => (
                    <tr key={`${f.guia}-${f.codigo}-${i}`} style={{ borderTop: '1px solid var(--bo)' }}>
                      <td style={{ padding: '6px 10px', color: 'var(--ts)' }}>{f.guia}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{f.codigo}</td>
                      <td style={{ padding: '6px 10px' }}>{f.descripcion}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtCant(f.cantidad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vista.filas.length > 12 && (
                <button type="button" onClick={() => setVerTodo(v => !v)} className="pill-btn" style={{ margin: '8px 10px' }}>
                  {verTodo ? 'Ver menos' : `Ver las ${vista.filas.length} filas`}
                </button>
              )}
            </div>
          )}

          {(excluidos.length > 0 || revisar.length > 0) && (
            <details style={{ marginBottom: '14px', fontSize: '13px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Avisos ({excluidos.length + revisar.length})</summary>
              <ul style={{ margin: '8px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {revisar.map((a, i) => <li key={`r${i}`} style={{ color: '#B45309' }}>Revisar · {a.detalle}</li>)}
                {excluidos.map((a, i) => <li key={`e${i}`} style={{ color: '#B91C1C' }}>No incluido · {a.detalle}</li>)}
              </ul>
            </details>
          )}
        </>
      )}

      <button type="button" onClick={descargar} disabled={descargando || cargando || !vista?.filas.length}
        style={{
          width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
          cursor: descargando || !vista?.filas.length ? 'default' : 'pointer',
          background: descargando || !vista?.filas.length ? '#ccc' : 'var(--ac)', color: '#fff',
          fontSize: '15px', fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
        }}>
        {descargando ? 'Generando...' : `↓ Descargar ${sel.formato.split(' ·')[0]}`}
      </button>
    </div>
  );
}
