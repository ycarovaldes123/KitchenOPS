import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const repoDir = process.cwd();
const rootDir = path.resolve(repoDir, '..');
const workbookPath = path.join(rootDir, 'PEDIDOS PRODUCCION EN PROCESO 2026  (1).xlsx');
const envPath = path.join(repoDir, '.env.local');
const dryRun = process.argv.includes('--dry-run');

const YELLOW_RGBS = new Set([
  'F1C232',
  'FFFF00',
  'FFD966',
  'FFF2CC',
  'FFE599',
]);

const PP_ALIASES = new Map([
  ['PP MIX TABLA CRIOLLA GR', 'PP MIX TABLA CRIOLLA (MALAYA) GR'],
]);

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

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripSuffix(value) {
  return normalizeText(value)
    .replace(/\s+(GRS?|UND|CC|PORC|KG|GR|PR|UNIDAD|PORCION)$/i, '')
    .trim();
}

function normalizeTipo(value) {
  const tipo = normalizeText(value);
  if (tipo === 'UNIDAD') return 'UND';
  if (tipo === 'PORCION') return 'PORCION';
  if (tipo === 'DIRECTO') return 'DIRECTO';
  if (tipo === 'CC') return 'CC';
  if (tipo === 'UND') return 'UND';
  return tipo || null;
}

function parseNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value)
    .replace(/\$/g, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .trim();
  if (!text || text === '-') return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;
  const dmy4 = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy4) return `${dmy4[3]}-${dmy4[2]}-${dmy4[1]}`;
  const dmy2 = text.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (dmy2) return `20${dmy2[3]}-${dmy2[2]}-${dmy2[1]}`;
  return text;
}

function isYellowFill(cell) {
  const rgb = cell?.s?.fgColor?.rgb || cell?.s?.bgColor?.rgb;
  if (!rgb) return false;
  return YELLOW_RGBS.has(String(rgb).toUpperCase().slice(-6));
}

function rowIsYellow(ws, rowIndex) {
  const rangeRef = ws?.['!ref'];
  if (!rangeRef) return false;
  const range = XLSX.utils.decode_range(rangeRef);
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const cell = ws[XLSX.utils.encode_cell({ r: rowIndex, c })];
    if (cell && isYellowFill(cell)) return true;
  }
  return false;
}

function nonEmptyRows(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  return rows.slice(1).filter((row) => row.some((value) => String(value).trim() !== ''));
}

function yellowRows(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].some((value) => String(value).trim() !== '') && rowIsYellow(ws, i)) {
      out.push(rows[i]);
    }
  }
  return out;
}

function productionKey({ fecha, responsable, turno, observacion }) {
  return [
    fecha,
    normalizeText(responsable),
    normalizeText(turno),
    normalizeText(observacion),
  ].join('|');
}

