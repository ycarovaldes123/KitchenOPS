// Planillas de carga a Softland (Exportar → Planillas Softland).
// Replican los formatos GE_PRODUCCION_PP_, GS_PRODUCCION_ y GS_Consumo_ que usa contabilidad:
// mismas columnas, encabezados y tipos de celda (texto '@' para códigos con cero inicial,
// número para FOLIO / N° ORD / CANTIDAD). FOLIO queda vacío salvo que se ingrese al descargar,
// y N° ORD DE PRODUCCION siempre es = FOLIO (fórmula si el folio se escribe después en Excel).
import ExcelJS from 'exceljs';
import { normalizarUM } from './costo-receta-pp';
import { convertirUnidad } from './defontana-consumo';

export type ArchivoSoftland = 'ge_produccion' | 'gs_produccion' | 'gs_consumo';
export type FuenteConsumo = 'merma' | 'colacion' | 'frutas';
export type GuiaConsumo = FuenteConsumo;

export const BODEGA = '11';
export const CC = '08';
export const CONCEPTO: Record<ArchivoSoftland, string> = { ge_produccion: '10', gs_produccion: '09', gs_consumo: '07' };
/** GS_PRODUCCION usa la cuenta de existencias (como la plantilla); GS_CONSUMO la de costo. */
export const CTA_CONTABLE: Record<'gs_produccion' | 'gs_consumo', string> = { gs_produccion: '1-1-06-05', gs_consumo: '5-1-01-01' };

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

export function rangoMes(mes: string) {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate(); // considera bisiestos
  const mm = String(m).padStart(2, '0');
  return {
    desde: `${y}-${mm}-01`,
    hasta: `${y}-${mm}-${String(ultimo).padStart(2, '0')}`,
    /** FECHA de la planilla: último día del mes, texto DD/MM/AAAA. */
    fechaTexto: `${String(ultimo).padStart(2, '0')}/${mm}/${y}`,
    etiqueta: `${MESES[m - 1]} ${y}`,
  };
}

export function descripcionGuia(tipo: 'produccion' | GuiaConsumo, mes: string) {
  const { etiqueta } = rangoMes(mes);
  if (tipo === 'produccion') return `PRODUCCION ${etiqueta}`;
  if (tipo === 'colacion') return `COLACION PERSONAL ${etiqueta}`;
  if (tipo === 'frutas') return `CONSUMO FRUTAS ${etiqueta}`;
  return `MERMA ${etiqueta}`;
}

// ── Datos de entrada ─────────────────────────────────────────────────────────

export type ProductoMaestro = { codigo: string; nombre: string; unidad_medida: string | null };

export interface RecetaPP {
  codigo_pp: string;
  nombre: string;
  rendimiento: number;
  unidad_rendimiento: string;
  ingredientes: { codigo_ingrediente: string | null; nombre_ingrediente: string; cantidad: number; unidad_medida: string }[];
}

export interface LineaProduccion { codigo_producto: string | null; nombre_pp: string; total_producido: number | null }

export interface LineaConsumo { codigo_producto: string | null; nombre: string; cantidad: number; unidad_medida: string | null }

export interface FilaSoftland {
  guia: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
}

export interface Aviso { tipo: 'excluido' | 'revisar'; detalle: string }

export interface ResultadoSoftland { filas: FilaSoftland[]; avisos: Aviso[] }

const UNIDADES_CONTEO = new Set(['UN', 'PR']);
/** Unidades que equivalen a una porción del producto (PP=200GR → 1 UN = 1 PP = 200 GR). */
const UNIDADES_PORCION = new Set(['UN', 'PR', 'PP']);

const PESO_A_VOLUMEN: Record<string, string> = { GR: 'CC', KG: 'LT', CC: 'GR', LT: 'KG' };

/**
 * Convierte entre unidades compatibles (GR↔KG, CC↔LT); UN y PR se tratan como conteo.
 * Peso↔volumen (GR↔CC) se toma 1:1 y se marca `aproximado` para revisarlo.
 */
function convertir(cantidad: number, desde: string | null, hasta: string | null): { valor: number; aproximado: boolean } | null {
  const d = normalizarUM(desde);
  const h = normalizarUM(hasta);
  if (!h || !d || d === h) return { valor: cantidad, aproximado: false };
  if (UNIDADES_CONTEO.has(d) && UNIDADES_CONTEO.has(h)) return { valor: cantidad, aproximado: false };
  const directo = convertirUnidad(cantidad, d, h);
  if (directo != null) return { valor: directo, aproximado: false };
  const equivalente = PESO_A_VOLUMEN[d] ? convertirUnidad(cantidad, PESO_A_VOLUMEN[d], h) : null;
  return equivalente == null ? null : { valor: equivalente, aproximado: true };
}

