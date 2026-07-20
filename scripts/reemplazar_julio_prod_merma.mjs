import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const repoDir = process.cwd();
const rootDir = path.resolve(repoDir, '..');
const workbookPath = path.join(rootDir, 'PEDIDOS PRODUCCION EN PROCESO 2026  (1).xlsx');
const envPath = path.join(repoDir, '.env.local');
const apply = process.argv.includes('--apply');

function argValue(name, fallback) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const startDate = argValue('--start', '2026-07-01');
const endDate = argValue('--end', '2026-07-31');

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    env[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return env;
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripSuffix(value) {
  return normalizeText(value)
    .replace(/\s+(GRS?|UND?|CC|PORC|KG|GR|PR|UNIDAD|PORCION)$/i, '')
    .trim();
}

const PP_ALIASES = new Map([
  ['PP MAYO AJO CABRA STRONG GRS', 'PP MAYO AJI CABRA STRONG GRS'],
  ['PP TABLA CRIOLLA MALAYA GR', 'PP MIX TABLA CRIOLLA MALAYA GRS'],
]);

const PP_UPSERTS = [
  {
    nombre: 'PP ALCACHOFA GR',
    tipo_pp: 'PORCION',
    gramos_por_pp: 160,
    codigo_producto: '0101023',
    activo: true,
  },
];

function normalizeTipo(value) {
  const tipo = normalizeText(value);
  if (tipo === 'UNIDAD') return 'UND';
  if (tipo === 'PORCION') return 'PORCION';
  if (tipo === 'DIRECTO') return 'DIRECTO';
  if (tipo === 'CC') return 'CC';
  if (tipo === 'UND') return 'UND';
  if (tipo === 'AM' || tipo === 'PM') return tipo;
  return tipo || null;
}

function parseNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let text = String(value)
    .replace(/\$/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!text || text === '-') return fallback;
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(/,/g, '.');
  else if (text.includes(',')) text = text.replace(/,/g, '.');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) return `${dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return text;
}

function inRange(date) {
  return typeof date === 'string' && date >= startDate && date <= endDate;
}

function sheetRows(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) throw new Error(`Hoja faltante: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const headers = rows[0] ?? [];
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    if (!rows[i].some((value) => String(value).trim() !== '')) continue;
    const row = { excel_row: i + 1 };
    headers.forEach((header, index) => {
      row[header || `COL${index + 1}`] = rows[i][index];
    });
    out.push(row);
  }
  return out;
}

function resolvePp(name, exactMap, stripMap) {
  const normalized = normalizeText(name);
  const alias = PP_ALIASES.get(normalized);
  if (alias) {
    return exactMap.get(alias) ?? stripMap.get(stripSuffix(alias)) ?? null;
  }
  return exactMap.get(normalized)
    ?? stripMap.get(stripSuffix(name))
    ?? exactMap.get(stripSuffix(name))
    ?? null;
}

function buildPpMaps(ppRows) {
  const exact = new Map();
  const stripped = new Map();
  for (const row of ppRows) {
    const exactKey = normalizeText(row.nombre);
    const strippedKey = stripSuffix(row.nombre);
    if (!exact.has(exactKey)) exact.set(exactKey, row);
    if (!stripped.has(strippedKey)) stripped.set(strippedKey, row);
  }
  return { exact, stripped };
}

function calcTotalPP(cantidad, pp, unidadProducto) {
  const tipo = String(pp.tipo_pp ?? '').toUpperCase();
  if (tipo === 'CC' || tipo === 'DIRECTO') return cantidad;

  const grams = Number(pp.gramos_por_pp) || 1;
  const um = String(unidadProducto ?? '').toUpperCase();

  if (tipo === 'PORCION' && (um === 'KG' || um === 'LT') && grams > 0 && grams < 10) {
    return cantidad * grams * 1000;
  }

  return cantidad * grams;
}

