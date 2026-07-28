import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { RMAP, ROL_LABEL, NAV_ITEMS, RUTAS_ROL, type NavItem } from '@/lib/roles';
import Sidebar      from '@/components/layout/Sidebar';
import TopBar       from '@/components/layout/TopBar';
import BottomNav    from '@/components/layout/BottomNav';
import { RolProvider } from '@/components/RolProvider';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const rol = RMAP[user.email ?? ''];
  if (!rol) redirect('/login?error=unauthorized');

  const navItems  = RUTAS_ROL[rol]
    .map(href => NAV_ITEMS.find(item => item.href === href && item.roles.includes(rol)))
    .filter((item): item is NavItem => Boolean(item));
  const iniciales = (user.email ?? '').split('@')[0].slice(0, 2).toUpperCase();
  const userInfo  = { email: user.email!, rolLabel: ROL_LABEL[rol], iniciales };

  return (
    <RolProvider rol={rol}>
    <>
      <style>{`
        .app-sidebar   { display: flex !important; }
        .app-topbar    { display: none  !important; }
        .app-bottomnav { display: none  !important; }
        .app-main      { margin-left: 220px; }

        @media (max-width: 1023px) {
          .app-sidebar   { display: none  !important; }
          .app-topbar    { display: flex  !important; }
          .app-bottomnav { display: flex  !important; }
          .app-main      { margin-left: 0; padding-top: 56px; padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px)); }
        }
      `}</style>

      <div className="app-sidebar">
        <Sidebar navItems={navItems} user={userInfo} />
      </div>

      <div className="app-topbar">
        <TopBar user={userInfo} title="KitchenOps" />
      </div>

      <main className="app-main" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        {children}
      </main>

      <div className="app-bottomnav">
        <BottomNav navItems={navItems} />
      </div>
    </>
    </RolProvider>
  );
}
