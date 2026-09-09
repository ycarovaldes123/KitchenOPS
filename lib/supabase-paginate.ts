// Supabase/PostgREST limita cada select a un maximo de filas por defecto (tipicamente 1000),
// incluso sin .limit() explicito. Los endpoints de Historial (Control Carnicos) consultan rangos
// de fechas que pueden superar eso facilmente (ej. un mes completo con ventas Toteat), por lo que
// hay que paginar con .range() y acumular hasta agotar los resultados.
const PAGE_SIZE = 1000;

interface PaginateError {
  message: string;
  code?: string;
}

/**
 * PostgREST responde 416 "Requested range not satisfiable" (code PGRST103) cuando el inicio
 * del .range() cae despues de la ultima fila. Con este paginador eso ocurre exactamente cuando
 * el total es multiplo de PAGE_SIZE (1000, 2000, ...): la pagina anterior vino llena y la
 * siguiente ya no existe. No es un error real: significa que no hay mas filas.
 */
function esRangoFueraDeAlcance(error: PaginateError | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST103' || /range not satisfiable/i.test(error.message ?? '');
}

export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PaginateError | null }>,
): Promise<{ data: T[] | null; error: PaginateError | null }> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) {
      // Multiplo exacto de PAGE_SIZE: ya trajimos todo en las paginas anteriores.
      if (from > 0 && esRangoFueraDeAlcance(error)) break;
      return { data: null, error };
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
}
