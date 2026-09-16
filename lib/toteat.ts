import { FOOD_SUBCATEGORIAS, CAFETERIA_SUBCATEGORIAS } from '@/lib/toteat-catalog';

const DEFAULT_TOTEAT_BASE_URL = 'https://toteatglobal.appspot.com/mw/or/1.0';
const MAX_DAYS_PER_REQUEST = 15;

export interface ToteatCredentials {
  xir: string;
  xil: string;
  xiu: string;
  xapitoken: string;
  baseUrl: string;
}

export interface ToteatVentaItem {
  fecha: string;
  order_id: string | null;
  product_code: string | null;
  product_name: string;
  category: string | null;
  quantity: number;
  gross_amount: number | null;
  net_amount: number | null;
  raw: Record<string, unknown>;
}

export interface ToteatSalesResponse {
  raw: unknown[];
  items: ToteatVentaItem[];
  chunks: { ini: string; end: string; count: number }[];
}

export interface ToteatSalesOptions {
  soloComida?: boolean;
}

const FOOD_CATEGORIES = new Set(FOOD_SUBCATEGORIAS.map(normalizeText));
const CAFETERIA_CATEGORIES = new Set(CAFETERIA_SUBCATEGORIAS.map(normalizeText));

type SaleClassifiable = Pick<ToteatVentaItem, 'category' | 'product_code' | 'product_name'>;

const FOOD_CODE_PREFIXES = [
  'K130',
  'K140',
  'K150',
  'K160',
  'K170',
  'K180',
  'K250',
];

const FOOD_NAME_KEYWORDS = [
  'ACOMPANAMIENTO',
  'AGREGADO',
  'ALITA',
  'AROS DE CEBOLLA',
  'ASADO',
  'BIFE',
  'BURGER',
  'CEVICHE',
  'CHORRILLANA',
  'CHORIZO',
  'CHURRASCO',
  'COMPLETO',
  'COSTILLAR',
  'CRUDO',
  'EMPANADA',
  'ENSALADA',
  'FOCACCIA',
  'HAMBURGUESA',
  'HELADO',
  'LOMITO',
  'LOMO',
  'NUGGET',
  'PANQUEQUE',
  'PAPAS',
  'PASTA',
  'PICADA',
  'PLATEADA',
  'POSTRE',
  'PULLED PORK',
  'RISOTTO',
  'SANDWICH',
  'SCHNITZEL',
  'TABLA',
  'TORTA',
  'WRAP',
];

export function getToteatCredentials(): ToteatCredentials {
  const xir = process.env.TOTEAT_XIR;
  const xil = process.env.TOTEAT_XIL;
  const xiu = process.env.TOTEAT_XIU;
  const xapitoken = process.env.TOTEAT_XAPITOKEN;

  if (!xir || !xil || !xiu || !xapitoken) {
    throw new Error('Faltan variables TOTEAT_XIR, TOTEAT_XIL, TOTEAT_XIU o TOTEAT_XAPITOKEN');
  }

  return {
    xir,
    xil,
    xiu,
    xapitoken,
    baseUrl: process.env.TOTEAT_BASE_URL ?? DEFAULT_TOTEAT_BASE_URL,
  };
}

export async function fetchToteatSales(desde: string, hasta: string, options: ToteatSalesOptions = {}): Promise<ToteatSalesResponse> {
  const credentials = getToteatCredentials();
  const chunks = splitDateRange(desde, hasta, MAX_DAYS_PER_REQUEST);
  const raw: unknown[] = [];
  const items: ToteatVentaItem[] = [];
  const chunkMeta: { ini: string; end: string; count: number }[] = [];

  for (const chunk of chunks) {
    const result = await fetchToteatSalesChunk(credentials, chunk.ini, chunk.end);
    raw.push(...result.rows);
    const normalized = normalizeSalesRows(result.rows, chunk.ini);
    const scoped = options.soloComida === false ? normalized : normalized.filter(isFoodSale);
    items.push(...scoped);
    chunkMeta.push({ ...chunk, count: scoped.length });
  }

  return { raw, items, chunks: chunkMeta };
}

export function isFoodSale(item: SaleClassifiable) {
  const category = normalizeText(item.category ?? '');
  if (FOOD_CATEGORIES.has(category)) return true;

  const code = normalizeText(item.product_code ?? '');
  if (FOOD_CODE_PREFIXES.some(prefix => code.startsWith(prefix))) return true;

  const name = normalizeText(item.product_name);
  return FOOD_NAME_KEYWORDS.some(keyword => name.includes(keyword));
}

export function isCafeteriaSale(item: SaleClassifiable) {
  return CAFETERIA_CATEGORIES.has(normalizeText(item.category ?? ''));
}

/** Venta "cocina real": comida (no bebidas) y excluyendo Cafeteria. Usado en Control Carnicos
 * > Tabla Resumen para calcular el % que representa la diferencia de cuadre sobre la venta. */
