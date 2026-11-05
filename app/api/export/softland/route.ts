import { NextRequest, NextResponse } from 'next/server';
import { requireRol } from '@/lib/auth-server';
import { createClient } from '@/utils/supabase/server';
import {
  construirExcelSoftland, construirGEProduccion, construirGSConsumo, construirGSProduccion, descripcionGuia,
  nombreArchivoSoftland, rangoMes,
  type ArchivoSoftland, type FuenteConsumo, type LineaConsumo, type LineaProduccion,
  type ProductoMaestro, type RecetaPP, type ResultadoSoftland,
} from '@/lib/softland-export';

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ARCHIVOS: ArchivoSoftland[] = ['ge_produccion', 'gs_produccion', 'gs_consumo'];
const FUENTES: FuenteConsumo[] = ['merma', 'colacion', 'frutas'];

/** PostgREST corta en 1000 filas: pagina hasta traer todo. */
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

async function maestroProductos(supabase: Supabase) {
  const rows = await todas<ProductoMaestro>((a, b) => supabase.from('productos').select('codigo,nombre,unidad_medida').order('codigo').range(a, b));
  return new Map(rows.map(p => [String(p.codigo).trim(), p]));
}

async function lineasProduccion(supabase: Supabase, desde: string, hasta: string): Promise<LineaProduccion[]> {
  const rows = await todas<{ detalle_produccion: LineaProduccion[] }>((a, b) => supabase
    .from('produccion').select('id,detalle_produccion(codigo_producto,nombre_pp,total_producido)')
    .gte('fecha', desde).lte('fecha', hasta).order('id').range(a, b));
  return rows.flatMap(r => r.detalle_produccion ?? []);
}

async function recetasPP(supabase: Supabase) {
  type Row = RecetaPP & { pp_receta_ingredientes: RecetaPP['ingredientes'] };
  const rows = await todas<Row>((a, b) => supabase
    .from('pp_recetas')
    .select('codigo_pp,nombre,rendimiento,unidad_rendimiento,pp_receta_ingredientes(codigo_ingrediente,nombre_ingrediente,cantidad,unidad_medida)')
    .eq('activo', true).not('codigo_pp', 'is', null).order('codigo_pp').range(a, b));
  const map = new Map<string, RecetaPP>();
  for (const r of rows) {
    const codigo = String(r.codigo_pp).trim();
    if (!map.has(codigo)) map.set(codigo, { ...r, rendimiento: Number(r.rendimiento), ingredientes: r.pp_receta_ingredientes ?? [] });
  }
  return map;
}

async function lineasMerma(supabase: Supabase, desde: string, hasta: string): Promise<LineaConsumo[]> {
  type Det = { codigo_producto: string | null; nombre_producto: string; cantidad: number; unidad_medida: string | null };
  const mermas = await todas<{ id: string; detalle_mermas: Det[] }>((a, b) => supabase
    .from('mermas').select('id,detalle_mermas(codigo_producto,nombre_producto,cantidad,unidad_medida)')
    .gte('fecha', desde).lte('fecha', hasta).order('id').range(a, b));
  // "PLATO PREPARADO: X" es solo el resumen del plato: lo que se descuenta son sus insumos (abajo).
  const lineas: LineaConsumo[] = mermas.flatMap(m => (m.detalle_mermas ?? [])
    .filter(d => !/^PLATO PREPARADO\s*:/i.test(String(d.nombre_producto ?? '').trim())).map(d => ({
    codigo_producto: d.codigo_producto, nombre: d.nombre_producto, cantidad: Number(d.cantidad), unidad_medida: d.unidad_medida,
  })));

  // Mermas de platos: se descuentan los insumos guardados de cada plato dado de baja.
  const ids = mermas.map(m => m.id);
  const platoIds: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const parte = ids.slice(i, i + 200);
    const platos = await todas<{ id: string }>((a, b) => supabase.from('detalle_mermas_platos').select('id').in('merma_id', parte).order('id').range(a, b));
    platoIds.push(...platos.map(p => p.id));
  }
  for (let i = 0; i < platoIds.length; i += 200) {
    const parte = platoIds.slice(i, i + 200);
    type Ins = { codigo_producto: string | null; nombre: string; cantidad_total: number; unidad_medida: string | null };
    const insumos = await todas<Ins>((a, b) => supabase.from('detalle_mermas_platos_insumos')
      .select('id,codigo_producto,nombre,cantidad_total,unidad_medida').in('detalle_merma_plato_id', parte).order('id').range(a, b));
    lineas.push(...insumos.map(x => ({ codigo_producto: x.codigo_producto, nombre: x.nombre, cantidad: Number(x.cantidad_total), unidad_medida: x.unidad_medida })));
  }
  return lineas;
}

