import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';
import { RMAP, RUTAS_ROL, RUTA_INICIO } from '@/lib/roles';

const PUBLIC_PATHS = ['/login', '/auth', '/logout'];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API routes do their own auth validation
  if (pathname.startsWith('/api/')) return NextResponse.next();

  // Keep Supabase session fresh
  const { supabaseResponse, user } = await updateSession(req);

  // Public paths — redirect already-authed users to their home
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    if (user) {
      const rol = RMAP[user.email ?? ''];
      if (rol) return NextResponse.redirect(new URL(RUTA_INICIO[rol], req.url));
    }
    return supabaseResponse;
  }

  // Not authenticated
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Authenticated but no role in RMAP
  const rol = RMAP[user.email ?? ''];
  if (!rol) {
    return NextResponse.redirect(new URL('/login?error=unauthorized', req.url));
  }

  // Root redirect
  if (pathname === '/') {
    return NextResponse.redirect(new URL(RUTA_INICIO[rol], req.url));
  }

  // Check module access
  const segmento = '/' + pathname.split('/')[1];
  const permitidas = RUTAS_ROL[rol];
  if (segmento !== '/' && !permitidas.some(r => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL(RUTA_INICIO[rol], req.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
