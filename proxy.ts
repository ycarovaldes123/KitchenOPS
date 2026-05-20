import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';
import { RMAP, RUTAS_ROL, RUTA_INICIO } from '@/lib/roles';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const esPublica =
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(pathname);

  if (esPublica) {
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
  }

  const { supabaseResponse, user } = await updateSession(request);

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const rol = RMAP[user.email ?? ''];
  if (!rol) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'unauthorized');
    return NextResponse.redirect(url);
  }

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = RUTA_INICIO[rol] ?? '/login';
    return NextResponse.redirect(url);
  }

  const rutasPermitidas = RUTAS_ROL[rol] ?? [];
  const tieneAcceso     = rutasPermitidas.some(ruta => pathname.startsWith(ruta));

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
