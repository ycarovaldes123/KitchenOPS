'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import NavIcon from './NavIcon';
import { RUTA_INICIO_COMUN, type NavItem } from '@/lib/roles';

interface SidebarProps {
  navItems: NavItem[];
  user: { email: string; rolLabel: string; iniciales: string };
}

const LS_KEY = 'kops-sidebar-collapsed';

export default function Sidebar({ navItems, user }: SidebarProps) {
  const pathname  = usePathname();
  const router    = useRouter();
  const supabase  = createClient();
  const [exiting, setExiting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // La preferencia se guarda en localStorage; el ancho real (--sidebar-w) ya lo aplica el
  // script inline de layout.tsx antes del primer render para no parpadear.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el estado inicial con la preferencia guardada (localStorage no existe en SSR)
    try { setCollapsed(localStorage.getItem(LS_KEY) === '1'); } catch { /* noop */ }
  }, []);

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, next ? '1' : '0'); } catch { /* noop */ }
      document.documentElement.style.setProperty('--sidebar-w', next ? '72px' : '220px');
      return next;
    });
  }

  async function handleLogout() {
    setExiting(true);
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <aside style={{
      position: 'fixed', top: 0, left: 0, bottom: 0, width: 'var(--sidebar-w)',
      background: 'var(--sb)', display: 'flex', flexDirection: 'column',
      zIndex: 100, overflowX: 'hidden',
    }}>
      <style>{`
        .sb-toggle { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: background .15s, border-color .15s, color .15s; }
        .sb-toggle:hover { background: var(--ac) !important; border-color: var(--ac) !important; color: #fff !important; }
        .sb-toggle:active { transform: scale(0.94); }
      `}</style>

      {/* Logo (acceso directo a Inicio) + boton contraer */}
      <div style={{
        padding: collapsed ? '14px 8px 10px' : '22px 18px 14px',
        display: 'flex', flexDirection: 'column', alignItems: collapsed ? 'center' : 'stretch', gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Link href={RUTA_INICIO_COMUN} aria-label="Ir a Inicio" title="Inicio" style={{ textDecoration: 'none', minWidth: 0 }}>
            {collapsed ? (
              <span style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, color: 'var(--ac)', lineHeight: 1 }}>K</span>
            ) : (
              <>
                <span style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>
                  Kitchen<span style={{ color: 'var(--ac)' }}>Ops</span>
                </span>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>Torobayo · Valdivia</p>
              </>
            )}
          </Link>
        </div>

        {/* Boton contraer / expandir — visible y con area de toque comoda */}
        <button
          type="button"
          className="sb-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          aria-pressed={collapsed}
          title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            width: collapsed ? '44px' : '100%', height: '40px', flexShrink: 0,
            background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: '9px', cursor: 'pointer', color: '#fff',
            fontSize: '12.5px', fontWeight: 600,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {!collapsed && <span>Contraer menú</span>}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: collapsed ? '4px 8px' : '4px 10px', overflowY: 'auto', overflowX: 'hidden' }}>
        {navItems.map(item => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              style={{
                display: 'flex', alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: collapsed ? 0 : '10px',
                padding: collapsed ? '11px 0' : '10px 12px',
                borderRadius: '8px', marginBottom: '2px',
                color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                background: active ? 'var(--ac)' : 'transparent',
                textDecoration: 'none', fontSize: '14px',
                fontWeight: active ? 600 : 400,
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <NavIcon name={item.icon} />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div style={{ padding: collapsed ? '12px 8px' : '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: '10px', marginBottom: '10px' }}>
          <div
            title={collapsed ? `${user.email.split('@')[0]} · ${user.rolLabel}` : undefined}
            style={{
              width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
              background: 'var(--ac)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fff',
            }}
          >
            {user.iniciales}
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '13px', color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email.split('@')[0]}
              </p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{user.rolLabel}</p>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          disabled={exiting}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.06)', border: 'none',
            borderRadius: '7px', padding: '8px 0', color: 'rgba(255,255,255,0.5)',
            fontSize: '13px', cursor: exiting ? 'default' : 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
        >
          {collapsed
            ? <span aria-hidden style={{ fontSize: '15px' }}>⎋</span>
            : (exiting ? 'Saliendo…' : 'Cerrar sesión')}
        </button>
      </div>
    </aside>
  );
}
