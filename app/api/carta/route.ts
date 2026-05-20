import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { semaforo, calcMargen } from '@/lib/calculos';
import { requireRol } from '@/lib/auth-server';

// GET /api/carta — todos los platos activos con costos calculados
export async function GET() {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();

  const { data: platos, error } = await supabase
    .from('carta')
    .select(`
      id, cod_softland, nombre, categoria, precio_carta, activo, foto_url, updated_at,
      carta_ingredientes (
        id, nombre, cantidad, unidad_medida, precio_unitario, costo_total,
        codigo_producto, pp_id
      )
    `)
    .eq('activo', true)
    .order('categoria')
    .order('nombre');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resultado = (platos ?? []).map(p => {
    const costo_neto   = (p.carta_ingredientes ?? []).reduce((s: number, i: { costo_total: number | null }) => s + (i.costo_total ?? 0), 0);
    const costo_bruto  = costo_neto * 1.19;
    const margen_pct   = calcMargen(costo_neto, p.precio_carta);
    const color        = semaforo(costo_neto, p.precio_carta);
    return { ...p, costo_neto, costo_bruto: Math.round(costo_bruto), margen_pct, semaforo: color };
  });

  return NextResponse.json(resultado);
}
