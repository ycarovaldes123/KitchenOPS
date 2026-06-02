import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { getDashboardPayload } from '@/lib/dashboard-data';

// GET /api/kpis?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'jefatura']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde') ?? '';
  const hasta = searchParams.get('hasta') ?? '';

  try {
    const payload = await getDashboardPayload(
      supabase,
      desde,
      hasta,
      s.rol === 'admin' || s.rol === 'finanzas',
    );

    return NextResponse.json(payload.kpis);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error cargando KPIs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
