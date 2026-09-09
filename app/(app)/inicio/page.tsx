import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { RMAP, ROL_LABEL, NAV_ITEMS, RUTAS_ROL, NOMBRE_POR_EMAIL, type NavItem } from '@/lib/roles';
import InicioGrid from '@/components/InicioGrid';

export const metadata = { title: 'Inicio · KitchenOps' };

export default async function InicioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const rol = RMAP[user.email ?? ''];
  if (!rol) redirect('/login?error=unauthorized');

  // Mismos modulos que la barra de navegacion: cada rol ve solo los suyos.
  const navItems = RUTAS_ROL[rol]
    .map(href => NAV_ITEMS.find(item => item.href === href && item.roles.includes(rol)))
    .filter((item): item is NavItem => Boolean(item));

  const email = user.email ?? '';
  const nombre = NOMBRE_POR_EMAIL[email] ?? email.split('@')[0];

  return <InicioGrid items={navItems} nombre={nombre} rolLabel={ROL_LABEL[rol]} />;
}
