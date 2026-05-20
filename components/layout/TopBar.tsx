'use client';

interface TopBarProps {
  user: { email: string; rolLabel: string; iniciales: string };
  title: string;
}

export default function TopBar({ user, title }: TopBarProps) {
  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: '56px',
      background: 'var(--sf)', borderBottom: '1px solid var(--bo)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', zIndex: 100,
    }}>
      <span style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: 800, color: 'var(--tx)' }}>
        Kitchen<span style={{ color: 'var(--ac)' }}>Ops</span>
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', color: 'var(--ts)' }}>{user.rolLabel}</span>
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%',
          background: 'var(--ac)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff',
        }}>
          {user.iniciales}
        </div>
      </div>
    </header>
  );
}