async function lineasColacion(supabase: Supabase, desde: string, hasta: string): Promise<LineaConsumo[]> {
  type Det = { codigo_producto: string | null; nombre_producto: string; cantidad: number; unidad_medida: string | null };
  const rows = await todas<{ detalle_colacion: Det[] }>((a, b) => supabase
    .from('colacion').select('id,detalle_colacion(codigo_producto,nombre_producto,cantidad,unidad_medida)')
    .gte('fecha', desde).lte('fecha', hasta).order('id').range(a, b));
  return rows.flatMap(r => (r.detalle_colacion ?? []).map(d => ({
    codigo_producto: d.codigo_producto, nombre: d.nombre_producto, cantidad: Number(d.cantidad), unidad_medida: d.unidad_medida,
  })));
}

async function lineasFrutas(supabase: Supabase, desde: string, hasta: string): Promise<LineaConsumo[]> {
  type Det = { codigo_producto: string | null; nombre_producto: string; cantidad: number; unidad_medida: string | null };
  const rows = await todas<{ detalle_frutas: Det[] }>((a, b) => supabase
    .from('frutas').select('id,detalle_frutas(codigo_producto,nombre_producto,cantidad,unidad_medida)')
    .gte('fecha', desde).lte('fecha', hasta).order('id').range(a, b));
  return rows.flatMap(r => (r.detalle_frutas ?? []).map(d => ({
    codigo_producto: d.codigo_producto, nombre: d.nombre_producto, cantidad: Number(d.cantidad), unidad_medida: d.unidad_medida,
  })));
}

function folioValido(v: string | null) {
  const n = Number(String(v ?? '').trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/export/softland?archivo=ge_produccion|gs_produccion|gs_consumo&mes=YYYY-MM
//   &fuente=merma|colacion|frutas (gs_consumo) &folio=N (opcional) &formato=json|xlsx
export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const p = new URL(req.url).searchParams;
  const archivo = p.get('archivo') as ArchivoSoftland;
  const mes = p.get('mes') ?? '';
  if (!ARCHIVOS.includes(archivo)) return NextResponse.json({ error: 'Archivo no válido' }, { status: 400 });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return NextResponse.json({ error: 'Mes no válido (AAAA-MM)' }, { status: 400 });
  const fuente = (p.get('fuente') ?? 'merma') as FuenteConsumo;
  if (archivo === 'gs_consumo' && !FUENTES.includes(fuente)) return NextResponse.json({ error: 'Fuente no válida' }, { status: 400 });
  const folio = folioValido(p.get('folio'));
  if (p.get('folio') && !folio) return NextResponse.json({ error: 'El folio debe ser un número entero' }, { status: 400 });

  const { desde, hasta } = rangoMes(mes);
  const supabase = await createClient();

  try {
    const productos = await maestroProductos(supabase);
    let resultado: ResultadoSoftland;

    if (archivo === 'ge_produccion') {
      resultado = construirGEProduccion(await lineasProduccion(supabase, desde, hasta), productos, mes);
    } else if (archivo === 'gs_produccion') {
      const [lineas, recetas] = await Promise.all([lineasProduccion(supabase, desde, hasta), recetasPP(supabase)]);
      resultado = construirGSProduccion(lineas, productos, recetas);
    } else {
      const lineas = fuente === 'merma' ? await lineasMerma(supabase, desde, hasta)
        : fuente === 'frutas' ? await lineasFrutas(supabase, desde, hasta)
        : await lineasColacion(supabase, desde, hasta);
      resultado = construirGSConsumo(lineas, productos, descripcionGuia(fuente, mes));
    }

    if (p.get('formato') !== 'xlsx') {
      const guias = [...new Set(resultado.filas.map(f => f.guia))];
      return NextResponse.json({
        archivo, mes, fechaTexto: rangoMes(mes).fechaTexto,
        filas: resultado.filas, guias, avisos: resultado.avisos,
      });
    }

    if (!resultado.filas.length) return NextResponse.json({ error: 'No hay datos para generar la planilla en ese mes' }, { status: 404 });
    // Folio inicial: GS_PRODUCCION suma 1 por PP y GS_CONSUMO 1 cada 40 líneas.
    const buffer = await construirExcelSoftland(archivo, resultado.filas, mes, folio);
    const filename = nombreArchivoSoftland(archivo, mes, archivo === 'gs_consumo' ? fuente : undefined);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al generar la planilla' }, { status: 500 });
  }
}