const redondear = (n: number) => Number(n.toFixed(4));
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 3 });

function codigoLimpio(c: string | null | undefined) { return String(c ?? '').trim(); }

/** Suma por guía + código y ordena por guía y descripción. */
function consolidar(filas: FilaSoftland[]): FilaSoftland[] {
  const map = new Map<string, FilaSoftland>();
  for (const f of filas) {
    const k = `${f.guia}||${f.codigo}`;
    const actual = map.get(k);
    if (actual) actual.cantidad += f.cantidad;
    else map.set(k, { ...f });
  }
  return [...map.values()]
    .map(f => ({ ...f, cantidad: redondear(f.cantidad) }))
    .filter(f => f.cantidad > 0)
    .sort((a, b) => a.guia.localeCompare(b.guia, 'es') || a.descripcion.localeCompare(b.descripcion, 'es'));
}

// Solo los PP con código Softland 0502xxx son producción (transformación). Las porciones de
// materia prima (carnes, quesos, salmón: códigos 03xx/02xx/01xx…) no generan movimiento.
const esCodigoPP = (c: string) => /^0502\d+$/.test(c);

function lineasPP(lineas: LineaProduccion[], avisos: Aviso[]) {
  const porCodigo = new Map<string, number>();
  const excluidos = new Map<string, { nombre: string; total: number }>();
  for (const l of lineas) {
    const codigo = codigoLimpio(l.codigo_producto);
    const total = Number(l.total_producido) || 0;
    if (!codigo) {
      avisos.push({ tipo: 'excluido', detalle: `${l.nombre_pp}: producción sin código de producto (${fmt(total)})` });
      continue;
    }
    if (!esCodigoPP(codigo)) {
      const e = excluidos.get(codigo) ?? { nombre: l.nombre_pp, total: 0 };
      e.total += total;
      excluidos.set(codigo, e);
      continue;
    }
    porCodigo.set(codigo, (porCodigo.get(codigo) ?? 0) + total);
  }
  for (const [codigo, e] of excluidos) {
    avisos.push({ tipo: 'excluido', detalle: `${codigo} ${e.nombre}: porcionado de materia prima, no es producción PP (${fmt(e.total)})` });
  }
  return porCodigo;
}

/** GE_PRODUCCION: ingreso del PP terminado, una sola guía "PRODUCCION <MES> <AÑO>". */
export function construirGEProduccion(lineas: LineaProduccion[], productos: Map<string, ProductoMaestro>, mes: string): ResultadoSoftland {
  const avisos: Aviso[] = [];
  const guia = descripcionGuia('produccion', mes);
  const filas: FilaSoftland[] = [];
  for (const [codigo, total] of lineasPP(lineas, avisos)) {
    const prod = productos.get(codigo);
    if (!prod) { avisos.push({ tipo: 'excluido', detalle: `${codigo}: no existe en el maestro de productos` }); continue; }
    filas.push({ guia, codigo, descripcion: prod.nombre, cantidad: total });
  }
  return { filas: consolidar(filas), avisos };
}

// Paréntesis que hablan de unidad/porción: (GR), (PP=200GR), (PR=250GR), (15 GR C/U), (150GR), (PP=125).
const PARENTESIS_UNIDAD = /\s*\((?=[^)]*(?:\b(?:PP|PR)\s*=|(?:GR|GRS|KG|KGS|CC|LT|ML|UN|UND|PR|PP)\b))[^)]*\)/gi;

/** "PP. ARROZ BLANCO (GR) (PP=200GR)" + 5 recetas → "PROD. ARROZ BLANCO RC=5" (se quitan los paréntesis de unidad). */
export function descripcionGuiaPP(nombrePP: string, recetas: number) {
  const base = nombrePP.trim().replace(PARENTESIS_UNIDAD, '').replace(/^PP\b\.?\s*/i, '').replace(/\s+/g, ' ').trim();
  const rc = Number(recetas.toFixed(2)).toLocaleString('es-CL', { maximumFractionDigits: 2 });
  return `PROD. ${base} RC=${rc}`;
}

/**
 * GS_PRODUCCION: una guía por PP producido en el mes ("PROD. X RC=n"), con una sola línea: el código de la receta en Softland, que es el mismo del PP cambiando 0502 por
 * 0501 (ej. 0502017 → 0501017), y CANTIDAD = lo producido ÷ rendimiento de la receta
 * (cuántas recetas se hicieron). Cta 1-1-06-05.
 */
