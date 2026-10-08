// Normaliza el nombre de un producto (maestro productos):
//  - sin puntos ni espacios sobrantes al final
//  - prefijo de producto en proceso uniforme: "P.P.", "P.P", "PP" → "PP. "
//  - unidad de medida al final y entre paréntesis, abreviada: (GR) (KG) (LT) (UN) (CC) (PR) (PQ)
//    "ACEITE DE COCINA (LTS)." → "ACEITE DE COCINA (LT)"   ·   "ALBAHACA SECA GRS" → "ALBAHACA SECA (GR)"
// Se aplica al importar desde Softland y al crear/editar, para que los nombres no vuelvan al formato antiguo.

const UNIDAD: Record<string, string> = {
  GRS: 'GR', GR: 'GR', KGS: 'KG', KG: 'KG', LTS: 'LT', LT: 'LT',
  UNIDAD: 'UN', UNID: 'UN', UND: 'UN', UN: 'UN',
  CC: 'CC', 'C.C': 'CC', PR: 'PR', PQTE: 'PQ', PQ: 'PQ',
};
// Unidades que también se usan como tamaño ("750 CC", "30 LT"): si van tras un número no se tocan.
const ES_TAMANO = /^(GRS?|KGS?|LTS?|CC|C\.C)$/i;

export function normalizarNombreProducto(nombre: string): string {
  let n = nombre.trim().toUpperCase().replace(/[\s.]+$/, '').replace(/^P\s*\.?\s*P(?:\s*\.\s*|\s+)/, 'PP. ');

  // Unidad ya entre paréntesis al final: "(LTS)", "( UN)", "(UNIDAD).-" → "(LT)", "(UN)"
  const par = n.match(/^(.*?)\s*\(\s*(UNIDAD|UNID|UND|UN|GRS|GR|KGS|KG|LTS|LT|CC|C\.C|PQTE|PQ|PR)\s*\)[\s.\-]*$/);
  if (par) return `${par[1].trim()} (${UNIDAD[par[2]]})`;

  // Unidad suelta al final: "ALBAHACA SECA GRS" → "ALBAHACA SECA (GR)"
  const suelta = n.match(/^(.*?)\s+(GRS|GR|KGS|KG|LTS|LT|UNIDAD|UNID|UND|UN|C\.C|CC|PR|PQTE|PQ)[\s.:\-]*$/);
  if (suelta) {
    const antes = suelta[1].trim();
    const abiertos = (antes.match(/\(/g) ?? []).length;
    const cerrados = (antes.match(/\)/g) ?? []).length;
    const dudoso =
      (/\d$/.test(antes) && ES_TAMANO.test(suelta[2])) ||  // "750 CC" es tamaño, no unidad
      abiertos !== cerrados ||
      antes.includes('=') ||
      /\((GR|KG|LT|UN|CC|PR|PQ)\)/.test(antes);
    if (!dudoso) n = `${antes} (${UNIDAD[suelta[2]]})`;
  }
  return n;
}
