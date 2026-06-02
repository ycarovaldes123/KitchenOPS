import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { fetchToteatSales } from '@/lib/toteat';

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'economo']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const desde = body.desde as string | undefined;
  const hasta = body.hasta as string | undefined;
  const soloComida = body.soloComida !== false;

  if (!desde || !hasta) {
    return NextResponse.json({ error: 'Debes enviar desde y hasta en formato YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const result = await fetchToteatSales(desde, hasta, { soloComida });
    const supabase = await createClient();

    const rows = result.items.map(item => ({
      fecha: item.fecha,
      order_id: item.order_id,
      product_code: item.product_code,
      product_name: item.product_name,
      category: item.category,
      quantity: item.quantity,
      gross_amount: item.gross_amount,
      net_amount: item.net_amount,
      source_key: buildSourceKey(item),
      raw: item.raw,
      synced_by: s.email,
    }));

    if (rows.length) {
      const { error } = await supabase
        .from('ventas_toteat')
        .upsert(rows, { onConflict: 'source_key' });

      if (error) {
        return NextResponse.json({
          error: `${error.message}. Ejecuta scripts/supabase_toteat_bodega.sql en Supabase.`,
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      desde,
      hasta,
      scope: soloComida ? 'comida' : 'todo',
      chunks: result.chunks,
      inserted_or_updated: rows.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error sincronizando TOTEAT' },
      { status: 500 },
    );
  }
}

function buildSourceKey(item: {
  fecha: string;
  order_id: string | null;
  product_code: string | null;
  product_name: string;
}) {
  return [
    item.fecha,
    item.order_id ?? '',
    item.product_code ?? '',
    item.product_name.trim().toUpperCase(),
  ].join('|');
}
