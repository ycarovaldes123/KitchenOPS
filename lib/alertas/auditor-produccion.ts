// Auditor de producciones basado en el historial del mismo producto (función pura, sin acceso a la base).
//
// Para cada línea de producción responde: ¿la cantidad tiene sentido frente a cómo se ha producido
// históricamente este mismo producto (mismo código y misma modalidad)? En particular detecta errores de
// escala ×10 / ×100 / ×1.000 (ej. 12,1 GR cuando los lotes habituales son ~12.100 GR: se escribieron KG
// en un campo GR). Que "ingresado = producido" no prueba nada: se compara contra el historial.
//
// Criterios (calibrados con los datos reales de oct-2026, ~20 alertas/mes):
// - Referencia: las últimas 30 producciones comparables hasta la fecha (patrón reciente) o, si hay menos
//   de 8, todo el historial. Los valores a más de 20× de la mediana global se excluyen para que los
//   propios errores no contaminen lo "habitual".
// - Lotes recurrentes: agrupación de cantidades a ±15%; un lote cuenta si se repite y es ≥10% del historial.
// - Escala: la cantidad × o ÷ 10/100/1.000 cae a ±20% de un lote habitual (o de la mediana) y la cantidad
//   original está fuera del rango normal (menos de un tercio del P10 o más del triple del P90).
// - Sin historial suficiente (menos de 5 comparables) no se emite nada: no se inventan antecedentes.

export type SeveridadAuditoria = 'CRITICA' | 'ALTA' | 'MEDIA' | 'INFO';
export type Confianza = 'Alta' | 'Media' | 'Baja';

export interface Referencia {
  id: string;
  fecha: string;       // YYYY-MM-DD
  cantidad: number;
  costo: number | null; // costo total de la línea
}

export interface Lote { centro: number; n: number }

export interface ResultadoAuditoria {
  severidad: SeveridadAuditoria;
  tipo: 'ESCALA' | 'BAJA' | 'ALTA';
  factor: number | null;          // ×1000 = la cantidad pretendida es 1.000 veces la registrada; 0,1 = 10 veces menor
  pretendida: number | null;      // cantidad que probablemente se quiso registrar
  loteReferencia: number;         // lote habitual más cercano (o mediana)
  difPct: number;                 // diferencia % de la cantidad registrada vs el lote de referencia
  lotes: Lote[];
  mediana: number;
  p10: number;
  p90: number;
  comparables: number;
  desde: string;                  // período cubierto por la referencia
  hasta: string;
  solidez: 'limitado' | 'moderado' | 'sólido';
  confianza: Confianza;
  fundamento: string;
  cambioReciente: string | null;  // texto si el patrón reciente difiere del histórico global
  costoHabitualLote: number | null;
}

const MIN_COMPARABLES = 5;
const VENTANA_RECIENTE = 30;
const MIN_RECIENTES = 8;

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function percentil(v: number[], p: number): number {
  const s = [...v].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
}

export function lotesRecurrentes(valores: number[]): Lote[] {
  const s = [...valores].sort((a, b) => a - b);
  const grupos: { base: number; v: number[] }[] = [];
  for (const v of s) {
    const g = grupos[grupos.length - 1];
    if (g && v <= g.base * 1.15) g.v.push(v);
    else grupos.push({ base: v, v: [v] });
  }
  return grupos
    .map(g => { const c = mediana(g.v); return { centro: c >= 100 ? Math.round(c) : c, n: g.v.length }; })
    .filter(l => l.n >= 2 && l.n >= valores.length * 0.1)
    .sort((a, b) => b.n - a.n);
}

const cercano = (lotes: Lote[], x: number, fallback: number) =>
  lotes.length ? lotes.reduce((b, l) => (Math.abs(l.centro - x) < Math.abs(b.centro - x) ? l : b)).centro : fallback;

