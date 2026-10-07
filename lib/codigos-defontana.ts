import type { createClient } from '@/utils/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Mapa codigo Softland (productos.codigo) → codigo Defontana, para exportar el consumo
 * con ambos codigos. Los productos aun no creados en Defontana no aparecen en el mapa.
 */
export async function mapaCodigosDefontana(supabase: Supabase, codigos: (string | null | undefined)[]) {
  const unicos = Array.from(new Set(codigos.map(c => String(c ?? '').trim()).filter(Boolean)));
  const mapa = new Map<string, string>();
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabase
      .from('productos')
      .select('codigo,codigo_defontana')
      .in('codigo', unicos.slice(i, i + 200))
      .not('codigo_defontana', 'is', null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.codigo_defontana) mapa.set(row.codigo, row.codigo_defontana);
    }
  }
  return mapa;
}