export function construirGSProduccion(
  lineas: LineaProduccion[], productos: Map<string, ProductoMaestro>, recetas: Map<string, RecetaPP>,
): ResultadoSoftland {
  const avisos: Aviso[] = [];
  const filas: FilaSoftland[] = [];
  for (const [codigoPP, total] of lineasPP(lineas, avisos)) {
    const pp = productos.get(codigoPP);
    const receta = recetas.get(codigoPP);
    const nombrePP = pp?.nombre ?? receta?.nombre ?? codigoPP;
    if (!receta) {
      avisos.push({ tipo: 'excluido', detalle: `${codigoPP} ${nombrePP}: sin receta PP activa (${fmt(total)} ${pp?.unidad_medida ?? ''})` });
      continue;
    }
    const enUnidadReceta = convertir(total, pp?.unidad_medida ?? receta.unidad_rendimiento, receta.unidad_rendimiento);
    if (enUnidadReceta == null || !(receta.rendimiento > 0)) {
      avisos.push({ tipo: 'excluido', detalle: enUnidadReceta == null
        ? `${codigoPP} ${nombrePP}: producción en ${pp?.unidad_medida} y receta en ${receta.unidad_rendimiento}, no se puede convertir`
        : `${codigoPP} ${nombrePP}: la receta no tiene rendimiento` });
      continue;
    }
    if (enUnidadReceta.aproximado) {
      avisos.push({ tipo: 'revisar', detalle: `${codigoPP} ${nombrePP}: producción en ${pp?.unidad_medida} y receta en ${receta.unidad_rendimiento}; se tomó 1 ${pp?.unidad_medida} = 1 ${receta.unidad_rendimiento}` });
    }
    const cantRecetas = enUnidadReceta.valor / receta.rendimiento;
    const codigoReceta = '0501' + codigoPP.slice(4);
    filas.push({
      guia: descripcionGuiaPP(nombrePP, cantRecetas),
      codigo: codigoReceta,
      descripcion: productos.get(codigoReceta)?.nombre ?? nombrePP,
      cantidad: cantRecetas,
    });
  }
  return { filas: consolidar(filas), avisos };
}

/** GS_CONSUMO: una guía (merma / colación / frutas) con lo consumido, sumado por código. */
export function construirGSConsumo(lineas: LineaConsumo[], productos: Map<string, ProductoMaestro>, guia: string): ResultadoSoftland {
  const avisos: Aviso[] = [];
  const filas: FilaSoftland[] = [];
  const sinCodigo = new Map<string, number>();
  for (const l of lineas) {
    const codigo = codigoLimpio(l.codigo_producto);
    const cant = Number(l.cantidad) || 0;
    if (!(cant > 0)) continue;
    if (!codigo) { sinCodigo.set(l.nombre, (sinCodigo.get(l.nombre) ?? 0) + cant); continue; }
    const prod = productos.get(codigo);
    let conv = convertir(cant, l.unidad_medida, prod?.unidad_medida ?? l.unidad_medida);
    const porcion = conv ? null : porcionDelNombre(prod?.nombre ?? l.nombre);
    if (porcion && UNIDADES_PORCION.has(normalizarUM(l.unidad_medida) ?? '')) {
      // Registrado en unidades/porciones (UN, PR o PP) y el maestro en peso o volumen: 1 UN/PP = la porción del nombre (PP=200GR).
      const enPeso = convertir(cant * porcion.cantidad, porcion.unidad, prod?.unidad_medida ?? null);
      if (enPeso) {
        conv = enPeso;
        avisos.push({ tipo: 'revisar', detalle: `${codigo} ${l.nombre}: registrado en ${l.unidad_medida}; se tomó 1 ${l.unidad_medida} = ${fmt(porcion.cantidad)} ${porcion.unidad} (porción del nombre)` });
      }
    }
    if (!conv || conv.aproximado) {
      avisos.push({ tipo: 'revisar', detalle: conv
        ? `${codigo} ${l.nombre}: registrado en ${l.unidad_medida} y maestro en ${prod?.unidad_medida}; se tomó 1:1`
        : `${codigo} ${l.nombre}: registrado en ${l.unidad_medida} y maestro en ${prod?.unidad_medida}; se dejó sin convertir` });
    }
    const cantidad = conv?.valor ?? cant;
    if (!prod) avisos.push({ tipo: 'revisar', detalle: `${codigo} ${l.nombre}: no está en el maestro, se usa el nombre registrado` });
    filas.push({ guia, codigo, descripcion: prod?.nombre ?? l.nombre, cantidad });
  }
  for (const [nombre, cant] of sinCodigo) avisos.push({ tipo: 'excluido', detalle: `${nombre}: sin código de producto (${fmt(cant)})` });
  return { filas: consolidar(filas), avisos: dedupe(avisos) };
}

