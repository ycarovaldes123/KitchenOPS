import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';
import { fetchToteatSales } from '@/lib/toteat';
import { calcularPreciosToteat, rangoPrecioToteat } from '@/lib/precio-carta-toteat';

// POST /api/carta/precio-toteat — botón "Actualizar precio" de Costos.
// Recalcula precio_carta de cada plato con código Toteat: (venta + descuento) / cantidad vendida
// con las ventas de los últimos 30 días (ver lib/precio-carta-toteat.ts) y solo guarda los que cambiaron.
// Platos sin código Toteat o sin ventas en esos 30 días conservan su precio.

// Toteat se consulta un día por request (~4 días/s): 30 días tardan ~8 s en frío.
export const maxDuration = 60;

type CartaPrecio = { id: string; nombre: string; codigo_toteat: string | null; precio_carta: number | null };

export async function POST() {
  const s = await requireRol(['admin', 'finanzas', 'operaciones']);
  if (!s.ok) return s.response;

  try {
    const rango = rangoPrecioToteat();
    const { items } = await fetchToteatSales(rango.desde30, rango.hasta, { soloComida: false });
    const precios = calcularPreciosToteat(items, [{ desde: rango.desde30, periodo: '30 días' }]);

    const supabase = await createClient();
    const { data, error } = await supabase.from('carta').select('id,nombre,codigo_toteat,precio_carta');
    if (error) throw new Error(error.message);
    const carta = (data ?? []) as CartaPrecio[];

    const cambios: { id: string; nombre: string; antes: number | null; despues: number }[] = [];
    let conCodigo = 0;
    let sinVentas = 0;
    for (const p of carta) {
      const code = (p.codigo_toteat ?? '').trim().toUpperCase();
      if (!code) continue;
      conCodigo += 1;
      const t = precios.get(code);
      if (!t) { sinVentas += 1; continue; }
      const antes = p.precio_carta == null ? null : Number(p.precio_carta);
      if (antes === t.precio) continue;
      cambios.push({ id: p.id, nombre: p.nombre, antes, despues: t.precio });
    }

    const ahora = new Date().toISOString();
    for (const c of cambios) {
      const { error: upErr } = await supabase
        .from('carta')
        .update({ precio_carta: c.despues, updated_at: ahora })
        .eq('id', c.id);
      if (upErr) throw new Error(`${c.nombre}: ${upErr.message}`);
    }

    if (cambios.length) {
      await auditLog(supabase, {
        usuario_email: s.email,
        rol_usuario: s.rol,
        accion: 'actualizar_precio_carta_toteat',
        tabla: 'carta',
        datos_anteriores: { periodo: { desde: rango.desde30, hasta: rango.hasta }, platos: cambios.map(c => ({ id: c.id, nombre: c.nombre, precio_carta: c.antes })) },
        datos_nuevos: { platos: cambios.map(c => ({ id: c.id, precio_carta: c.despues })) },
      });
    }

    return NextResponse.json({
      ok: true,
      periodo: { desde: rango.desde30, hasta: rango.hasta },
      revisados: conCodigo,
      sin_ventas: sinVentas,
      actualizados: cambios.length,
      cambios,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudieron actualizar los precios desde Toteat' },
      { status: 500 },
    );
  }
}
