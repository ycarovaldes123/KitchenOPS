// Supabase/PostgREST limita cada select a un maximo de filas por defecto (tipicamente 1000),
// incluso sin .limit() explicito. Los endpoints de Historial (Control Carnicos) consultan rangos
// de fechas que pueden superar eso facilmente (ej. un mes completo con ventas Toteat), por lo que
// hay que paginar con .range() y acumular hasta agotar los resultados.
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
}