function calcCostoProduccionPP(cantidad, pp, unidadProducto, costoUnitario) {
  const cant = Number(cantidad) || 0;
  const costo = Number(costoUnitario) || 0;
  if (!cant || !costo) return 0;

  const tipo = String(pp.tipo_pp ?? '').toUpperCase();
  const um = String(unidadProducto ?? '').toUpperCase();

  if (tipo === 'DIRECTO') return Math.round(cant * costo);
  if (um === 'PR') return Math.round(cant * costo);
  if (!um && (tipo === 'PORCION' || tipo === 'UND')) return Math.round(cant * costo);

  const total = calcTotalPP(cant, pp, um);
  if (um === 'KG' || um === 'LT') return Math.round((total / 1000) * costo);
  return Math.round(total * costo);
}

async function insertChunks(client, table, rows, chunkSize = 200) {
  if (!rows.length) return 0;
  if (!apply) {
    console.log(`[dry-run] ${table}: ${rows.length} filas`);
    return rows.length;
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client.from(table).insert(chunk);
    if (error) throw new Error(`${table} chunk ${Math.floor(i / chunkSize) + 1}: ${error.message}`);
    inserted += chunk.length;
    console.log(`${table}: ${Math.min(i + chunkSize, rows.length)}/${rows.length}`);
  }
  return inserted;
}

async function deletePeriodParents(client) {
  if (!apply) {
    console.log(`[dry-run] delete produccion/mermas entre ${startDate} y ${endDate}`);
    return;
  }
  const prodDelete = await client.from('produccion').delete().gte('fecha', startDate).lte('fecha', endDate);
  if (prodDelete.error) throw new Error(`delete produccion: ${prodDelete.error.message}`);
  const merDelete = await client.from('mermas').delete().gte('fecha', startDate).lte('fecha', endDate);
  if (merDelete.error) throw new Error(`delete mermas: ${merDelete.error.message}`);
}

function nullableInteger(value) {
  const parsed = parseNumber(value, null);
  return Number.isInteger(parsed) ? parsed : null;
}

