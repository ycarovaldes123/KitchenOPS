import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { areaRecetaPP } from '@/components/maestros/types';

// GET /api/maestros/recetas-pp/exportar?area=COCINA|SALON|PASTELERIA (sin area: todas)
// Excel con las recetas PP activas en el MISMO formato que lee /api/maestros/importar-recetas-pp
// (hoja PRODUCCION, un bloque por receta), para poder re-importarlo tal cual.
//   Fila de receta:  B código 0501… · C nombre · D "U/M" · E "CANTIDAD" · J "RENDIMIENTO <U>"
//   Ingredientes:    B código · C nombre · D U/M · E cantidad
//   1.er ingrediente: H costo total neto · J rendimiento · K costo por unidad de rendimiento

type Fila = (string | number | null)[];

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const areaParam = req.nextUrl.searchParams.get('area');
  const area = areaParam ? areaRecetaPP(areaParam) : null;

  const supabase = await createClient();
  const recetas: Record<string, unknown>[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from('pp_recetas')
      .select('codigo_receta,codigo_pp,area,nombre,rendimiento,unidad_rendimiento,costo_unitario_calculado,costo_total_calculado,ingredientes:pp_receta_ingredientes(orden,codigo_ingrediente,nombre_ingrediente,cantidad,unidad_medida)')
      .eq('activo', true).order('codigo_receta').order('id').range(desde, desde + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    recetas.push(...(data ?? []).filter(r => !area || areaRecetaPP((r as { area?: unknown }).area) === area));
    if (!data || data.length < 1000) break;
  }

  const rows: Fila[] = [];
  for (const r of recetas) {
    const ings = ((r.ingredientes ?? []) as { orden: number; codigo_ingrediente: string | null; nombre_ingrediente: string; cantidad: number; unidad_medida: string }[])
      .slice().sort((a, b) => a.orden - b.orden);
    if (!ings.length) continue;

    // El importador numera las repetidas (-B, -C) por su cuenta: se escribe el código base. Sin 0501 va vacío (TABLA-n).
    const codigo = String(r.codigo_receta ?? '');
    const codigoBase = codigo.startsWith('0501') ? codigo.split('-')[0] : null;

    rows.push([null, codigoBase, String(r.nombre ?? ''), 'U/M', 'CANTIDAD', null, null, null, null, `RENDIMIENTO ${String(r.unidad_rendimiento || 'GR').toUpperCase()}`]);
    ings.forEach((ing, i) => {
      // El importador ignora filas sin código en la columna B: "S/C" marca el ingrediente sin código.
      const fila: Fila = [null, String(ing.codigo_ingrediente ?? '').trim() || 'S/C', ing.nombre_ingrediente, ing.unidad_medida, Number(ing.cantidad) || 0];
      if (i === 0) {
        fila[7] = Number(r.costo_total_calculado) || null;
        fila[9] = Number(r.rendimiento) || null;
        fila[10] = Number(r.costo_unitario_calculado) || null;
      }
      rows.push(fila);
    });
    rows.push([]);
  }

  // La columna A queda vacía a propósito, como en el archivo original (el importador ancla la lectura en A1).
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 3 }, { wch: 12 }, { wch: 46 }, { wch: 8 }, { wch: 12 }, { wch: 3 }, { wch: 3 }, { wch: 14 }, { wch: 3 }, { wch: 18 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PRODUCCION');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const filename = `Recetas_PP${area ? `_${area}` : ''}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
