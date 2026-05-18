import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

// Emails autorizados y su rol en KitchenOps
// admin → acceso total (ycaro + jsepulveda)
const RMAP: Record<string, string> = {
  'ycaro@cerveceriakunstmann.cl':         'admin',
  'jsepulveda@cerveceriakunstmann.cl':    'admin',
  'ddelgado@cerveceriakunstmann.cl':      'finanzas',
  'fcaro@cerveceriakunstmann.cl':         'jefatura',
  'chefstorobayo@cerveceriakunstmann.cl': 'cocina',
};

// Rutas permitidas por rol
// admin tiene acceso a TODO
const RUTAS_ROL: Record<string, string[]> = {
  admin:    ['/produccion', '/colacion', '/mermas', '/historial', '/dashboard', '/kpis', '/costos', '/export'],
  finanzas: ['/kpis', '/costos', '/historial', '/export'],
  jefatura: ['/dashboard', '/historial', '/export'],
  cocina:   ['/produccion', '/colacion', '/mermas', '/historial'],
};

// Ruta de inicio por rol
const RUTA_INICIO: Record<string, string> = {
  admin:    '/kpis',
  finanzas: '/kpis',
  jefatura: '/dashboard',
  cocina:   '/produccion',
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rutas que no requieren auth
  const esPublica =
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(pathname);

  if (esPublica) {
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
  }

  // Refrescar sesión y obtener usuario
  const { supabaseResponse, user } = await updateSession(request);

  // Sin sesión → login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Email no autorizado → login con error
  const rol = RMAP[user.email ?? ''];
  if (!rol) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'unauthorized');
    return NextResponse.redirect(url);
  }

  // Ruta raíz → redirigir a inicio del rol
  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = RUTA_INICIO[rol] ?? '/login';
    return NextResponse.redirect(url);
  }

  // Verificar acceso según rol
  const rutasPermitidas = RUTAS_ROL[rol] ?? [];
  const tieneAcceso = rutasPermitidas.some(ruta => pathname.startsWith(ruta));

  if (!tieneAcceso) {
    const url = request.nextUrl.clone();
    url.pathname = RUTA_INICIO[rol] ?? '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
