'use client';

import { useState } from 'react';
import NavIcon from '@/components/layout/NavIcon';
import type { Evidencia, NivelAlerta } from '@/lib/alertas/types';
import type { ModuloValidable } from '@/lib/alertas/validar';

interface Advertencia {
  id: string;
  regla: string;
  nivel: NivelAlerta;
  titulo: string;
  registro: string;
  detalle: string;
  explicacion: string;
  evidencia: Evidencia[];
}

// Si la validación tarda o falla, se guarda igual: el aviso nunca debe impedir registrar.
const TIMEOUT_MS = 10_000;

const NIVEL: Record<NivelAlerta, { label: string; color: string; bg: string }> = {
  ALTA:    { label: 'Alta',    color: '#B91C1C', bg: '#FEE2E2' },
  REVISAR: { label: 'Revisar', color: '#92400E', bg: '#FEF3C7' },
  INFO:    { label: 'Info',    color: '#1D4ED8', bg: '#EFF6FF' },
};

/**
 * Advertencias del módulo Alertas antes de guardar.
 * `confirmar(registro)` resuelve true si no hay advertencias o si la persona elige "Guardar igual",
 * y false si elige "Corregir". `modal` se renderiza en la página.
 */
export function useAdvertenciasGuardado(modulo: ModuloValidable) {
  const [pendiente, setPendiente] = useState<{ advertencias: Advertencia[]; resolver: (ok: boolean) => void } | null>(null);

  async function confirmar(registro: Record<string, unknown>): Promise<boolean> {
    let advertencias: Advertencia[] = [];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('/api/alertas/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modulo, registro }),
        signal: ctrl.signal,
      });
      if (res.ok) advertencias = (await res.json()).advertencias ?? [];
    } catch {
      // sin advertencias: se guarda normalmente
    } finally {
      clearTimeout(timer);
    }
    if (!advertencias.length) return true;
    return new Promise<boolean>(resolver => setPendiente({ advertencias, resolver }));
  }

  function responder(ok: boolean) {
    pendiente?.resolver(ok);
    setPendiente(null);
  }

  const modal = pendiente ? (
    <AdvertenciasModal advertencias={pendiente.advertencias} onCorregir={() => responder(false)} onGuardar={() => responder(true)} />
  ) : null;

  return { confirmar, modal };
}

function AdvertenciasModal({ advertencias, onCorregir, onGuardar }: { advertencias: Advertencia[]; onCorregir: () => void; onGuardar: () => void }) {
  const n = advertencias.length;
  return (
    <div
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onCorregir(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: '16px' }}
    >
      <div
        role="alertdialog" aria-modal="true" aria-labelledby="adv-titulo"
        style={{ background: 'var(--sf)', borderRadius: '16px', width: '100%', maxWidth: '540px', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '22px 22px 14px' }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: '#FEF3C7', color: '#B45309', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <NavIcon name="triangle-alert" size={20} />
          </span>
          <div>
            <h2 id="adv-titulo" style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: 800, margin: 0 }}>
              Revisa antes de guardar
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: 'var(--ts)' }}>
              {n === 1 ? 'Encontramos 1 dato que parece inusual.' : `Encontramos ${n} datos que parecen inusuales.`} Puede ser correcto: revísalo y decide.
            </p>
          </div>
        </div>

        <div style={{ padding: '0 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {advertencias.map(a => {
            const nv = NIVEL[a.nivel];
            return (
              <div key={a.id} style={{ border: '1px solid var(--bo)', borderLeft: `3px solid ${nv.color}`, borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '14px' }}>{a.registro}</strong>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: nv.color, background: nv.bg, borderRadius: '6px', padding: '2px 7px' }}>{a.titulo}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: 'var(--tx)' }}>{a.explicacion}</p>
                {a.evidencia.length > 0 && (
                  <dl style={{ margin: '8px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', fontSize: '12.5px' }}>
                    {a.evidencia.map(ev => (
                      <div key={ev.label} style={{ display: 'contents' }}>
                        <dt style={{ color: 'var(--ts)' }}>{ev.label}</dt>
                        <dd style={{ margin: 0, fontWeight: ev.destacado ? 700 : 500 }}>{ev.valor}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap', padding: '16px 22px 20px', borderTop: '1px solid var(--bo)', marginTop: '14px' }}>
          <button
            type="button" onClick={onGuardar}
            style={{ height: 42, padding: '0 18px', borderRadius: 8, border: '1.5px solid var(--bo)', background: 'var(--sf)', color: 'var(--tx)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Guardar igual
          </button>
          <button
            type="button" onClick={onCorregir} autoFocus
            style={{ height: 42, padding: '0 18px', borderRadius: 8, border: 'none', background: 'var(--ac)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Corregir
          </button>
        </div>
      </div>
    </div>
  );
}
