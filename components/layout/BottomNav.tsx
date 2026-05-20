'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import NavIcon from './NavIcon';
import type { NavItem } from '@/lib/roles';

interface BottomNavProps {
  navItems: NavItem[];
}

export default function BottomNav({ navItems }: BottomNavProps) {
  const pathname = usePathname();
  const visible  = navItems.slice(0, 5);

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--sf)', borderTop: '1px solid var(--bo)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      height: 'calc(60px + env(safe-area-inset-bottom, 0px))', zIndex: 100, padding: '0 4px',
    }}>
      {visible.map(item => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              padding: '6px 8px', borderRadius: '8px', minWidth: '52px',
              color: active ? 'var(--ac)' : 'var(--ts)',
              background: active ? 'var(--al)' : 'transparent',
              textDecoration: 'none', fontSize: '10px',
              fontWeight: active ? 600 : 400,
            }}
          >
            <NavIcon name={item.icon} size={20} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
