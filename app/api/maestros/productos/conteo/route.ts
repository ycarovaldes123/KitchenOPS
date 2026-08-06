import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';

export async function GET() {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('productos')
    .select('codigo,nombre,unidad_medida,activo')
    .neq('activo', false)
    .order('nombre');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const productosUnicos = Array.from(
    new Map((data ?? []).map(producto => [String(producto.codigo).trim(), producto])).values(),
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Conteo');
  ws.columns = [
    { header: 'Código', key: 'codigo', width: 16 },
    { header: 'Nombre', key: 'nombre', width: 48 },
    { header: 'Unidad', key: 'unidad', width: 12 },
    { header: 'Conteo', key: 'conteo', width: 14 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getColumn('codigo').numFmt = '@';
  ws.getColumn('conteo').numFmt = '0.000';

  for (const producto of productosUnicos) {
    ws.addRow({
      codigo: String(producto.codigo).trim(),
      nombre: producto.nombre,
      unidad: producto.unidad_medida,
      conteo: null,
    });
  }

  ws.autoFilter = 'A1:D1';
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date()).replaceAll('-', '');

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Conteo_Productos_${hoy}.xlsx"`,
    },
  });
}