// `historial`: todas las líneas del mismo producto y modalidad (puede incluir la evaluada; se excluye por id)
export function auditarCantidad(linea: Referencia, historial: Referencia[]): ResultadoAuditoria | null {
  const q = linea.cantidad;
  if (!(q > 0)) return null;

  const todos = historial.filter(h => h.cantidad > 0);
  if (todos.length < MIN_COMPARABLES) return null;
  const medGlobal = mediana(todos.map(h => h.cantidad));
  // Las anomalías (a más de 20× de lo típico) no definen la normalidad
  const limpios = todos.filter(h => h.id !== linea.id && h.cantidad > medGlobal / 20 && h.cantidad < medGlobal * 20);

  const previos = limpios.filter(h => h.fecha <= linea.fecha).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, VENTANA_RECIENTE);
  const refs = previos.length >= MIN_RECIENTES ? previos : limpios;
  const n = refs.length;
  if (n < MIN_COMPARABLES) return null;

  const v = refs.map(r => r.cantidad);
  const med = mediana(v), p10 = percentil(v, 0.1), p90 = percentil(v, 0.9);
  const lotes = lotesRecurrentes(v);

  // ¿Multiplicar o dividir por 1.000 / 100 / 10 cae en un lote habitual?
  const fueraDeRango = q < p10 / 3 || q > p90 * 3;
  let escala: { factor: number; pretendida: number; lote: number; err: number } | null = null;
  if (fueraDeRango) {
    for (const f of [1000, 100, 10]) {
      for (const [factor, cand] of [[f, q * f], [1 / f, q / f]] as const) {
        const lote = cercano(lotes, cand, med);
        const err = Math.abs(cand - lote) / lote;
        if (err <= 0.2 && cand >= p10 * 0.7 && cand <= p90 * 1.3) { escala = { factor, pretendida: cand, lote, err }; break; }
      }
      if (escala) break;
    }
  }

  const solidez = n >= 10 ? 'sólido' : 'moderado';
  let severidad: SeveridadAuditoria | null = null;
  let tipo: ResultadoAuditoria['tipo'] = q < med ? 'BAJA' : 'ALTA';
  if (escala) {
    tipo = 'ESCALA';
    const mil = escala.factor === 1000 || escala.factor === 1 / 1000;
    severidad = mil ? (n >= 10 ? 'CRITICA' : 'ALTA') : 'ALTA';
  } else if (q < p10 / 5 || q > p90 * 5) {
    severidad = n >= 10 ? 'ALTA' : 'MEDIA';
  } else if (n >= 10 && (q < p10 / 2.5 || q > p90 * 2.5)) {
    severidad = 'INFO';
  }
  if (!severidad) return null;

  const loteReferencia = escala?.lote ?? cercano(lotes, q, med);
  const enLote = lotes.find(l => l.centro === loteReferencia);
  const confianza: Confianza = escala
    ? (n >= 10 && escala.err <= 0.05 && (enLote?.n ?? 0) >= 3 ? 'Alta' : n >= 10 ? 'Media' : 'Baja')
    : (n >= 10 ? 'Media' : 'Baja');
  const fundamento = [
    `${n} producciones comparables`,
    lotes.length ? `${lotes.length === 1 ? 'un lote recurrente' : `${lotes.length} lotes recurrentes`}` : 'sin lotes recurrentes claros',
    escala ? `la cantidad ×${escala.factor >= 1 ? fmt(escala.factor) : `1/${fmt(1 / escala.factor)}`} queda a ${fmt(escala.err * 100)}% del lote` : null,
  ].filter(Boolean).join(' · ');

  // Patrón reciente vs histórico completo (cambios legítimos de escala de fabricación)
  const medRecientes = previos.length >= MIN_RECIENTES ? mediana(previos.map(p => p.cantidad)) : null;
  const medLimpios = mediana(limpios.map(h => h.cantidad));
  const cambioReciente = medRecientes && (medRecientes / medLimpios > 1.5 || medRecientes / medLimpios < 0.67)
    ? `Las últimas ${previos.length} producciones (mediana ${fmt(medRecientes)}) difieren del historial completo (mediana ${fmt(medLimpios)}).`
    : null;

  // Costo como segunda evidencia: costo por unidad habitual × lote de referencia
  const costosU = refs.filter(r => Number(r.costo) > 0).map(r => Number(r.costo) / r.cantidad);
  const costoHabitualLote = costosU.length >= 3 ? Math.round(mediana(costosU) * loteReferencia) : null;

  const fechas = refs.map(r => r.fecha).sort();
  return {
    severidad, tipo, factor: escala?.factor ?? null, pretendida: escala?.pretendida ?? null,
    loteReferencia, difPct: (Math.abs(q - loteReferencia) / loteReferencia) * 100,
    lotes, mediana: med, p10, p90, comparables: n, desde: fechas[0], hasta: fechas[fechas.length - 1],
    solidez, confianza, fundamento, cambioReciente, costoHabitualLote,
  };
}

function fmt(n: number): string {
  return (Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: n < 10 ? 2 : 0 });
}
