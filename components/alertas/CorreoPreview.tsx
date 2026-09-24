'use client';

import { useEffect, useState } from 'react';
import NavIcon from '@/components/layout/NavIcon';
import { contarPorGrupo, GRUPOS } from '@/lib/alertas/metricas';
import { asuntoResumen, destacadas, DESTINATARIO_PILOTO } from '@/lib/alertas/resumen';
import type { Alerta } from '@/lib/alertas/types';

interface Props {
  alertas: Alerta[];   // alertas del día que resume el correo
  fecha: string;       // YYYY-MM-DD
  onClose: () => void;
  onVerTodas: () => void;
}

interface EstadoEnvio {
  habilitado: boolean;
  proveedor: 'gmail' | 'resend' | null;
  destinatario: string;
}

// Vista previa + envío de prueba. El envío va SIEMPRE y solo a DESTINATARIO_PILOTO.
export default function CorreoPreview({ alertas, fecha, onClose, onVerTodas }: Props) {
  const [estado, setEstado] = useState<EstadoEnvio | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useEffect(() => {
    let vivo = true;
    fetch('/api/alertas/correo', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo) setEstado(d); })
      .catch(() => { if (vivo) setEstado(null); });
    return () => { vivo = false; };
  }, []);

  async function enviarPrueba() {
    setEnviando(true);
    setResultado(null);
    try {
      const r = await fetch('/api/alertas/correo', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      setResultado(r.ok
        ? { ok: true, texto: `Enviado a ${d.destinatario} vía ${d.proveedor === 'gmail' ? 'Gmail' : 'Resend'}. Revisa también la carpeta Spam.` }
        : { ok: false, texto: d.error ?? 'No se pudo enviar' });
    } finally {
      setEnviando(false);
    }
  }

  const grupos = contarPorGrupo(alertas);
  const top = destacadas(alertas);
  const resto = alertas.length - top.length;
  const listo = !!estado?.habilitado && !!estado.proveedor;
  const aviso = !estado
    ? 'Solo vista previa.'
    : !estado.habilitado
      ? 'Envío desactivado. Para probar: ENABLE_ALERTAS_EMAIL=true en .env.local y reiniciar el servidor.'
      : !estado.proveedor
        ? 'Falta configurar Gmail: GMAIL_USER y GMAIL_APP_PASSWORD en .env.local.'
        : `Envío de prueba activo vía ${estado.proveedor === 'gmail' ? 'Gmail' : 'Resend'}: llega solo a ${DESTINATARIO_PILOTO}.`;

  return (
    <div className="rpp-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rpp-modal alr-mail" role="dialog" aria-modal="true" aria-labelledby="alr-mail-title">
        <header className="rpp-modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="rpp-modal-kicker">Resumen diario</p>
            <h2 id="alr-mail-title" className="rpp-modal-title" style={{ fontSize: 20 }}>Correo al administrador</h2>
          </div>
          <button type="button" className="rpp-icon-btn" aria-label="Cerrar" onClick={onClose}><NavIcon name="x" size={20} /></button>
        </header>
        <p className="alr-mail-banner" style={{ marginTop: 16 }}>{aviso}</p>
        <dl className="alr-mail-meta" style={{ marginTop: 16 }}>
          <dt>Para</dt><dd>{DESTINATARIO_PILOTO}</dd>
          <dt>Asunto</dt><dd>{asuntoResumen(alertas.length, fecha)}</dd>
        </dl>
        <div className="rpp-modal-body alr-mail-body">
          <p>Hola,</p>
          <p>KitchenOps detectó <b>{alertas.length} posibles inconsistencias</b> en Producción, Mermas y Colación. Los movimientos se guardaron normalmente; estas alertas son para revisión.</p>
          <div className="alr-mail-groups">
            {GRUPOS.filter(g => grupos[g] > 0).map(g => <div key={g}><b>{grupos[g]}</b>{g}</div>)}
          </div>
          {top.map(a => (
            <div key={a.id} className="alr-mail-item">
              <b>{a.registro}</b>
              <span>{a.modulo} · {a.detalle}</span>
            </div>
          ))}
          {resto > 0 && <p className="alr-mail-more">+{resto} alerta{resto !== 1 ? 's' : ''} adicional{resto !== 1 ? 'es' : ''}</p>}
          {resultado && <div className={`rpp-alert ${resultado.ok ? 'is-warn' : 'is-error'}`} role="status" style={{ margin: '0 0 12px' }}>{resultado.texto}</div>}
        </div>
        <footer className="rpp-modal-foot">
          <button type="button" className="rpp-btn" onClick={onVerTodas}>Ver todas las alertas</button>
          <button type="button" className="rpp-btn rpp-btn-primary" onClick={enviarPrueba} disabled={!listo || enviando} title={listo ? `Envía el resumen solo a ${DESTINATARIO_PILOTO}` : aviso}>
            <NavIcon name="mail" size={15} /> {enviando ? 'Enviando…' : 'Enviar prueba'}
          </button>
        </footer>
      </div>
    </div>
  );
}
