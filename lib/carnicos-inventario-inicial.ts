// Regla de resolucion del inventario inicial diario de Control Carnicos.
//
// Fronteras, en orden:
//   1. INICIAL manual: si para la fecha consultada existe un inventario INICIAL cargado
//      manualmente, se usa ese valor y NO se arrastra nada (lo resuelve el llamador en
//      lib/carnicos-resumen.server.ts antes de pedir el arrastre).
//   2. Mes calendario: el arrastre (carry-forward) SOLO puede tomar un inventario FINAL
//      del MISMO mes y año que la fecha consultada. Un FINAL de un mes anterior nunca es
//      candidato -> al cambiar de mes el inicial arranca en 0 salvo que haya INICIAL manual.
//   3. Dentro del mes: se arrastra el FINAL del ultimo dia anterior registrado en ese mes.
//   4. Si no hay ningun FINAL valido dentro del mes -> null (el llamador lo toma como 0).
//
// Esta logica es pura (sin dependencias) para poder testearla de forma aislada; el
// calculo del cuadre la consume por producto, sumando las cantidades de todas las
// bodegas de una misma fecha.

export type TipoInventarioSnapshot = 'INICIAL' | 'FINAL';

export interface InvSnapshotRow {
  fecha: string; // YYYY-MM-DD
  tipo: TipoInventarioSnapshot;
  cantidad: number;
}

/**
 * Decide que inventario FINAL arrastrar como inventario inicial de `fecha` para un
 * producto que NO tiene inventario inicial manual en `fecha`.
 *
 * @param rows  Conteos del producto, de cualquier bodega. Solo se consideran los FINAL
 *              con fecha estrictamente anterior a `fecha` Y dentro del mismo mes/año.
 * @param fecha Fecha consultada (YYYY-MM-DD).
 * @returns La cantidad a arrastrar, o `null` si no hay ningun FINAL del mismo mes/año
 *          anterior a `fecha` (incluye el caso de cambio de mes: el cierre del mes
 *          anterior nunca se arrastra).
 */
export function resolverArrastreInicial(rows: InvSnapshotRow[], fecha: string): number | null {
  // Prefijo "YYYY-MM-" del mes consultado. La comparacion de strings ISO alcanza para
  // acotar al mismo mes y año sin construir Date (evita corrimientos por zona horaria).
  const prefijoMes = fecha.slice(0, 8); // "2026-09-"

  const finalPorFecha = new Map<string, number>();
  for (const row of rows) {
    if (row.tipo !== 'FINAL') continue;
    if (!(row.fecha < fecha)) continue;            // solo dias anteriores
    if (!row.fecha.startsWith(prefijoMes)) continue; // solo mismo mes/año -> nunca entre meses
    finalPorFecha.set(row.fecha, (finalPorFecha.get(row.fecha) ?? 0) + Number(row.cantidad));
  }

  if (finalPorFecha.size === 0) return null;

  const ultimoFinal = [...finalPorFecha.keys()].sort().at(-1)!;
  return finalPorFecha.get(ultimoFinal)!;
}
