'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

// Altura aproximada del panel; se usa solo para decidir si conviene abrir hacia arriba.
const PANEL_MAX_HEIGHT = 300;

interface PanelRect {
  left: number;
  top: number;
  width: number;
  placement: 'up' | 'down';
}

/**
 * Panel flotante anclado a un elemento (el boton disparador de un buscador).
 *
 * Se renderiza en un portal a <body> con position: fixed, de modo que ningun
 * contenedor con overflow (tablas scrolleables, tarjetas con overflow:hidden)
 * lo recorte. Reposiciona en scroll/resize y se cierra al hacer click fuera.
 */
export default function AnchoredPanel<T extends HTMLElement>({
  open,
  anchorRef,
  onClose,
  children,
  minWidth = 280,
}: {
  open: boolean;
  anchorRef: RefObject<T | null>;
  onClose: () => void;
  children: ReactNode;
  minWidth?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<PanelRect | null>(null);

  const updateRect = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const espacioAbajo = window.innerHeight - r.bottom;
    const abrirArriba = espacioAbajo < PANEL_MAX_HEIGHT && r.top > espacioAbajo;
    setRect({
      left: r.left,
      top: abrirArriba ? r.top - 4 : r.bottom + 4,
      width: Math.max(r.width, minWidth),
      placement: abrirArriba ? 'up' : 'down',
    });
  }, [anchorRef, minWidth]);

  useEffect(() => {
    if (!open) return;
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [open, updateRect]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, onClose, anchorRef]);

  if (!open || !rect || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        transform: rect.placement === 'up' ? 'translateY(-100%)' : undefined,
        zIndex: 3000,
        width: rect.width,
        maxWidth: 'calc(100vw - 24px)',
        background: 'var(--sf)',
        border: '1.5px solid var(--ac)',
        borderRadius: '12px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
