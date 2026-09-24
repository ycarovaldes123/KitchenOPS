'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import NavIcon from './NavIcon';
import './navegacion.css';
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
    <aside
      className={`sb${collapsed ? ' is-collapsed' : ''}`}
      style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 'var(--sidebar-w)',
        background: 'var(--sb)', display: 'flex', flexDirection: 'column',
        zIndex: 100, overflowX: 'hidden',
      }}
    >
      {/* Logo (acceso directo a Inicio) + boton contraer */}
      <div className="sb-head">
        <Link href={RUTA_INICIO_COMUN} aria-label="Ir a Inicio" title="Inicio" className="sb-brand">
          {collapsed ? (
            <span className="sb-brand__mark">K</span>
          ) : (
            <>
              <span className="sb-brand__name">Kitchen<span>Ops</span></span>
              <p className="sb-brand__place">Torobayo · Valdivia</p>
            </>
          )}
        </Link>

        {/* Boton contraer / expandir — misma altura, radio e icono que las filas del menú */}
        <button
          type="button"
          className="sb-btn"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          aria-pressed={collapsed}
          title={collapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          <span className="sb-icon" style={{ transform: collapsed ? 'rotate(180deg)' : undefined }}>
            <NavIcon name="back" size={18} />
          </span>
          {!collapsed && <span className="sb-label">Contraer menú</span>}
        </button>
      </div>

      {/* Nav */}
      <nav className="sb-nav" aria-label="Módulos">
        {navItems.map(item => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={`sb-link${active ? ' is-active' : ''}`}
            >
              <span className="sb-icon"><NavIcon name={item.icon} size={20} /></span>
              {!collapsed && <span className="sb-label">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="sb-foot">
        <div className="sb-user">
          <div className="sb-avatar" title={collapsed ? `${user.email.split('@')[0]} · ${user.rolLabel}` : undefined}>
            {user.iniciales}
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <p className="sb-user__name">{user.email.split('@')[0]}</p>
              <p className="sb-user__rol">{user.rolLabel}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          className="sb-btn"
          onClick={handleLogout}
          disabled={exiting}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <span className="sb-icon"><NavIcon name="logout" size={18} /></span>
          {!collapsed && <span className="sb-label">{exiting ? 'Saliendo…' : 'Cerrar sesión'}</span>}
        </button>
      </div>
    </aside>
  );
}
