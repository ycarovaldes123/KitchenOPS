import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { rolDeUsuario, ROL_LABEL, NAV_ITEMS, RUTAS_ROL, NOMBRE_POR_EMAIL, type NavItem } from '@/lib/roles';
import { headers } from 'next/headers';
import InicioGrid from '@/components/InicioGrid';
import { ALERTAS_HREF, conModuloAlertas } from '@/lib/alertas/acceso';

export const metadata = { title: 'Inicio · KitchenOps' };

export default async function InicioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const rol = rolDeUsuario(user);
  if (!rol) redirect('/login?error=unauthorized');

  // Mismos modulos que la barra de navegacion: cada rol ve solo los suyos.
  // En la tarjeta de Inicio el piloto local se muestra con su nombre completo.
  const navItems = conModuloAlertas(
    RUTAS_ROL[rol]
      .map(href => NAV_ITEMS.find(item => item.href === href && item.roles.includes(rol)))
      .filter((item): item is NavItem => Boolean(item)),
    rol,
    (await headers()).get('host'),
  ).map(item => item.href === ALERTAS_HREF ? { ...item, label: 'Alertas y Validaciones' } : item);

  const email = user.email ?? '';
  const nombre = NOMBRE_POR_EMAIL[email] ?? email.split('@')[0];

  return <InicioGrid items={navItems} nombre={nombre} rolLabel={ROL_LABEL[rol]} />;
}
