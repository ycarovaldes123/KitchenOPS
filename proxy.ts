import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';
import { RMAP, RUTAS_ROL, RUTA_INICIO, RUTA_INICIO_COMUN } from '@/lib/roles';

const PUBLIC_PATHS = ['/login', '/auth', '/logout'];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API routes hacen su propia validacion de rol, pero igual deben pasar por updateSession:
  // asi el token de Supabase se refresca antes de que corra el route handler y un guardado
  // no falla con "No autenticado" cuando el access token expiro (sin recargar la pagina).
  if (pathname.startsWith('/api/')) {
    const { supabaseResponse } = await updateSession(req);
    return supabaseResponse;
  }

  // Keep Supabase session fresh
  const { supabaseResponse, user } = await updateSession(req);

  // Public paths — redirect already-authed users a la pantalla Inicio
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    if (user) {
      const rol = RMAP[user.email ?? ''];
      if (rol) return NextResponse.redirect(new URL(RUTA_INICIO_COMUN, req.url));
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

  // Root redirect -> pantalla Inicio
  if (pathname === '/') {
    return NextResponse.redirect(new URL(RUTA_INICIO_COMUN, req.url));
  }

  const segmento = '/' + pathname.split('/')[1];

  // Primera entrada del dia (o recien iniciada la sesion): mandar a la pantalla Inicio
  // con los botones. Se marca la fecha (zona horaria de Chile) en una cookie; mientras
  // sea el mismo dia, el usuario navega libre por los modulos.
  const COOKIE_VISITA = 'kops-ultima-visita';
  const hoyChile = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const primeraVisitaDelDia = req.cookies.get(COOKIE_VISITA)?.value !== hoyChile;
  if (primeraVisitaDelDia) {
    const opciones = { path: '/', maxAge: 60 * 60 * 24 * 2, sameSite: 'lax' as const };
    if (segmento !== RUTA_INICIO_COMUN) {
      const res = NextResponse.redirect(new URL(RUTA_INICIO_COMUN, req.url));
      res.cookies.set(COOKIE_VISITA, hoyChile, opciones);
      return res;
    }
    supabaseResponse.cookies.set(COOKIE_VISITA, hoyChile, opciones);
  }

  // Check module access. La pantalla Inicio esta disponible para cualquier rol autenticado.
  const permitidas = RUTAS_ROL[rol];
  if (segmento !== '/' && segmento !== RUTA_INICIO_COMUN && !permitidas.some(r => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL(RUTA_INICIO[rol], req.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
