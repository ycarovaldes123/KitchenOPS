// Regla de resolucion del inventario inicial diario de Control Carnicos.
//
// Prioridad:
//   1. Si para la fecha consultada existe un inventario INICIAL cargado manualmente,
//      se usa ese valor y NO se arrastra nada del dia anterior (corta el ciclo previo).
//   2. Si no existe INICIAL manual para esa fecha, se puede arrastrar el inventario
//      FINAL del ultimo dia anterior, pero SOLO si ese FINAL pertenece al ciclo vigente:
//      su fecha debe ser posterior o igual a la del ultimo INICIAL manual (<= fecha).
//      Si el ultimo INICIAL manual es mas reciente que el ultimo FINAL, el ciclo se
//      reinicio (ej. inicio de mes con carga manual) y no se arrastra el cierre del
//      periodo anterior.
//
// Esta logica es pura (sin dependencias) para poder testearla de forma aislada; el
// calculo del cuadre en lib/carnicos-resumen.server.ts la consume por producto,
// sumando las cantidades de todas las bodegas de una misma fecha.

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
 * @param rows  Conteos INICIAL/FINAL del producto, de cualquier bodega. Solo se
 *              consideran los que tienen fecha estrictamente anterior a `fecha`.
 * @param fecha Fecha consultada (YYYY-MM-DD).
 * @returns La cantidad a arrastrar, o `null` si no corresponde arrastrar
 *          (ciclo reiniciado por un INICIAL manual posterior al ultimo FINAL, o
 *          sin FINAL previo registrado).
 */
export function resolverArrastreInicial(rows: InvSnapshotRow[], fecha: string): number | null {
  const finalPorFecha = new Map<string, number>();
  const fechasInicial: string[] = [];

  for (const row of rows) {
    if (!(row.fecha < fecha)) continue; // solo dias anteriores
    if (row.tipo === 'FINAL') {
      finalPorFecha.set(row.fecha, (finalPorFecha.get(row.fecha) ?? 0) + Number(row.cantidad));
    } else if (row.tipo === 'INICIAL') {
      fechasInicial.push(row.fecha);
    }
  }

  if (finalPorFecha.size === 0) return null;

  const ultimoFinal = [...finalPorFecha.keys()].sort().at(-1)!;
  const ultimoInicial = fechasInicial.sort().at(-1);

  // Un INICIAL manual posterior al ultimo FINAL marca el arranque de un nuevo ciclo
  // (tipicamente el inventario inicial mensual): no se arrastra el cierre del ciclo anterior.
  if (ultimoInicial !== undefined && ultimoInicial > ultimoFinal) return null;

  return finalPorFecha.get(ultimoFinal)!;
}
