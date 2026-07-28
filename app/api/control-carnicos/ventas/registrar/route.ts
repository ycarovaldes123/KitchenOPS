import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import type { ConsumoCalculado } from '@/types/carnicos';

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'bodega']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const fecha = body.fecha;
  const consumos = Array.isArray(body.consumos) ? (body.consumos as ConsumoCalculado[]) : [];
  const responsable_id = typeof body.responsable_id === 'string' ? body.responsable_id : null;
  const responsable_nombre = String(body.responsable_nombre || 'Sistema Ventas Toteat').trim();
  const turno = body.turno === 'AM' || body.turno === 'PM' ? body.turno : null;

  if (!isIsoDate(fecha) || consumos.length === 0) {
    return NextResponse.json({ error: 'Faltan fecha o consumos a registrar' }, { status: 400 });
  }

  const supabase = await createClient();
  let insertados = 0;
  const omitidos: { codigo_toteat: string; producto_nombre: string }[] = [];

  for (const consumo of consumos) {
    for (const origen of consumo.platos_origen) {
      const consumoParaPlato = origen.cantidad_por_plato * origen.cantidad_vendida;

      const { data: inserted, error: insertError } = await supabase
        .from('carnicos_ventas_registradas')
        .insert({
          fecha,
          codigo_toteat: origen.codigo_toteat,
          plato_nombre: origen.plato_nombre,
          cantidad_vendida: origen.cantidad_vendida,
          producto_id: consumo.producto_id,
          cantidad_por_plato: origen.cantidad_por_plato,
          unidad_medida: consumo.unidad_medida,
          consumo_total: consumoParaPlato,
        })
        .select('id')
        .maybeSingle();

      if (insertError) {
        if (insertError.code === '23505') {
          omitidos.push({ codigo_toteat: origen.codigo_toteat, producto_nombre: consumo.producto_nombre });
          continue;
        }
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      if (!inserted) {
        omitidos.push({ codigo_toteat: origen.codigo_toteat, producto_nombre: consumo.producto_nombre });
        continue;
      }

      const { data: movimiento, error: movError } = await supabase
        .from('carnicos_movimientos')
        .insert({
          fecha,
          responsable_id,
          responsable_nombre,
          turno,
          observacion: `Venta Toteat ${origen.codigo_toteat} - ${origen.plato_nombre}`,
          bodega: 'COCINA',
          movimiento: 'SALIDA',
          subtipo: 'VENTAS',
          producto_id: consumo.producto_id,
          producto_nombre: consumo.producto_nombre,
          unidad_medida: consumo.unidad_medida,
          cantidad: consumoParaPlato,
          origen: 'venta_toteat',
          created_by: s.email,
        })
        .select('id')
        .single();

      if (movError) return NextResponse.json({ error: movError.message }, { status: 500 });

      await supabase.from('carnicos_ventas_registradas').update({ movimiento_id: movimiento.id }).eq('id', inserted.id);
      insertados++;
    }
  }

  return NextResponse.json({ ok: true, insertados, omitidos });
}