function mermaKey({ fecha, responsable, observacion }) {
  return [fecha, normalizeText(responsable), normalizeText(observacion)].join('|');
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
  if (dryRun) {
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

async function upsertChunks(client, table, rows, onConflict, chunkSize = 200) {
  if (!rows.length) return 0;
  if (dryRun) {
    console.log(`[dry-run] ${table}: ${rows.length} filas`);
    return rows.length;
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} chunk ${Math.floor(i / chunkSize) + 1}: ${error.message}`);
    inserted += chunk.length;
    console.log(`${table}: ${Math.min(i + chunkSize, rows.length)}/${rows.length}`);
  }
  return inserted;
}

function cleanObservation(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || 'Migrado desde sistema legado';
}

function cleanDisplayText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function resolvePpRow(name, exactMap, stripMap) {
  const exact = normalizeText(name);
  const aliasTarget = PP_ALIASES.get(exact);
  if (aliasTarget) {
    const aliasExact = normalizeText(aliasTarget);
    return exactMap.get(aliasExact) ?? stripMap.get(stripSuffix(aliasTarget)) ?? null;
  }

  return exactMap.get(exact)
    ?? stripMap.get(stripSuffix(name))
    ?? exactMap.get(stripSuffix(name))
    ?? null;
}

async function main() {
  const env = parseEnv(await fs.readFile(envPath, 'utf8'));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const workbook = XLSX.readFile(workbookPath, { cellStyles: true, cellDates: true });

  const workbookProducts = nonEmptyRows(workbook.Sheets.PRODUCTOS).map((row) => ({
    codigo: String(row[0] ?? '').trim(),
    nombre: cleanDisplayText(row[1]),
    unidad_medida: normalizeTipo(row[2]) || 'UN',
    costo_promedio: parseNumber(row[3], 0) ?? 0,
    activo: true,
  })).filter((row) => row.codigo);

  const workbookPpRows = nonEmptyRows(workbook.Sheets['PRODUCTO EN PROCESO']).map((row) => ({
    legacy_name: cleanDisplayText(row[1]),
    tipo_pp: normalizeTipo(row[2]) || 'DIRECTO',
    gramos_por_pp: parseNumber(row[3], null),
  })).filter((row) => row.legacy_name);

  const yellowProduction = yellowRows(workbook.Sheets.PRODUCCION).map((row) => ({
    legacy_id: String(row[0] ?? '').trim(),
    fecha: parseDate(row[1]),
    responsable: cleanDisplayText(row[2]).toUpperCase(),
    turno: normalizeTipo(row[3]) || 'AM',
    observacion: cleanDisplayText(row[4]),
  })).filter((row) => row.legacy_id && row.fecha);

  const yellowMermas = yellowRows(workbook.Sheets.MERMAS).map((row) => ({
    legacy_id: String(row[0] ?? '').trim(),
    fecha: parseDate(row[1]),
    responsable: cleanDisplayText(row[2]).toUpperCase(),
    observacion: cleanObservation(row[3]),
  })).filter((row) => row.legacy_id && row.fecha);

  const yellowColacion = yellowRows(workbook.Sheets.COLACION).map((row) => ({
    legacy_id: String(row[0] ?? '').trim(),
    fecha: parseDate(row[1]),
    responsable: cleanDisplayText(row[2]).toUpperCase(),
    observacion: cleanObservation(row[3]),
  })).filter((row) => row.legacy_id && row.fecha);

  const yellowProductionIds = new Set(yellowProduction.map((row) => row.legacy_id));
  const yellowMermaIds = new Set(yellowMermas.map((row) => row.legacy_id));

  const [responsablesRes, productosRes, ppRes, produccionRes, mermaRes] = await Promise.all([
    supabase.from('responsables').select('id,nombre').limit(1000),
    supabase.from('productos').select('codigo,nombre,unidad_medida,costo_promedio,activo').limit(10000),
    supabase.from('pp').select('id,nombre,tipo_pp,gramos_por_pp,codigo_producto,activo').limit(5000),
    supabase.from('produccion').select('id,fecha,responsable_nombre,turno,observacion').gte('fecha', '2026-01-01').lte('fecha', '2026-12-31').limit(5000),
    supabase.from('mermas').select('id,fecha,responsable_nombre,observacion').gte('fecha', '2026-01-01').lte('fecha', '2026-12-31').limit(5000),
  ]);

  if (responsablesRes.error) throw responsablesRes.error;
  if (productosRes.error) throw productosRes.error;
  if (ppRes.error) throw ppRes.error;
  if (produccionRes.error) throw produccionRes.error;
  if (mermaRes.error) throw mermaRes.error;

  const responsableByName = new Map((responsablesRes.data ?? []).map((row) => [normalizeText(row.nombre), row]));
  const productByCode = new Map((productosRes.data ?? []).map((row) => [String(row.codigo).trim(), row]));

  const productionDbKeys = new Set((produccionRes.data ?? []).map((row) => productionKey({
    fecha: row.fecha,
    responsable: row.responsable_nombre,
    turno: row.turno,
    observacion: row.observacion,
  })));
  const mermaDbKeys = new Set((mermaRes.data ?? []).map((row) => mermaKey({
    fecha: row.fecha,
    responsable: row.responsable_nombre,
    observacion: row.observacion,
  })));

  const missingProduction = yellowProduction.filter((row) => !productionDbKeys.has(productionKey(row)));
  const missingMermas = yellowMermas.filter((row) => !mermaDbKeys.has(mermaKey(row)));
  const missingColacion = [];

  const missingProductRows = workbookProducts.filter(
    (row) => !productByCode.has(row.codigo),
  );

  const ppByExact = new Map();
  const ppByStrip = new Map();
  for (const row of (ppRes.data ?? [])) {
    const exact = normalizeText(row.nombre);
    const stripped = stripSuffix(row.nombre);
    if (!ppByExact.has(exact)) ppByExact.set(exact, row);
    if (!ppByStrip.has(stripped)) ppByStrip.set(stripped, row);
  }

  const ppInsertTargets = [
    { workbookName: 'PP PAPAS CAMOTE (GR)', canonicalName: 'PP PAPAS CAMOTE', codigoProducto: '0401079' },
    { workbookName: 'PP PAPAS BABY (GR)', canonicalName: 'PP PAPAS BABY', codigoProducto: '0401054' },
    { workbookName: 'PP QUESO CABRA (GR)', canonicalName: 'PP QUESO CABRA', codigoProducto: '0201017' },
    { workbookName: 'PP SALSA CHAMPIÑON (CC)', canonicalName: 'PP SALSA CHAMPIÑON', codigoProducto: '0502282' },
    { workbookName: 'PP SALSA QUESO AZUL (CC)', canonicalName: 'PP SALSA QUESO AZUL', codigoProducto: null },
    { workbookName: 'PP VINAGRETA RADLER POMELO (CC)', canonicalName: 'PP VINAGRETA RADLER POMELO', codigoProducto: null },
  ];

  const workbookPpByNorm = new Map(workbookPpRows.map((row) => [normalizeText(row.legacy_name), row]));
  const ppInsertRows = [];
  for (const target of ppInsertTargets) {
    const source = workbookPpByNorm.get(normalizeText(target.workbookName));
    if (!source) throw new Error(`No se encontro la fila maestra en PRODUCTO EN PROCESO: ${target.workbookName}`);
    ppInsertRows.push({
      nombre: target.canonicalName,
      tipo_pp: source.tipo_pp,
      gramos_por_pp: source.gramos_por_pp,
      codigo_producto: target.codigoProducto,
      activo: true,
    });
  }

  const ppAllRows = [...(ppRes.data ?? []), ...ppInsertRows];
  const ppLookupExact = new Map();
  const ppLookupStrip = new Map();
  for (const row of ppAllRows) {
    const exact = normalizeText(row.nombre);
    const stripped = stripSuffix(row.nombre);
    if (!ppLookupExact.has(exact)) ppLookupExact.set(exact, row);
    if (!ppLookupStrip.has(stripped)) ppLookupStrip.set(stripped, row);
  }

  const unresolvedProductionPp = [];
  for (const row of yellowRows(workbook.Sheets.DETALLE)) {
    const parentId = String(row[1] ?? '').trim();
    if (!yellowProductionIds.has(parentId)) continue;
    const name = cleanDisplayText(row[3]);
    if (!name) continue;
    if (resolvePpRow(name, ppLookupExact, ppLookupStrip)) continue;
    unresolvedProductionPp.push(name);
  }

  const productionParentsToInsert = [];
  const prodLegacyToUuid = new Map();
  for (const row of missingProduction) {
    const responsableRow = responsableByName.get(normalizeText(row.responsable));
    if (!responsableRow) {
      throw new Error(`Responsable no encontrado en maestros: ${row.responsable}`);
    }
    const id = randomUUID();
    prodLegacyToUuid.set(row.legacy_id, id);
    productionParentsToInsert.push({
      id,
      fecha: row.fecha,
      responsable_id: responsableRow.id,
      responsable_nombre: row.responsable,
      turno: row.turno,
      observacion: row.observacion,
      estado: 'REGISTRADO',
      correo_enviado: false,
    });
  }

  const mermaParentsToInsert = [];
  const mermaLegacyToUuid = new Map();
  for (const row of missingMermas) {
    const responsableRow = responsableByName.get(normalizeText(row.responsable));
    if (!responsableRow) {
      throw new Error(`Responsable no encontrado en maestros: ${row.responsable}`);
    }
    const id = randomUUID();
    mermaLegacyToUuid.set(row.legacy_id, id);
    mermaParentsToInsert.push({
      id,
      fecha: row.fecha,
      responsable_id: responsableRow.id,
      responsable_nombre: row.responsable,
      observacion: row.observacion,
      estado: 'REGISTRADO',
    });
  }

  const detailRows = [];
  const rendimentoRows = [];
  for (const row of nonEmptyRows(workbook.Sheets.DETALLE)) {
    const parentLegacyId = String(row[1] ?? '').trim();
    if (!prodLegacyToUuid.has(parentLegacyId)) continue;
    const name = cleanDisplayText(row[3]);
    const ppRow = resolvePpRow(name, ppLookupExact, ppLookupStrip);
    if (!ppRow) {
      throw new Error(`No se pudo resolver el PP de produccion: ${name}`);
    }

    const cantidad = parseNumber(row[5], 0) ?? 0;
    const totalProducido = parseNumber(row[7], 0) ?? 0;
    const recetasRef = parseNumber(row[4], 1) ?? 1;
    const product = ppRow.codigo_producto ? productByCode.get(String(ppRow.codigo_producto).trim()) : null;
    const costoUnitario = product ? Math.round(Number(product.costo_promedio) || 0) : 0;
    const costoTotal = calcCostoProduccionPP(
      cantidad,
      { tipo_pp: ppRow.tipo_pp, gramos_por_pp: ppRow.gramos_por_pp },
      product?.unidad_medida ?? null,
      costoUnitario,
    );

    detailRows.push({
      id: randomUUID(),
      produccion_id: prodLegacyToUuid.get(parentLegacyId),
      pp_id: ppRow.id,
      nombre_pp: name,
      tipo_pp: ppRow.tipo_pp,
      cantidad,
      gramos_por_pp: ppRow.gramos_por_pp,
      total_producido: totalProducido,
      recetas_ref: recetasRef,
      codigo_producto: ppRow.codigo_producto ?? null,
      costo_unitario: costoUnitario,
      costo_total: costoTotal,
    });
  }

  for (const row of nonEmptyRows(workbook.Sheets.RENDIMIENTO)) {
    const parentLegacyId = String(row[1] ?? '').trim();
    if (!prodLegacyToUuid.has(parentLegacyId)) continue;
    rendimentoRows.push({
      id: randomUUID(),
      produccion_id: prodLegacyToUuid.get(parentLegacyId),
      fecha: parseDate(row[2]) || null,
      verdura: cleanDisplayText(row[3]),
      kg_utilizados: parseNumber(row[4], 0) ?? 0,
      rendimiento_kg: parseNumber(row[5], 0) ?? 0,
      responsable_nombre: cleanDisplayText(row[7]).toUpperCase(),
    });
  }

  const mermaDetailRows = [];
  for (const row of nonEmptyRows(workbook.Sheets['Detalle_Mermas'])) {
    const parentLegacyId = String(row[1] ?? '').trim();
    if (!mermaLegacyToUuid.has(parentLegacyId)) continue;
    const codigo = String(row[2] ?? '').trim();
    const product = productByCode.get(codigo);
    const cantidad = parseNumber(row[3], 0) ?? 0;
    const costoUnitario = product ? Math.round(Number(product.costo_promedio) || 0) : 0;
    mermaDetailRows.push({
      id: randomUUID(),
      merma_id: mermaLegacyToUuid.get(parentLegacyId),
      codigo_producto: codigo || null,
      nombre_producto: cleanDisplayText(row[4]),
      cantidad,
      unidad_medida: product?.unidad_medida ?? null,
      motivo: null,
      costo_unitario: costoUnitario,
      costo_total: Math.round(cantidad * costoUnitario),
    });
  }

  const unresolvedMermaProducts = [...new Set(mermaDetailRows
    .filter((row) => row.codigo_producto && !productByCode.has(String(row.codigo_producto)))
    .map((row) => String(row.codigo_producto)))]
    .sort();

  console.log('');
  console.log('Resumen del analisis');
  console.log(`- Yellow PRODUCCION: ${yellowProduction.length} | faltantes: ${missingProduction.length}`);
  console.log(`- Yellow MERMAS: ${yellowMermas.length} | faltantes: ${missingMermas.length}`);
  console.log(`- Yellow COLACION: ${yellowColacion.length} | faltantes detectados: ${missingColacion.length}`);
  console.log(`- Productos nuevos en workbook: ${workbookProducts.length} | faltantes en DB: ${missingProductRows.length}`);
  console.log(`- PP nuevos requeridos por los amarillos: ${ppInsertRows.length}`);
  console.log(`- Detalle produccion a insertar: ${detailRows.length}`);
  console.log(`- Rendimiento a insertar: ${rendimentoRows.length}`);
  console.log(`- Mermas a insertar: ${mermaParentsToInsert.length}`);
  console.log(`- Detalle mermas a insertar: ${mermaDetailRows.length}`);
  if (unresolvedProductionPp.length) {
    console.log(`- PP sin resolver: ${[...new Set(unresolvedProductionPp)].join(', ')}`);
  }
  if (unresolvedMermaProducts.length) {
    console.log(`- Productos de merma sin catalogo: ${unresolvedMermaProducts.join(', ')}`);
  }

  if (dryRun) {
    return;
  }

  await upsertChunks(supabase, 'productos', missingProductRows, 'codigo');
  await upsertChunks(supabase, 'pp', ppInsertRows, 'nombre');

  const [freshProductosRes, freshPpRes] = await Promise.all([
    supabase.from('productos').select('codigo,nombre,unidad_medida,costo_promedio,activo').limit(10000),
    supabase.from('pp').select('id,nombre,tipo_pp,gramos_por_pp,codigo_producto,activo').limit(5000),
  ]);
  if (freshProductosRes.error) throw freshProductosRes.error;
  if (freshPpRes.error) throw freshPpRes.error;

  const freshProductByCode = new Map((freshProductosRes.data ?? []).map((row) => [String(row.codigo).trim(), row]));
  const freshPpExact = new Map();
  const freshPpStrip = new Map();
  for (const row of (freshPpRes.data ?? [])) {
    const exact = normalizeText(row.nombre);
    const stripped = stripSuffix(row.nombre);
    if (!freshPpExact.has(exact)) freshPpExact.set(exact, row);
    if (!freshPpStrip.has(stripped)) freshPpStrip.set(stripped, row);
  }

  const detailRowsFinal = [];
  for (const row of nonEmptyRows(workbook.Sheets.DETALLE)) {
    const parentLegacyId = String(row[1] ?? '').trim();
    const parentUuid = prodLegacyToUuid.get(parentLegacyId);
    if (!parentUuid) continue;
    const name = cleanDisplayText(row[3]);
    const ppRow = resolvePpRow(name, freshPpExact, freshPpStrip);
    if (!ppRow) throw new Error(`No se pudo resolver el PP de produccion luego de insertar maestros: ${name}`);

    const cantidad = parseNumber(row[5], 0) ?? 0;
    const totalProducido = parseNumber(row[7], 0) ?? 0;
    const recetasRef = parseNumber(row[4], 1) ?? 1;
    const product = ppRow.codigo_producto ? freshProductByCode.get(String(ppRow.codigo_producto).trim()) : null;
    const costoUnitario = product ? Math.round(Number(product.costo_promedio) || 0) : 0;
    const costoTotal = calcCostoProduccionPP(
      cantidad,
      { tipo_pp: ppRow.tipo_pp, gramos_por_pp: ppRow.gramos_por_pp },
      product?.unidad_medida ?? null,
      costoUnitario,
    );

    detailRowsFinal.push({
      id: randomUUID(),
      produccion_id: parentUuid,
      pp_id: ppRow.id,
      nombre_pp: name,
      tipo_pp: ppRow.tipo_pp,
      cantidad,
      gramos_por_pp: ppRow.gramos_por_pp,
      total_producido: totalProducido,
      recetas_ref: recetasRef,
      codigo_producto: ppRow.codigo_producto ?? null,
      costo_unitario: costoUnitario,
      costo_total: costoTotal,
    });
  }

  const rendaRowsFinal = rendimentoRows.map((row) => ({
    ...row,
    responsable_nombre: cleanDisplayText(row.responsable_nombre).toUpperCase(),
  }));

  const mermaRowsFinal = [];
  for (const row of nonEmptyRows(workbook.Sheets['Detalle_Mermas'])) {
    const parentLegacyId = String(row[1] ?? '').trim();
    const parentUuid = mermaLegacyToUuid.get(parentLegacyId);
    if (!parentUuid) continue;
    const codigo = String(row[2] ?? '').trim();
    const product = freshProductByCode.get(codigo);
    const cantidad = parseNumber(row[3], 0) ?? 0;
    const costoUnitario = product ? Math.round(Number(product.costo_promedio) || 0) : 0;
    mermaRowsFinal.push({
      id: randomUUID(),
      merma_id: parentUuid,
      codigo_producto: codigo || null,
      nombre_producto: cleanDisplayText(row[4]),
      cantidad,
      unidad_medida: product?.unidad_medida ?? null,
      motivo: null,
      costo_unitario: costoUnitario,
      costo_total: Math.round(cantidad * costoUnitario),
    });
  }

  const productionPayload = productionParentsToInsert.map((row) => ({
    ...row,
    observacion: cleanObservation(row.observacion),
  }));

  const mermaPayload = mermaParentsToInsert.map((row) => ({
    ...row,
    observacion: cleanObservation(row.observacion),
  }));

  console.log('');
  console.log('Insertando movimientos...');
  await insertChunks(supabase, 'produccion', productionPayload);
  await insertChunks(supabase, 'detalle_produccion', detailRowsFinal);
  await insertChunks(supabase, 'rendimiento', rendaRowsFinal);
  await insertChunks(supabase, 'mermas', mermaPayload);
  await insertChunks(supabase, 'detalle_mermas', mermaRowsFinal);

  const [checkProdRes, checkMerRes, checkColRes] = await Promise.all([
    supabase.from('produccion').select('fecha,responsable_nombre,turno,observacion').gte('fecha', '2026-01-01').lte('fecha', '2026-12-31').limit(5000),
    supabase.from('mermas').select('fecha,responsable_nombre,observacion').gte('fecha', '2026-01-01').lte('fecha', '2026-12-31').limit(5000),
    supabase.from('colacion').select('fecha,responsable_nombre,menu').gte('fecha', '2026-01-01').lte('fecha', '2026-12-31').limit(5000),
  ]);
  if (checkProdRes.error) throw checkProdRes.error;
  if (checkMerRes.error) throw checkMerRes.error;
  if (checkColRes.error) throw checkColRes.error;

  const prodAfter = new Set((checkProdRes.data ?? []).map((row) => productionKey({
    fecha: row.fecha,
    responsable: row.responsable_nombre,
    turno: row.turno,
    observacion: row.observacion,
  })));
  const merAfter = new Set((checkMerRes.data ?? []).map((row) => mermaKey({
    fecha: row.fecha,
    responsable: row.responsable_nombre,
    observacion: row.observacion,
  })));
  const colAfter = new Set((checkColRes.data ?? []).map((row) => [row.fecha, normalizeText(row.responsable_nombre), normalizeText(row.menu)].join('|')));

  const remainingProd = yellowProduction.filter((row) => !prodAfter.has(productionKey(row)));
  const remainingMer = yellowMermas.filter((row) => !merAfter.has(mermaKey(row)));
  const remainingCol = yellowColacion.filter((row) => !colAfter.has([row.fecha, normalizeText(row.responsable), normalizeText(row.observacion)].join('|')));

  console.log('');
  console.log('Verificacion final');
  console.log(`- PRODUCCION pendiente: ${remainingProd.length}`);
  console.log(`- MERMAS pendiente: ${remainingMer.length}`);
  console.log(`- COLACION pendiente: ${remainingCol.length}`);

  if (remainingProd.length || remainingMer.length || remainingCol.length) {
    throw new Error('Quedaron filas amarillas sin migrar. Revisa la salida anterior.');
  }
}

main().catch((error) => {
  console.error('\nError fatal:', error.message);
  process.exit(1);
});
