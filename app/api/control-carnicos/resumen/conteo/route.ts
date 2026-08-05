import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { CATEGORIA_CARNICO_LABEL, formatFechaCompacta, formatFechaGuion, hoyChile, ordenCategoriaCarnico, sumarDiasISO } from '@/lib/config-carnicos';

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
};

// GET /api/control-carnicos/resumen/conteo?fecha=YYYY-MM-DD
// Planilla para tomar inventario fisico el dia `fecha`: todos los productos ordenados por
// categoria y abecedario. INV FINAL es el conteo FINAL registrado exactamente el dia anterior
// a `fecha` (sin arrastrar mas atras) -- si no existe, queda en 0. Camara Congelados/Camara
// Mantencion/Cocina en blanco para llenar a mano por bodega, con Total = suma de las 3 via
// formula; pensada para imprimir (bordes de tabla).
export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'bodega']);
  if (!s.ok) return s.response;

  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha') ?? hoyChile();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha invalida' }, { status: 400 });
  }
  const fechaAnterior = sumarDiasISO(fecha, -1);

  const supabase = await createClient();
  const [productosRes, invFinalRes] = await Promise.all([
    supabase.from('carnicos_productos').select('id,nombre,codigo,tipo,unidad_medida').eq('activo', true).order('nombre'),
    supabase.from('carnicos_inventarios').select('producto_id,cantidad').eq('tipo', 'FINAL').eq('fecha', fechaAnterior),
  ]);

  if (productosRes.error) {
    return NextResponse.json({ error: `${productosRes.error.message}. Ejecuta scripts/supabase_control_carnicos.sql y el importador de Excel.` }, { status: 500 });
  }
  if (invFinalRes.error) return NextResponse.json({ error: invFinalRes.error.message }, { status: 500 });

  const invFinalPorProducto = new Map<string, number>();
  for (const row of invFinalRes.data ?? []) {
    invFinalPorProducto.set(row.producto_id, (invFinalPorProducto.get(row.producto_id) ?? 0) + Number(row.cantidad));
  }

  const productosOrdenados = [...(productosRes.data ?? [])].sort((a, b) => {
    const catDiff = ordenCategoriaCarnico(a.tipo) - ordenCategoriaCarnico(b.tipo);
    if (catDiff !== 0) return catDiff;
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('CONTEO', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });

  ws.columns = [
    { header: 'CATEGORIA', key: 'categoria', width: 18 },
    { header: 'CODIGO', key: 'codigo', width: 12 },
    { header: 'PRODUCTO', key: 'producto', width: 42 },
    { header: `INV FINAL (${formatFechaGuion(fechaAnterior)})`, key: 'inv_final', width: 24 },
    { header: 'CAMARA CONGELADOS', key: 'camara_congelados', width: 20 },
    { header: 'CAMARA MANTENCION', key: 'camara_mantencion', width: 20 },
    { header: 'COCINA', key: 'cocina', width: 12 },
    { header: 'TOTAL', key: 'total', width: 12 },
  ];

  for (const p of productosOrdenados) {
    const row = ws.addRow({
      categoria: CATEGORIA_CARNICO_LABEL[p.tipo] ?? p.tipo,
      codigo: p.codigo,
      producto: p.nombre,
      inv_final: invFinalPorProducto.get(p.id) ?? 0,
      camara_congelados: null,
      camara_mantencion: null,
      cocina: null,
    });
    row.getCell('total').value = { formula: `SUM(E${row.number}:G${row.number})` };
  }

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.eachCell({ includeEmpty: true }, cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  });

  ws.eachRow(row => {
    row.eachCell({ includeEmpty: true }, cell => { cell.border = THIN_BORDER; });
  });

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Conteo_Carnes_${formatFechaCompacta(fecha)}.xlsx"`,
    },
  });
}