async function main() {
  const env = parseEnv(await fs.readFile(envPath, 'utf8'));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const workbook = XLSX.readFile(workbookPath, { cellStyles: true, cellDates: true });

  const detalle = sheetRows(workbook, 'DETALLE')
    .map((row) => ({ ...row, fecha: parseDate(row.FECHA) }))
    .filter((row) => inRange(row.fecha));
  const rendimiento = sheetRows(workbook, 'RENDIMIENTO')
    .map((row) => ({ ...row, fecha: parseDate(row.FECHA) }))
    .filter((row) => inRange(row.fecha));
  const mermas = sheetRows(workbook, 'MERMAS')
    .map((row) => ({ ...row, fecha: parseDate(row.FECHA) }))
    .filter((row) => inRange(row.fecha));

  const allMermas = sheetRows(workbook, 'MERMAS')
    .map((row) => ({ ...row, fecha: parseDate(row.FECHA) }));
  const mermaByLegacyId = new Map(allMermas.map((row) => [cleanText(row.ID_MERMAS), row]));
  const detalleMermas = sheetRows(workbook, 'Detalle_Mermas')
    .map((row) => {
      const parent = mermaByLegacyId.get(cleanText(row.ID_MERMAS));
      return { ...row, parent, fecha: parent?.fecha ?? null };
    })
    .filter((row) => inRange(row.fecha));

  const allProduccion = sheetRows(workbook, 'PRODUCCION')
    .map((row) => ({
      legacy_id: cleanText(row.IDPRODUCCION),
      fecha: parseDate(row.FECHA),
      responsable: cleanText(row.RESPONSABLE).toUpperCase(),
      turno: normalizeTipo(row.TURNO) || 'AM',
      observacion: cleanText(row.OBSERVACION) || 'Migrado desde sistema legado',
    }));
  const produccionByLegacyId = new Map(allProduccion.map((row) => [row.legacy_id, row]));

  const productionLegacyIds = [...new Set([
    ...detalle.map((row) => cleanText(row.IDPRODUCCION)),
    ...rendimiento.map((row) => cleanText(row.IDPRODUCCION)),
  ].filter(Boolean))];
  const mermaLegacyIds = [...new Set([
    ...mermas.map((row) => cleanText(row.ID_MERMAS)),
    ...detalleMermas.map((row) => cleanText(row.ID_MERMAS)),
  ].filter(Boolean))];

  const productionParents = productionLegacyIds.map((id) => produccionByLegacyId.get(id)).filter(Boolean);
  const mermaParentsSource = mermaLegacyIds.map((id) => mermaByLegacyId.get(id)).filter(Boolean);

  const missingProductionParents = productionLegacyIds.filter((id) => !produccionByLegacyId.has(id));
  const missingMermaParents = mermaLegacyIds.filter((id) => !mermaByLegacyId.has(id));
  if (missingProductionParents.length) throw new Error(`Producciones padre no encontradas: ${missingProductionParents.join(', ')}`);
  if (missingMermaParents.length) throw new Error(`Mermas padre no encontradas: ${missingMermaParents.join(', ')}`);

  const [responsablesRes, productosRes, ppRes] = await Promise.all([
    supabase.from('responsables').select('id,nombre').limit(1000),
    supabase.from('productos').select('codigo,nombre,unidad_medida,costo_promedio,activo').limit(20000),
    supabase.from('pp').select('id,nombre,tipo_pp,gramos_por_pp,codigo_producto,activo').limit(10000),
  ]);
  if (responsablesRes.error) throw responsablesRes.error;
  if (productosRes.error) throw productosRes.error;
  if (ppRes.error) throw ppRes.error;

  const responsableByName = new Map((responsablesRes.data ?? []).map((row) => [normalizeText(row.nombre), row]));
  const productByCode = new Map((productosRes.data ?? []).map((row) => [cleanText(row.codigo), row]));
  let { exact: ppExact, stripped: ppStrip } = buildPpMaps(ppRes.data ?? []);

  if (PP_UPSERTS.length) {
    if (apply) {
      const { error } = await supabase.from('pp').upsert(PP_UPSERTS, { onConflict: 'nombre' });
      if (error) throw new Error(`pp upsert: ${error.message}`);
      const freshPp = await supabase.from('pp').select('id,nombre,tipo_pp,gramos_por_pp,codigo_producto,activo').limit(10000);
      if (freshPp.error) throw freshPp.error;
      ({ exact: ppExact, stripped: ppStrip } = buildPpMaps(freshPp.data ?? []));
    } else {
      console.log(`[dry-run] pp upsert: ${PP_UPSERTS.length} maestros`);
      ({ exact: ppExact, stripped: ppStrip } = buildPpMaps([...(ppRes.data ?? []), ...PP_UPSERTS]));
    }
  }

  const missingResponsables = [...new Set([
    ...productionParents.map((row) => row.responsable),
    ...mermaParentsSource.map((row) => cleanText(row.IDRESPONSABLE).toUpperCase()),
    ...rendimiento.map((row) => cleanText(row.RESPONSABLE).toUpperCase()),
  ].filter(Boolean).filter((name) => !responsableByName.has(normalizeText(name))))];
  if (missingResponsables.length) throw new Error(`Responsables no encontrados: ${missingResponsables.join(', ')}`);

  const unresolvedPp = [...new Set(detalle
    .map((row) => cleanText(row['P.P']))
    .filter((name) => name && !resolvePp(name, ppExact, ppStrip)))]
    .sort();
  if (unresolvedPp.length) throw new Error(`PP sin resolver: ${unresolvedPp.join(', ')}`);

  const unresolvedMermaProducts = [...new Set(detalleMermas
    .map((row) => cleanText(row.PRODUCTO))
    .filter((code) => code && !productByCode.has(code)))]
    .sort();
  if (unresolvedMermaProducts.length) throw new Error(`Productos de merma sin resolver: ${unresolvedMermaProducts.join(', ')}`);

  const backupDir = path.join(rootDir, 'outputs', 'supabase_backups');
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const periodSlug = `${startDate}_a_${endDate}`.replace(/[^0-9A-Za-z_-]/g, '-');
  const backupPath = path.join(backupDir, `backup_prod_merma_${periodSlug}_antes_reemplazo_${stamp}.json`);
  const [currentProd, currentDet, currentRend, currentMer, currentDetMer] = await Promise.all([
    supabase.from('produccion').select('*').gte('fecha', startDate).lte('fecha', endDate).limit(10000),
    supabase.from('detalle_produccion').select('*,produccion!inner(fecha)').gte('produccion.fecha', startDate).lte('produccion.fecha', endDate).limit(20000),
    supabase.from('rendimiento').select('*').gte('fecha', startDate).lte('fecha', endDate).limit(10000),
    supabase.from('mermas').select('*').gte('fecha', startDate).lte('fecha', endDate).limit(10000),
    supabase.from('detalle_mermas').select('*,mermas!inner(fecha)').gte('mermas.fecha', startDate).lte('mermas.fecha', endDate).limit(20000),
  ]);
  for (const response of [currentProd, currentDet, currentRend, currentMer, currentDetMer]) {
    if (response.error) throw response.error;
  }
  await fs.writeFile(backupPath, JSON.stringify({
    created_at: new Date().toISOString(),
    period: { startDate, endDate },
    produccion: currentProd.data ?? [],
    detalle_produccion: currentDet.data ?? [],
    rendimiento: currentRend.data ?? [],
    mermas: currentMer.data ?? [],
    detalle_mermas: currentDetMer.data ?? [],
  }, null, 2), 'utf8');

  const productionLegacyToUuid = new Map();
  const productionRows = productionParents.map((row) => {
    const id = randomUUID();
    productionLegacyToUuid.set(row.legacy_id, id);
    const responsable = responsableByName.get(normalizeText(row.responsable));
    return {
      id,
      fecha: row.fecha,
      responsable_id: responsable.id,
      responsable_nombre: row.responsable,
      turno: row.turno,
      observacion: row.observacion,
      estado: 'REGISTRADO',
      correo_enviado: false,
    };
  });

  const detailRows = detalle.map((row) => {
    const parentLegacyId = cleanText(row.IDPRODUCCION);
    const ppName = cleanText(row['P.P']);
    const ppRow = resolvePp(ppName, ppExact, ppStrip);
    const cantidad = parseNumber(row['CANTIDAD PRODUCIDA'], 0) ?? 0;
    const totalProducido = parseNumber(row['TOTAL PRODUCIDO'], 0) ?? 0;
    const product = ppRow.codigo_producto ? productByCode.get(cleanText(ppRow.codigo_producto)) : null;
    const costoUnitario = product ? Math.round(Number(product.costo_promedio) || 0) : 0;
    const costoTotal = calcCostoProduccionPP(
      cantidad,
      { tipo_pp: ppRow.tipo_pp, gramos_por_pp: ppRow.gramos_por_pp },
      product?.unidad_medida ?? null,
      costoUnitario,
    );

    return {
      id: randomUUID(),
      produccion_id: productionLegacyToUuid.get(parentLegacyId),
      pp_id: ppRow.id,
      nombre_pp: ppName,
      tipo_pp: ppRow.tipo_pp,
      cantidad,
      gramos_por_pp: ppRow.gramos_por_pp,
      total_producido: totalProducido,
      recetas_ref: nullableInteger(row.RECETAS),
      codigo_producto: ppRow.codigo_producto ?? null,
      costo_unitario: costoUnitario,
      costo_total: costoTotal,
    };
  });

  const rendimientoRows = rendimiento.map((row) => ({
    id: randomUUID(),
    produccion_id: productionLegacyToUuid.get(cleanText(row.IDPRODUCCION)),
    fecha: row.fecha,
    verdura: cleanText(row.VERDURA),
    kg_utilizados: parseNumber(row['KG UTILIZADOS'], 0) ?? 0,
    rendimiento_kg: parseNumber(row.RENDIMIENTO, 0) ?? 0,
    responsable_nombre: cleanText(row.RESPONSABLE).toUpperCase(),
  }));

  const mermaLegacyToUuid = new Map();
  const mermaRows = mermaParentsSource.map((row) => {
    const id = randomUUID();
    mermaLegacyToUuid.set(cleanText(row.ID_MERMAS), id);
    const responsableNombre = cleanText(row.IDRESPONSABLE).toUpperCase();
    const responsable = responsableByName.get(normalizeText(responsableNombre));
    return {
      id,
      fecha: row.fecha,
      responsable_id: responsable.id,
      responsable_nombre: responsableNombre,
      observacion: cleanText(row.OBSERVACION) || 'Migrado desde sistema legado',
      estado: 'REGISTRADO',
    };
  });

  const detalleMermaRows = detalleMermas.map((row) => {
    const code = cleanText(row.PRODUCTO);
    const product = productByCode.get(code);
    const cantidad = parseNumber(row.Cantidad, 0) ?? 0;
    const costoUnitario = product ? Math.round(Number(product.costo_promedio) || 0) : 0;
    return {
      id: randomUUID(),
      merma_id: mermaLegacyToUuid.get(cleanText(row.ID_MERMAS)),
      codigo_producto: code || null,
      nombre_producto: cleanText(row.NOMBRE_PRODUCTO),
      cantidad,
      unidad_medida: product?.unidad_medida ?? null,
      motivo: null,
      costo_unitario: costoUnitario,
      costo_total: Math.round(cantidad * costoUnitario),
    };
  });

  console.log('');
  console.log(apply ? 'Modo APPLY' : 'Modo DRY-RUN');
  console.log(`Backup: ${backupPath}`);
  console.log(`Produccion padres: ${productionRows.length}`);
  console.log(`Detalle produccion: ${detailRows.length}`);
  console.log(`Rendimiento: ${rendimientoRows.length}`);
  console.log(`Mermas padres: ${mermaRows.length}`);
  console.log(`Detalle mermas: ${detalleMermaRows.length}`);

  await deletePeriodParents(supabase);
  await insertChunks(supabase, 'produccion', productionRows);
  await insertChunks(supabase, 'detalle_produccion', detailRows);
  await insertChunks(supabase, 'rendimiento', rendimientoRows);
  await insertChunks(supabase, 'mermas', mermaRows);
  await insertChunks(supabase, 'detalle_mermas', detalleMermaRows);

  if (!apply) return;

  const [verifyProd, verifyDet, verifyRend, verifyMer, verifyDetMer] = await Promise.all([
    supabase.from('produccion').select('id', { count: 'exact', head: true }).gte('fecha', startDate).lte('fecha', endDate),
    supabase.from('detalle_produccion').select('id,produccion!inner(fecha)', { count: 'exact', head: true }).gte('produccion.fecha', startDate).lte('produccion.fecha', endDate),
    supabase.from('rendimiento').select('id', { count: 'exact', head: true }).gte('fecha', startDate).lte('fecha', endDate),
    supabase.from('mermas').select('id', { count: 'exact', head: true }).gte('fecha', startDate).lte('fecha', endDate),
    supabase.from('detalle_mermas').select('id,mermas!inner(fecha)', { count: 'exact', head: true }).gte('mermas.fecha', startDate).lte('mermas.fecha', endDate),
  ]);
  for (const response of [verifyProd, verifyDet, verifyRend, verifyMer, verifyDetMer]) {
    if (response.error) throw response.error;
  }
  console.log('');
  console.log('Verificacion final');
  console.log(`Produccion padres DB: ${verifyProd.count}`);
  console.log(`Detalle produccion DB: ${verifyDet.count}`);
  console.log(`Rendimiento DB: ${verifyRend.count}`);
  console.log(`Mermas padres DB: ${verifyMer.count}`);
  console.log(`Detalle mermas DB: ${verifyDetMer.count}`);
}

main().catch((error) => {
  console.error('\nError fatal:', error.message);
  process.exit(1);
});
