'use client';

import { useState, useEffect, useCallback } from 'react';

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

const labelSt = {
  display: 'block' as const, fontSize: '11px', fontWeight: 600 as const,
  color: 'var(--ts)', textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: '4px',
};
const inputSt = {
  width: '100%', border: '1.5px solid var(--bo)', borderRadius: '8px',
  padding: '8px 11px', fontSize: '14px', background: 'var(--bg)',
  color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif',
};

const shortcuts = [
  { label: 'Este mes',  desde: () => mesInicio(),     hasta: () => hoyChile() },
  { label: '3 meses',   desde: () => restarMeses(3),  hasta: () => hoyChile() },
  { label: '6 meses',   desde: () => restarMeses(6),  hasta: () => hoyChile() },
  { label: 'Este año',  desde: () => `${new Date().getFullYear()}-01-01`, hasta: () => hoyChile() },
];

const HOJAS = [
  { nombre: 'RESUMEN',    desc: 'Metadatos del archivo: período, conteos y reglas de cálculo' },
  { nombre: 'PRODUCCION', desc: 'Informes diarios de producción PP con costos estimados' },
  { nombre: 'VERDURAS',   desc: 'Rendimiento de verduras: KG utilizados, rendimiento, merma %' },
  { nombre: 'COLACION',   desc: 'Colaciones del personal con ingredientes y costo por plato' },
  { nombre: 'MERMA',      desc: 'Registros de mermas y desperdicios con motivo y costo' },
];

interface Preview { total_informes: number; total_colaciones: number; total_mermas: number }

export default function ExportPage() {
  const [desde,      setDesde]      = useState(mesInicio());
  const [hasta,      setHasta]      = useState(hoyChile());
  const [descargando, setDescargando] = useState(false);
  const [preview,    setPreview]    = useState<Preview | null>(null);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [err,        setErr]        = useState('');

  const cargarPreview = useCallback(async (d: string, h: string) => {
    if (!d || !h) return;
    setLoadingPrev(true);
    try {
      const res = await fetch(`/api/kpis?desde=${d}&hasta=${h}`);
      if (res.ok) setPreview(await res.json());
    } finally {
      setLoadingPrev(false);
    }
  }, []);

  useEffect(() => { cargarPreview(desde, hasta); }, [desde, hasta, cargarPreview]);

  async function descargar() {
    if (!desde || !hasta) { setErr('Selecciona un período.'); return; }
    setErr(''); setDescargando(true);
    try {
      const res = await fetch(`/api/export?desde=${desde}&hasta=${hasta}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al generar el archivo');
      }
      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = url;
      a.download     = `KitchenOps_${desde}_${hasta}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div style={{ padding: '20px 32px', maxWidth: '1280px' }}>
      <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: '0 0 2px' }}>Exportar</h1>
      <p style={{ color: 'var(--ts)', fontSize: '13px', marginBottom: '16px', marginTop: 0 }}>
        Descarga los registros del período en formato Excel (.xlsx)
      </p>

      {err && (
        <div style={{ background: '#FEF2F2', border: '1px solid var(--rd)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', color: 'var(--rd)', fontSize: '14px' }}>
          ⚠ {err}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: '16px', alignItems: 'start', marginBottom: '16px' }}>

        {/* Col izq: Selector de período */}
        <div style={{ background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)', padding: '20px' }}>
          <p style={{ ...labelSt, marginBottom: '14px' }}>Período</p>

          <div style={{ marginBottom: '10px' }}>
            <label style={labelSt}>Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputSt} />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelSt}>Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputSt} />
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {shortcuts.map(s => (
              <button
                key={s.label} type="button"
                onClick={() => { setDesde(s.desde()); setHasta(s.hasta()); }}
                style={{ padding: '5px 12px', borderRadius: '20px', border: '1.5px solid var(--bo)', background: 'var(--bg)', color: 'var(--ts)', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ac)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ac)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--bo)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ts)'; }}
              >{s.label}</button>
            ))}
          </div>

          {/* Vista previa */}
          {(loadingPrev || preview) && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--bo)' }}>
              <p style={{ ...labelSt, marginBottom: '10px' }}>Registros del período</p>
              {loadingPrev ? (
                <p style={{ fontSize: '13px', color: 'var(--ts)', margin: 0 }}>Cargando...</p>
              ) : preview ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { label: 'Informes producción', count: preview.total_informes },
                    { label: 'Colaciones',          count: preview.total_colaciones },
                    { label: 'Registros mermas',    count: preview.total_mermas },
                  ].map(({ label, count }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: 'var(--ts)' }}>{label}</span>
                      <span style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'Syne, sans-serif', color: count > 0 ? 'var(--tx)' : 'var(--ts)' }}>{count}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Col der: Contenido del archivo */}
        <div style={{ background: 'var(--sf)', borderRadius: '12px', border: '1px solid var(--bo)', padding: '20px' }}>
          <p style={{ ...labelSt, marginBottom: '14px' }}>Contenido del archivo Excel</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {HOJAS.map(h => (
              <div key={h.nombre} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ background: 'var(--al)', color: 'var(--ac)', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '11px', padding: '3px 8px', borderRadius: '5px', flexShrink: 0, marginTop: '1px', whiteSpace: 'nowrap' }}>
                  {h.nombre}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--ts)', lineHeight: 1.4 }}>{h.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Botón descarga */}
      <button
        type="button"
        onClick={descargar}
        disabled={descargando}
        style={{
          width: '100%', padding: '13px', borderRadius: '10px', border: 'none', cursor: descargando ? 'default' : 'pointer',
          background: descargando ? '#ccc' : 'var(--ac)', color: '#fff',
          fontSize: '15px', fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        {descargando ? (
          <>
            <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
            Generando archivo...
          </>
        ) : (
          '↓ Descargar Excel'
        )}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
