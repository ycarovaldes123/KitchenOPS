import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

// Emails autorizados y su rol en KitchenOps
const RMAP: Record<string, string> = {
  'chefstorobayo@cerveceriakunstmann.cl': 'cocina',
  'fcaro@cerveceriakunstmann.cl':         'jefatura',
  'jsepulveda@cerveceriakunstmann.cl':    'finanzas',
  'ycaro@cerveceriakunstmann.cl':         'finanzas',
  'ddelgado@cerveceriakunstmann.cl':      'finanzas',
};

// Rutas permitidas por rol
const RUTAS_ROL: Record<string, string[]> = {
  cocina:   ['/produccion', '/colacion', '/mermas', '/historial'],
  jefatura: ['/dashboard', '/historial', '/export'],
  finanzas: ['/kpis', '/costos', '/historial', '/export'],
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
    // Para rutas de API, solo refrescar sesión y pasar
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

  // Ruta raíz → redirigir según rol
  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = rol === 'cocina'
      ? '/produccion'
      : rol === 'jefatura'
      ? '/dashboard'
      : '/kpis';
    return NextResponse.redirect(url);
  }

  // Verificar acceso a rutas protegidas por rol
  const rutasPermitidas = RUTAS_ROL[rol] ?? [];
  const tieneAcceso = rutasPermitidas.some(ruta => pathname.startsWith(ruta));

  if (!tieneAcceso) {
    // Redirigir a su ruta principal si intenta acceder a una que no le corresponde
    const url = request.nextUrl.clone();
    url.pathname = rutasPermitidas[0] ?? '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
