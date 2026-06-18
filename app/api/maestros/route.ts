import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getSessionRol } from '@/lib/auth-server';

function normalizeText(text: unknown) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// GET /api/maestros — datos de dropdowns para formularios
export async function GET() {
  const s = await getSessionRol();
  if (!s.ok) return s.response;

  const supabase = await createClient();

  const [
    { data: productos },
    { data: pps },
    { data: responsables },
    { data: verduras },
    { data: carta },
  ] = await Promise.all([
    supabase.from('productos').select('codigo,nombre,unidad_medida,costo_promedio').neq('activo', false).order('nombre'),
    supabase.from('pp').select('id,nombre,tipo_pp,gramos_por_pp,codigo_producto,activo').neq('activo', false).order('nombre'),
    supabase.from('responsables').select('id,nombre,rol,color_hex,iniciales').eq('activo', true).order('nombre'),
    supabase.from('verduras').select('id,nombre,codigo_producto').neq('activo', false).order('nombre'),
    supabase
      .from('carta')
      .select(`
        id,nombre,categoria,tipo_carta,precio_carta,activo,
        carta_ingredientes(id,codigo_producto,pp_id,nombre,cantidad,unidad_medida,precio_unitario,costo_total)
      `)
      .eq('activo', true)
      .order('nombre'),
  ]);

  // Build producto map for unidad_base derivation
  type ProdRow = { codigo: string; nombre: string; unidad_medida: string; costo_promedio: number };
  const prodMap = new Map((productos as ProdRow[] ?? []).map(p => [p.codigo, p]));

  // Derive unidad_base per PP and strip internal product code
  type PPRaw = { id: string; nombre: string; tipo_pp: string; gramos_por_pp: number | null; codigo_producto: string | null; activo: boolean };
  const ppsConBase = (pps as PPRaw[] ?? []).map(pp => {
    const prod = pp.codigo_producto ? prodMap.get(pp.codigo_producto) : undefined;
    const unidad_base =
      pp.tipo_pp === 'PORCION' ? 'GR' :
      pp.tipo_pp === 'CC'      ? 'CC' :
      pp.tipo_pp === 'UND'     ? 'UN' :
      /* DIRECTO */              (prod?.unidad_medida ?? '');
    return { ...pp, unidad_base };
  });

  // Strip costo_promedio for cocina role
  const isCocina = s.rol === 'cocina';
  const productosOut = isCocina
    ? (productos as ProdRow[] ?? []).map((p) => ({
        codigo: p.codigo,
        nombre: p.nombre,
        unidad_medida: p.unidad_medida,
      }))
    : (productos ?? []);

  type VerduraRow = { id: string; nombre: string; codigo_producto: string | null };
  const verdurasOut = Array.from(
    ((verduras as VerduraRow[] ?? []).reduce((map, verdura) => {
      const key = normalizeText(verdura.nombre);
      const current = map.get(key);
      if (!current || (!current.codigo_producto && verdura.codigo_producto)) {
        map.set(key, verdura);
      }
      return map;
    }, new Map<string, VerduraRow>())).values(),
  );

  type CartaRow = {
    id: string;
    nombre: string;
    categoria: string | null;
    tipo_carta: string | null;
    precio_carta: number | null;
    carta_ingredientes?: { costo_total: number | null }[] | null;
  };
  const cartaOut = (carta as CartaRow[] ?? []).map(plato => {
    const costo_neto = (plato.carta_ingredientes ?? []).reduce((sum, ing) => sum + (ing.costo_total ?? 0), 0);
    if (isCocina) {
      return {
        id: plato.id,
        nombre: plato.nombre,
        categoria: plato.categoria,
        tipo_carta: plato.tipo_carta ?? 'ANTIGUA',
        ingredientes_count: plato.carta_ingredientes?.length ?? 0,
      };
    }
    return {
      ...plato,
      tipo_carta: plato.tipo_carta ?? 'ANTIGUA',
      ingredientes_count: plato.carta_ingredientes?.length ?? 0,
      costo_neto,
    };
  });

  return NextResponse.json({
    productos: productosOut,
    pps: ppsConBase,
    responsables: responsables ?? [],
    verduras: verdurasOut,
    carta: cartaOut,
  });
}
