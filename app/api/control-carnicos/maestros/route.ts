import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';

export async function GET() {
  const s = await requireRol(['admin']); // TODO: agregar 'bodega' cuando se habilite el rol
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const [productosRes, responsablesRes] = await Promise.all([
    supabase.from('carnicos_productos').select('id,tipo,codigo,nombre,unidad_medida,es_pp,activo').eq('activo', true).order('nombre'),
    supabase.from('responsables').select('id,nombre,email,rol,activo,color_hex,iniciales').eq('activo', true).order('nombre'),
  ]);

  if (productosRes.error) {
    return NextResponse.json({ error: `${productosRes.error.message}. Ejecuta scripts/supabase_control_carnicos.sql y scripts/import-carnicos-excel.mjs.` }, { status: 500 });
  }
  if (responsablesRes.error) return NextResponse.json({ error: responsablesRes.error.message }, { status: 500 });

  return NextResponse.json({
    productos: productosRes.data ?? [],
    responsables: responsablesRes.data ?? [],
  });
}
