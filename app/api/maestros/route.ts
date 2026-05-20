import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getSessionRol } from '@/lib/auth-server';

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
  ] = await Promise.all([
    supabase.from('productos').select('codigo,nombre,unidad_medida,costo_promedio').neq('activo', false).order('nombre'),
    supabase.from('pp').select('id,nombre,tipo_pp,gramos_por_pp,codigo_producto,activo').neq('activo', false).order('nombre'),
    supabase.from('responsables').select('id,nombre,rol,color_hex,iniciales').eq('activo', true).order('nombre'),
    supabase.from('verduras').select('id,nombre').neq('activo', false).order('nombre'),
  ]);

  return NextResponse.json({ productos: productos ?? [], pps: pps ?? [], responsables: responsables ?? [], verduras: verduras ?? [] });
}
