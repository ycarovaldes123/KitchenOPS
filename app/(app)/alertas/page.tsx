import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { RMAP } from '@/lib/roles';
import { alertasHabilitadas } from '@/lib/alertas/acceso';
import AlertasModulo from '@/components/alertas/AlertasModulo';
import '../maestros/recetas-pp.css';
import './alertas.css';

export const metadata = { title: 'Alertas y Validaciones · KitchenOps' };

// Solo administrador (ver lib/alertas/acceso.ts); con ENABLE_ALERTAS_MODULE=false → 404.
// proxy.ts ya redirige a Inicio; esta verificación es una segunda barrera.
export default async function AlertasPage() {
  const host = (await headers()).get('host');
  if (!alertasHabilitadas(host)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!alertasHabilitadas(host, RMAP[user.email ?? ''])) notFound();

  return <AlertasModulo />;
}