/** "PP. CANASTO DE PAPAS (PP=200GR) (GR)" → { cantidad: 200, unidad: 'GR' }. */
function porcionDelNombre(nombre: string | null | undefined) {
  const m = /\b(?:PP|PR)\s*=\s*(\d+(?:[.,]\d+)?)\s*(GR|GRS|KG|CC|ML|LT)\b/i.exec(String(nombre ?? ''));
  if (!m) return null;
  const cantidad = Number(m[1].replace(',', '.'));
  return cantidad > 0 ? { cantidad, unidad: m[2].toUpperCase() } : null;
}

function dedupe(avisos: Aviso[]) {
  const vistos = new Set<string>();
  return avisos.filter(a => { const k = a.tipo + a.detalle; if (vistos.has(k)) return false; vistos.add(k); return true; });
}

// ── Excel ────────────────────────────────────────────────────────────────────

type Col = { header: string; width: number; tipo: 'texto' | 'numero' | 'cantidad' };

const COLUMNAS: Record<ArchivoSoftland, Col[]> = {
  ge_produccion: [
    { header: 'BODEGA', width: 8.2, tipo: 'texto' },
    { header: 'FOLIO', width: 7.5, tipo: 'numero' },
    { header: 'FECHA', width: 11.1, tipo: 'texto' },
    { header: 'CONCEPTO', width: 10.5, tipo: 'texto' },
    { header: '\tDescripción GUIA ', width: 23.3, tipo: 'texto' },
    { header: 'CC BODEGA', width: 11.2, tipo: 'texto' },
    { header: 'N° ORD DE PRODUCCION', width: 22.5, tipo: 'numero' },
    { header: 'CC CONTAB', width: 11.1, tipo: 'texto' },
    { header: 'CODIGO', width: 9.5, tipo: 'texto' },
    { header: 'DESCRIPCION', width: 38.4, tipo: 'texto' },
    { header: 'CANTIDAD', width: 12.9, tipo: 'cantidad' },
  ],
  gs_produccion: [
    { header: 'BODEGA', width: 8.2, tipo: 'texto' },
    { header: 'FOLIO', width: 7.2, tipo: 'numero' },
    { header: 'FECHA', width: 10.8, tipo: 'texto' },
    { header: 'CONCEPTO', width: 12.6, tipo: 'texto' },
    { header: '\tDescripción GUIA ', width: 45, tipo: 'texto' },
    { header: 'CC BODEGA', width: 13.2, tipo: 'texto' },
    { header: 'N° ORD DE PRODUCCION', width: 21.9, tipo: 'numero' },
    { header: 'CC CONTAB', width: 13.1, tipo: 'texto' },
    { header: 'CODIGO', width: 9.5, tipo: 'texto' },
    { header: 'DESCRIPCION', width: 37.2, tipo: 'texto' },
    { header: 'CANTIDAD', width: 10.5, tipo: 'cantidad' },
    { header: 'CTA CONTABLE', width: 13.8, tipo: 'texto' },
  ],
  gs_consumo: [
    { header: 'BODEGA', width: 8.2, tipo: 'texto' },
    { header: 'Folio', width: 6, tipo: 'numero' },
    { header: 'FECHA', width: 10.4, tipo: 'texto' },
    { header: 'CONCEPTO', width: 10.5, tipo: 'texto' },
    { header: 'Descripcion', width: 33, tipo: 'texto' },
    { header: 'CC BODEG', width: 10, tipo: 'texto' },
    { header: 'CC CONTAB', width: 11.1, tipo: 'texto' },
    { header: 'Codigo', width: 9.5, tipo: 'texto' },
    { header: 'Producto', width: 36.8, tipo: 'texto' },
    { header: 'CANTIDAD', width: 12, tipo: 'cantidad' },
    { header: 'Cta Contable', width: 11.8, tipo: 'texto' },
  ],
};

const COLOR_ENCABEZADO: Record<ArchivoSoftland, string> = { ge_produccion: 'FF8ED873', gs_produccion: 'FF60CBF3', gs_consumo: 'FF66FF99' };
const HOJA: Record<ArchivoSoftland, string> = { ge_produccion: 'GE', gs_produccion: 'GS_PRODUCCION', gs_consumo: 'GS' };
const FORMATO_CANTIDAD: Record<ArchivoSoftland, string> = { ge_produccion: '0.0', gs_produccion: '0.00', gs_consumo: '_ * #,##0.00_ ;_ * \\-#,##0.00_ ;_ * "-"_ ;_ @_ ' };

