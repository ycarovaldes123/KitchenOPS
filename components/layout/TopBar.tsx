'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { RUTA_INICIO_COMUN } from '@/lib/roles';

interface TopBarProps {
  user: { email: string; rolLabel: string; iniciales: string };
  title?: string;
}

export default function TopBar({ user }: TopBarProps) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cerrar el menú al tocar fuera o al presionar Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleLogout() {
    setExiting(true);
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: '56px',
      background: 'var(--sf)', borderBottom: '1px solid var(--bo)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', zIndex: 100,
    }}>
      <Link href={RUTA_INICIO_COMUN} aria-label="Ir a Inicio" style={{ textDecoration: 'none' }}>
        <span style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: 800, color: 'var(--tx)' }}>
          Kitchen<span style={{ color: 'var(--ac)' }}>Ops</span>
        </span>
      </Link>

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Cuenta"
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: open ? 'var(--al)' : 'transparent',
            border: '1px solid transparent', borderColor: open ? 'var(--bo)' : 'transparent',
            borderRadius: '10px', padding: '4px 6px 4px 10px', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--ts)' }}>{user.rolLabel}</span>
          <span style={{
            width: '30px', height: '30px', borderRadius: '50%',
            background: 'var(--ac)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff',
          }}>
            {user.iniciales}
          </span>
        </button>

        {open && (
          <div
            role="menu"
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              minWidth: '220px', background: 'var(--sf)', border: '1px solid var(--bo)',
              borderRadius: '12px', boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
              padding: '6px', zIndex: 200,
            }}
          >
            <div style={{ padding: '10px 12px 12px', borderBottom: '1px solid var(--bo)', marginBottom: '6px' }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--ts)' }}>{user.rolLabel}</p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={exiting}
              style={{
                width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                borderRadius: '8px', padding: '10px 12px', cursor: exiting ? 'default' : 'pointer',
                fontSize: '14px', fontWeight: 600, color: 'var(--rd)', fontFamily: 'DM Sans, sans-serif',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--al)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <span aria-hidden style={{ fontSize: '15px' }}>⎋</span>
              {exiting ? 'Saliendo…' : 'Cerrar sesión'}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
