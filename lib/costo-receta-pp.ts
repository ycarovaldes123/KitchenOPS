// Costo de una línea de receta PP según la UM del ingrediente vs la UM del producto.
// Compartido entre el recálculo en servidor y el editor de recetas (vista previa).

export function normalizarUM(um: string | null | undefined): string {
  const val = (um ?? '').trim().toUpperCase();
  return val === 'UND' ? 'UN' : val;
}

export function factorConversionUM(ingredientUM: string, productUM: string): number {
  const iUM = normalizarUM(ingredientUM);
  const pUM = normalizarUM(productUM);
  if (!iUM || iUM === pUM) return 1;
  if (iUM === 'GR' && pUM === 'KG') return 1 / 1000;
  if (iUM === 'CC' && pUM === 'LT') return 1 / 1000;
  if (iUM === 'KG' && pUM === 'GR') return 1000;
  if (iUM === 'LT' && pUM === 'CC') return 1000;
  return 1;
}

// Costo por unidad de rendimiento: los PP por GR/CC valen fracciones de peso ($1,77/CC);
// con decimales fijos no se confunde con miles ($1.767). Sobre $100 va sin decimales.
export function formatCostoUnitario(n: number, decimales = 2): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  return Math.abs(n) >= 100
    ? `$${Math.round(n).toLocaleString('es-CL')}`
    : `$${n.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;
}

export function formatCantidad(n: number): string {
  return (Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 3 });
}

export function costoLineaPP(cantidad: number, ingredientUM: string, productUM: string, costoPromedio: number): number {
  return (Number(cantidad) || 0) * factorConversionUM(ingredientUM, productUM) * (Number(costoPromedio) || 0);
}
