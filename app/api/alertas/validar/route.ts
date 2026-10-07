import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { moduloAlertasActivo } from '@/lib/alertas/acceso';
import { advertenciasDeBorrador, type ModuloValidable } from '@/lib/alertas/validar';

// POST /api/alertas/validar — advertencias de un registro ANTES de guardarlo.
// Body: { modulo: 'Producción' | 'Mermas' | 'Colación', registro: <mismo body que el POST del módulo> }
// Solo lectura. Si algo falla responde sin advertencias: validar nunca debe impedir guardar.

const ROLES_POR_MODULO: Record<ModuloValidable, Parameters<typeof requireRol>[0]> = {
  'Producción': ['admin', 'cocina'],
  'Mermas': ['admin', 'cocina', 'economo', 'bodega'],
  'Colación': ['admin', 'cocina', 'economo'],
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { modulo?: string; registro?: Record<string, unknown> } | null;
  const modulo = body?.modulo as ModuloValidable | undefined;
  if (!modulo || !(modulo in ROLES_POR_MODULO) || !body?.registro) {
    return NextResponse.json({ error: 'Solicitud no valida' }, { status: 400 });
  }

  const s = await requireRol(ROLES_POR_MODULO[modulo]);
  if (!s.ok) return s.response;
  if (!moduloAlertasActivo()) return NextResponse.json({ advertencias: [] });

  try {
    const supabase = await createServiceClient();
    const alertas = await advertenciasDeBorrador(supabase, modulo, body.registro);
    return NextResponse.json({
      advertencias: alertas.map(a => ({
        id: a.id, regla: a.regla, nivel: a.nivel, titulo: a.titulo, registro: a.registro,
        detalle: a.detalle, explicacion: a.explicacion, evidencia: a.evidencia,
      })),
    });
  } catch (e) {
    console.error('[alertas] no se pudo validar el borrador:', e instanceof Error ? e.message : e);
    return NextResponse.json({ advertencias: [] });
  }
}
