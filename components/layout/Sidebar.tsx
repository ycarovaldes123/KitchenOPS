'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import NavIcon from './NavIcon';
import type { NavItem } from '@/lib/roles';

interface SidebarProps {
  navItems: NavItem[];
  user: { email: string; rolLabel: string; iniciales: string };
}

export default function Sidebar({ navItems, user }: SidebarProps) {
  const pathname  = usePathname();
  const router    = useRouter();
  const supabase  = createClient();
  const [exiting, setExiting] = useState(false);

  async function handleLogout() {
    setExiting(true);
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <aside style={{
      position: 'fixed', top: 0, left: 0, bottom: 0, width: '220px',
      background: 'var(--sb)', display: 'flex', flexDirection: 'column',
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px' }}>
        <span style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: 800, color: '#fff' }}>
          Kitchen<span style={{ color: 'var(--ac)' }}>Ops</span>
        </span>
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>
          Torobayo · Valdivia
        </p>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 10px', overflowY: 'auto' }}>
        {navItems.map(item => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '8px', marginBottom: '2px',
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
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
            background: 'var(--ac)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fff',
          }}>
            {user.iniciales}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '13px', color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email.split('@')[0]}
            </p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
              {user.rolLabel}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={exiting}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.06)', border: 'none',
            borderRadius: '7px', padding: '8px 0', color: 'rgba(255,255,255,0.5)',
            fontSize: '13px', cursor: exiting ? 'default' : 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
        >
          {exiting ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
      </div>
    </aside>
  );
}
