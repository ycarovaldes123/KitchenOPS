import { NextRequest, NextResponse } from 'next/server';
import { requireRol } from '@/lib/auth-server';
import { fetchToteatSales } from '@/lib/toteat';

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'jefatura', 'economo', 'cocina']);
  if (!s.ok) return s.response;

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  const esCocina = s.rol === 'cocina';
  const raw = searchParams.get('raw') === '1' && !esCocina;
  const soloComida = esCocina ? true : searchParams.get('soloComida') !== '0';

  if (!desde || !hasta) {
    return NextResponse.json({ error: 'Debes enviar desde y hasta en formato YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const result = await fetchToteatSales(desde, hasta, { soloComida });
    return NextResponse.json({
      desde,
      hasta,
      scope: soloComida ? 'comida' : 'todo',
      chunks: result.chunks,
      count: result.items.length,
      items: result.items,
      ...(raw ? { raw: result.raw } : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error consultando TOTEAT' },
      { status: 500 },
    );
  }
}
