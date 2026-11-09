import { FOOD_SUBCATEGORIAS, CAFETERIA_SUBCATEGORIAS } from '@/lib/toteat-catalog';

const DEFAULT_TOTEAT_BASE_URL = 'https://toteatglobal.appspot.com/mw/or/1.0';
// Toteat responde ~1 s por dia y ~10 s por tramo de 15 dias: se consulta un dia por request, varios
// en paralelo, y cada dia queda en cache (los dias cerrados no cambian).
const MAX_DAYS_PER_REQUEST = 1;
const PARALLEL_REQUESTS = 8;
const CACHE_TTL_CLOSED_MS = 6 * 60 * 60 * 1000;
const CACHE_TTL_OPEN_MS = 2 * 60 * 1000;
const CACHE_MAX_CHUNKS = 120;

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
  hierarchy_id: string | null;
  quantity: number;
  gross_amount: number | null;
  net_amount: number | null;
  // Descuento de la línea tal como lo trae Toteat (Ventas Jerarquía): monto negativo, 0 si no hubo.
  discount_amount: number;
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

type CachedChunk = { at: number; ttl: number; rows: unknown[]; items: ToteatVentaItem[] };
const chunkCache = new Map<string, CachedChunk>();
const chunkInFlight = new Map<string, Promise<CachedChunk>>();

function todayChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date()).replace(/-/g, '');
}

async function loadChunk(credentials: ToteatCredentials, ini: string, end: string): Promise<CachedChunk> {
  const key = `${credentials.xir}|${credentials.xil}|${ini}|${end}`;
  const cached = chunkCache.get(key);
  if (cached && Date.now() - cached.at < cached.ttl) return cached;

  // Dos consultas simultaneas del mismo dia comparten la misma llamada a Toteat.
  const pending = chunkInFlight.get(key);
  if (pending) return pending;

  const promise = fetchToteatSalesChunk(credentials, ini, end)
    .then(result => {
      // Hoy y ayer (turno nocturno) pueden seguir recibiendo ventas: cache corto.
      const ayer = new Date(`${todayChile().replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}T12:00:00Z`);
      ayer.setUTCDate(ayer.getUTCDate() - 1);
      const entry: CachedChunk = {
        at: Date.now(),
        ttl: end >= toToteatDate(ayer) ? CACHE_TTL_OPEN_MS : CACHE_TTL_CLOSED_MS,
        rows: result.rows,
        items: normalizeSalesRows(result.rows, toIsoDate(ini)),
      };
      chunkCache.delete(key);
      chunkCache.set(key, entry);
      while (chunkCache.size > CACHE_MAX_CHUNKS) chunkCache.delete(chunkCache.keys().next().value!);
      return entry;
    })
    .finally(() => chunkInFlight.delete(key));
  chunkInFlight.set(key, promise);
  return promise;
}

export async function fetchToteatSales(desde: string, hasta: string, options: ToteatSalesOptions = {}): Promise<ToteatSalesResponse> {
  const credentials = getToteatCredentials();
  const chunks = splitDateRange(desde, hasta, MAX_DAYS_PER_REQUEST);
  const results: CachedChunk[] = new Array(chunks.length);

  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      results[i] = await loadChunk(credentials, chunks[i].ini, chunks[i].end);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_REQUESTS, chunks.length) }, worker));

  const raw: unknown[] = [];
  const items: ToteatVentaItem[] = [];
  const chunkMeta: { ini: string; end: string; count: number }[] = [];
  chunks.forEach((chunk, i) => {
    const result = results[i];
    raw.push(...result.rows);
    const scoped = options.soloComida === false ? result.items : result.items.filter(isFoodSale);
    items.push(...scoped);
    chunkMeta.push({ ...chunk, count: scoped.length });
  });

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

    // Una sola copia de la orden, sin el arreglo de productos, compartida por todas sus lineas.
    const order = Object.fromEntries(Object.entries(record).filter(([, v]) => !Array.isArray(v) || !v.includes(details[0])));
    for (const detail of details) {
      const item = normalizeDetail(order, detail, fallbackDate);
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
    hierarchy_id: firstString(detail, ['hierarchyId']) ?? null,
    quantity: firstNumber(detail, ['quantity', 'qty', 'cantidad', 'amount']) ?? 1,
    gross_amount: firstNumber(detail, ['grossAmount', 'payed', 'total', 'totalAmount', 'gross', 'monto', 'priceTotal', 'netPrice']),
    net_amount: firstNumber(detail, ['netAmount', 'netPrice', 'subtotal', 'net', 'montoNeto']),
    discount_amount: firstNumber(detail, ['discounts', 'discount', 'descuento', 'descuentos']) ?? 0,
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

function toIsoDate(toteatDate: string) {
  return `${toteatDate.slice(0, 4)}-${toteatDate.slice(4, 6)}-${toteatDate.slice(6, 8)}`;
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
