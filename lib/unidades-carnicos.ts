// Normalizacion y conversion de unidades para Control Carnicos.
// KG/GR son intercambiables (1 kg = 1000 g); UN/PQ/PR se tratan como unidades
// discretas equivalentes entre si (no hay factor de conversion real disponible
// en los Excel fuente, asi que se transfieren 1:1).

export function normalizarUnidad(value: string | null | undefined): string {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'GRS' || raw === 'G') return 'GR';
  if (raw === 'KGS') return 'KG';
  if (raw === 'UND' || raw === 'U') return 'UN';
  return raw;
}

/** Convierte `cantidad` desde `unidadOrigen` a `unidadDestino`. Devuelve null si la conversion no es posible. */
export function convertirCantidad(cantidad: number, unidadOrigen: string, unidadDestino: string): number | null {
  if (!Number.isFinite(cantidad)) return null;
  const from = normalizarUnidad(unidadOrigen);
  const to = normalizarUnidad(unidadDestino);
  if (!from || !to || from === to) return cantidad;
  if (from === 'GR' && to === 'KG') return cantidad / 1000;
  if (from === 'KG' && to === 'GR') return cantidad * 1000;
  const discretas = new Set(['UN', 'PQ', 'PR']);
  if (discretas.has(from) && discretas.has(to)) return cantidad;
  return null;
}