/** Líneas por folio en GS_CONSUMO: cada 40 líneas sigue el folio correlativo. */
export const LINEAS_POR_FOLIO_CONSUMO = 40;

/** Índice de folio de cada fila: GE = uno solo; GS_PRODUCCION = uno por guía (PP); GS_CONSUMO = cada 40 líneas. */
function gruposFolio(archivo: ArchivoSoftland, filas: FilaSoftland[]) {
  let g = -1;
  return filas.map((f, i) => {
    if (archivo === 'ge_produccion') return 0;
    if (archivo === 'gs_consumo') return Math.floor(i / LINEAS_POR_FOLIO_CONSUMO);
    if (i === 0 || filas[i - 1].guia !== f.guia) g++;
    return g;
  });
}

/**
 * `folioInicial` (opcional): primer folio; los siguientes grupos toman el correlativo (+1).
 * Sin folio, la primera celda FOLIO queda vacía y el resto son fórmulas que la siguen
 * (mismo folio dentro del grupo, +1 en el grupo siguiente); N° ORD = FOLIO.
 */
export async function construirExcelSoftland(
  archivo: ArchivoSoftland, filas: FilaSoftland[], mes: string, folioInicial: number | null = null,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(HOJA[archivo], { views: [{ state: 'frozen', ySplit: 1 }] });
  const cols = COLUMNAS[archivo];
  ws.columns = cols.map(c => ({ width: c.width }));
  const fuente = { name: 'Aptos Narrow', size: 12 };

  const head = ws.getRow(1);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = fuente;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO[archivo] } };
  });

  const { fechaTexto } = rangoMes(mes);
  const grupos = gruposFolio(archivo, filas);
  const primeraFila: number[] = []; // fila Excel donde parte cada grupo
  filas.forEach((f, idx) => {
    const r = idx + 2;
    const g = grupos[idx];
    if (primeraFila[g] == null) primeraFila[g] = r;
    let folio: number | ExcelJS.CellFormulaValue | null;
    if (folioInicial != null) folio = folioInicial + g;
    else if (r === 2) folio = null;
    else if (primeraFila[g] !== r) folio = { formula: `IF(B${primeraFila[g]}="","",B${primeraFila[g]})`, result: '' };
    else { const prev = primeraFila[g - 1]; folio = { formula: `IF(B${prev}="","",B${prev}+1)`, result: '' }; }
    let valores: (string | number | ExcelJS.CellFormulaValue | null)[];
    const ordProd: number | ExcelJS.CellFormulaValue = typeof folio === 'number' ? folio : { formula: `IF(B${r}="","",B${r})`, result: '' };
    if (archivo === 'gs_consumo') {
      valores = [BODEGA, folio ?? null, fechaTexto, CONCEPTO[archivo], f.guia, CC, CC, f.codigo, f.descripcion, f.cantidad, CTA_CONTABLE.gs_consumo];
    } else {
      valores = [BODEGA, folio ?? null, fechaTexto, CONCEPTO[archivo], f.guia, CC, ordProd, CC, f.codigo, f.descripcion, f.cantidad];
      if (archivo === 'gs_produccion') valores.push(CTA_CONTABLE.gs_produccion);
    }
    const row = ws.getRow(r);
    valores.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      const tipo = cols[i].tipo;
      cell.font = fuente;
      if (tipo === 'texto') { cell.numFmt = '@'; cell.value = v == null ? null : String(v); }
      else if (tipo === 'cantidad') { cell.numFmt = FORMATO_CANTIDAD[archivo]; cell.value = v as number; }
      else { cell.numFmt = 'General'; cell.value = v as number | ExcelJS.CellFormulaValue | null; }
    });
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function nombreArchivoSoftland(archivo: ArchivoSoftland, mes: string, fuente?: FuenteConsumo) {
  const base = archivo === 'ge_produccion' ? 'GE_PRODUCCION_PP' : archivo === 'gs_produccion' ? 'GS_PRODUCCION' : `GS_CONSUMO_${(fuente ?? 'merma').toUpperCase()}`;
  // Nombre con el mes en palabras: GS_CONSUMO_MERMA_OCTUBRE.xlsx
  const mesNombre = MESES[Number(mes.split('-')[1]) - 1];
  return `${base}_${mesNombre}.xlsx`;
}
