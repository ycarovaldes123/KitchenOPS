import { NextRequest, NextResponse } from 'next/server';
import { requireRol } from '@/lib/auth-server';
import { createClient } from '@/utils/supabase/server';

type CriticalProduct = {
  codigo_producto: string;
  categoria: string;
  activo: boolean;
};

type Product = {
  codigo: string;
  nombre: string;
  unidad_medida: string;
};

type ControlRowDb = {
  id: string;
  fecha: string;
  codigo_producto: string;
  producto_nombre: string;
  unidad_medida: string;
  categoria: string;
  inventario_inicial: number | string | null;
  compras: number | string | null;
  producto_terminado: number | string | null;
  ventas: number | string | null;
  ajuste_produccion: number | string | null;
  mermas: number | string | null;
  colacion: number | string | null;
  inventario_final: number | string | null;
  stock_cocina: number | string | null;
  stock_mantencion: number | string | null;
  stock_congelado: number | string | null;
  observacion: string | null;
};

type ControlPayloadRow = Partial<ControlRowDb> & {
  codigo_producto?: string;
};

const NUMERIC_FIELDS = [
  'inventario_inicial',
  'compras',
  'producto_terminado',
  'ventas',
  'ajuste_produccion',
  'mermas',
  'colacion',
  'inventario_final',
  'stock_cocina',
  'stock_mantencion',
  'stock_congelado',
] as const;

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'jefatura', 'economo']);
  if (!s.ok) return s.response;

  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha');
  if (!isIsoDate(fecha)) {
    return NextResponse.json({ error: 'Debes enviar fecha en formato YYYY-MM-DD' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: criticalRows, error: criticalError } = await supabase
    .from('productos_criticos_bodega')
    .select('codigo_producto,categoria,activo')
    .eq('activo', true);

  if (criticalError) {
    return NextResponse.json({
      error: `${criticalError.message}. Ejecuta scripts/supabase_toteat_bodega.sql en Supabase.`,
    }, { status: 500 });
  }

  const critical = (criticalRows ?? []) as CriticalProduct[];
  const codes = critical.map(row => row.codigo_producto);
  if (!codes.length) {
    return NextResponse.json({ fecha, rows: [] });
  }

  const [{ data: productsData, error: productsError }, { data: savedData, error: savedError }] = await Promise.all([
    supabase
      .from('productos')
      .select('codigo,nombre,unidad_medida')
      .in('codigo', codes),
    supabase
      .from('control_bodega_cocina')
      .select('*')
      .eq('fecha', fecha),
  ]);

  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 });
  if (savedError) return NextResponse.json({ error: savedError.message }, { status: 500 });

  const products = new Map(((productsData ?? []) as Product[]).map(product => [product.codigo, product]));
  const saved = new Map(((savedData ?? []) as ControlRowDb[]).map(row => [row.codigo_producto, row]));
  const rows = critical
    .map(item => {
      const product = products.get(item.codigo_producto);
      const current = saved.get(item.codigo_producto);
      const base = {
        id: current?.id ?? null,
        fecha,
        codigo_producto: item.codigo_producto,
        producto_nombre: current?.producto_nombre ?? product?.nombre ?? item.codigo_producto,
        unidad_medida: current?.unidad_medida ?? product?.unidad_medida ?? '',
        categoria: current?.categoria ?? item.categoria,
        observacion: current?.observacion ?? '',
      };

      const numeric = Object.fromEntries(
        NUMERIC_FIELDS.map(field => [field, toNumber(current?.[field])]),
      );

      return {
        ...base,
        ...numeric,
        control: calcControl(numeric),
      };
    })
    .sort((a, b) => `${a.categoria}-${a.producto_nombre}`.localeCompare(`${b.categoria}-${b.producto_nombre}`));

  return NextResponse.json({ fecha, rows });
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'economo']);
  if (!s.ok) return s.response;

  const body = await req.json().catch(() => ({}));
  const fecha = typeof body.fecha === 'string' ? body.fecha : null;
  const rows = Array.isArray(body.rows) ? body.rows as ControlPayloadRow[] : [];

  if (!isIsoDate(fecha)) {
    return NextResponse.json({ error: 'Debes enviar fecha en formato YYYY-MM-DD' }, { status: 400 });
  }

  const validRows = rows
    .filter(row => typeof row.codigo_producto === 'string' && row.codigo_producto.trim())
    .map(row => ({
      fecha,
      codigo_producto: row.codigo_producto!.trim(),
      producto_nombre: text(row.producto_nombre),
      unidad_medida: text(row.unidad_medida),
      categoria: text(row.categoria),
      inventario_inicial: toNumber(row.inventario_inicial),
      compras: toNumber(row.compras),
      producto_terminado: toNumber(row.producto_terminado),
      ventas: toNumber(row.ventas),
      ajuste_produccion: toNumber(row.ajuste_produccion),
      mermas: toNumber(row.mermas),
      colacion: toNumber(row.colacion),
      inventario_final: toNumber(row.inventario_final),
      stock_cocina: toNumber(row.stock_cocina),
      stock_mantencion: toNumber(row.stock_mantencion),
      stock_congelado: toNumber(row.stock_congelado),
      observacion: typeof row.observacion === 'string' ? row.observacion.trim() : null,
      responsable_email: s.email,
      updated_at: new Date().toISOString(),
    }));

  if (!validRows.length) {
    return NextResponse.json({ error: 'No hay filas validas para guardar' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('control_bodega_cocina')
    .upsert(validRows, { onConflict: 'fecha,codigo_producto' });

  if (error) {
    return NextResponse.json({
      error: `${error.message}. Ejecuta scripts/supabase_toteat_bodega.sql en Supabase.`,
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: validRows.length });
}

function calcControl(row: Record<string, number>) {
  const teorico =
    row.inventario_inicial +
    row.compras +
    row.producto_terminado -
    row.ventas -
    row.ajuste_produccion -
    row.mermas -
    row.colacion;
  return row.inventario_final - teorico;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isIsoDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