export function isCocinaSale(item: SaleClassifiable) {
  return isFoodSale(item) && !isCafeteriaSale(item);
}

async function fetchToteatSalesChunk(credentials: ToteatCredentials, ini: string, end: string) {
  const url = new URL(`${credentials.baseUrl.replace(/\/$/, '')}/sales`);
  url.searchParams.set('xir', credentials.xir);
  url.searchParams.set('xil', credentials.xil);
  url.searchParams.set('xiu', credentials.xiu);
  url.searchParams.set('xapitoken', credentials.xapitoken);
  url.searchParams.set('ini', ini);
  url.searchParams.set('end', end);

  const response = await fetch(url, { method: 'GET', cache: 'no-store' });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`TOTEAT respondio ${response.status}: ${extractErrorMessage(payload)}`);
  }

  if (payload && typeof payload === 'object' && 'ok' in payload && payload.ok === false) {
    throw new Error(`TOTEAT rechazo la consulta: ${extractErrorMessage(payload)}`);
  }

  return { rows: extractRows(payload) };
}

function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.sales)) return record.sales;
  if (Array.isArray(record.rows)) return record.rows;
  return [];
}

function normalizeSalesRows(rows: unknown[], fallbackDate: string): ToteatVentaItem[] {
  const items: ToteatVentaItem[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const details = extractDetailRows(record);

    if (!details.length) {
      const item = normalizeDetail(record, record, fallbackDate);
      if (item) items.push(item);
      continue;
    }

    for (const detail of details) {
      const item = normalizeDetail(record, detail, fallbackDate);
      if (item) items.push(item);
    }
  }

  return items;
}

function extractDetailRows(record: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [
    record.details,
    record.detail,
    record.items,
    record.products,
    record.orderDetails,
    record.order_detail,
    record.detalle,
    record.detalles,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((value): value is Record<string, unknown> => !!value && typeof value === 'object');
    }
  }

  return [];
}

function normalizeDetail(
  order: Record<string, unknown>,
  detail: Record<string, unknown>,
  fallbackDate: string,
): ToteatVentaItem | null {
  const productName = firstString(detail, [
    'productName',
    'prodName',
    'name',
    'nombre',
    'itemName',
    'description',
    'descripcion',
  ]);
  if (!productName) return null;

  return {
    fecha: normalizeDate(
      firstString(order, ['businessDate', 'shiftDate', 'date', 'fecha', 'createdDate', 'closedDate']) ??
      firstString(detail, ['businessDate', 'date', 'fecha']) ??
      fallbackDate,
    ),
    order_id: firstString(order, ['orderId', 'id', 'ic', 'order_id', 'folio']) ?? null,
    product_code: firstString(detail, ['productCode', 'code', 'codigo', 'sku', 'externalCode', 'external_id', 'id']) ?? null,
    product_name: productName,
    category: firstString(detail, ['category', 'categoria', 'hierarchyName', 'hierarchy', 'jerarquia', 'family', 'familia']) ?? null,
    quantity: firstNumber(detail, ['quantity', 'qty', 'cantidad', 'amount']) ?? 1,
    gross_amount: firstNumber(detail, ['grossAmount', 'payed', 'total', 'totalAmount', 'gross', 'monto', 'priceTotal', 'netPrice']),
    net_amount: firstNumber(detail, ['netAmount', 'netPrice', 'subtotal', 'net', 'montoNeto']),
    raw: { order, detail },
  };
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined || value === '') continue;
    return String(value);
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined || value === '') continue;
    const number = Number(String(value).replace(',', '.'));
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeDate(value: string) {
  const onlyDigits = value.replace(/\D/g, '');
  if (onlyDigits.length >= 8) {
    const y = onlyDigits.slice(0, 4);
    const m = onlyDigits.slice(4, 6);
    const d = onlyDigits.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  return value.slice(0, 10);
}

function splitDateRange(desde: string, hasta: string, maxDays: number) {
  const start = parseIsoDate(desde);
  const end = parseIsoDate(hasta);
  if (start > end) throw new Error('La fecha desde no puede ser mayor que hasta');

  const chunks: { ini: string; end: string }[] = [];
  let cursor = start;

  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push({ ini: toToteatDate(cursor), end: toToteatDate(chunkEnd) });
    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return chunks;
}

function parseIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Fecha invalida. Usa formato YYYY-MM-DD');
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function toToteatDate(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function extractErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 'respuesta no JSON';
  const record = payload as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  if (typeof record.error === 'string') return record.error;
  if (record.msg && typeof record.msg === 'object') {
    const msg = record.msg as Record<string, unknown>;
    if (typeof msg.texto === 'string') return msg.texto;
    if (typeof msg.text === 'string') return msg.text;
  }
  return JSON.stringify(payload).slice(0, 500);
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}
