// carta_ingredientes guarda solo la receta vigente. Cuando un ingrediente se reemplaza a
// partir de una fecha, las ventas anteriores a `desde` deben seguir descontando el
// ingrediente `anterior` (los consumos se recalculan en vivo desde Toteat para cualquier rango).

interface IngredienteReceta {
  codigo_producto: string | null;
  nombre: string | null;
  cantidad: number | string | null;
  unidad_medida: string | null;
}

interface CambioReceta {
  codigo_toteat: string;
  desde: string; // YYYY-MM-DD, primer dia con la receta actual
  codigo_actual: string;
  anterior: { codigo_producto: string; nombre: string; cantidad: number; unidad_medida: string };
}

const CAMBIOS_RECETA_CARTA: CambioReceta[] = [
  // 2026-10-08: SCHNITZEL DE VACUNO descuenta el PP en vez de la escalopa, solo desde octubre.
  {
    codigo_toteat: 'K15075',
    desde: '2026-10-01',
    codigo_actual: '0502302',
    anterior: { codigo_producto: '0301022', nombre: 'ESCALOPA DE VACUNO (UN)', cantidad: 1, unidad_medida: 'UN' },
  },
  // 2026-11-10: SCHNITZEL DE POLLO y PORCION SCHNITZEL AVE descuentan el PP en vez del filete, desde septiembre.
  {
    codigo_toteat: 'K15076',
    desde: '2026-09-01',
    codigo_actual: '0502303',
    anterior: { codigo_producto: '0302001', nombre: 'FILETE DE PECHUGA (KG)', cantidad: 0.12, unidad_medida: 'KG' },
  },
  {
    codigo_toteat: 'K15093',
    desde: '2026-09-01',
    codigo_actual: '0502303',
    anterior: { codigo_producto: '0302001', nombre: 'FILETE DE PECHUGA (KG)', cantidad: 0.12, unidad_medida: 'KG' },
  },
];

function cambiosAnteriores(codigoToteat: string, fecha: string) {
  return CAMBIOS_RECETA_CARTA.filter(c => c.codigo_toteat === codigoToteat && fecha < c.desde);
}

/** Identifica la version de receta que aplica a una venta ('' = receta actual). */
export function versionReceta(codigoToteat: string, fecha: string) {
  return cambiosAnteriores(codigoToteat, fecha).map(c => c.desde).join(',');
}

/** Ingredientes de la receta tal como estaba vigente en `fecha`. */
export function ingredientesVigentes<T extends IngredienteReceta>(codigoToteat: string, fecha: string, ingredientes: T[]): T[] {
  const cambios = cambiosAnteriores(codigoToteat, fecha);
  if (!cambios.length) return ingredientes;
  return ingredientes.map(ing => {
    const cambio = cambios.find(c => c.codigo_actual === ing.codigo_producto);
    return cambio ? { ...ing, ...cambio.anterior } : ing;
  });
}
