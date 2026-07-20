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

function nonEmptyRows(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  return rows.slice(1).filter((row) => row.some((value) => String(value).trim() !== ''));
}

function cleanDisplayText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function productionKey({ fecha, responsable, turno, observacion }) {
  return [
    fecha,
    normalizeText(responsable),
    normalizeText(turno),
    normalizeText(observacion),
  ].join('|');
}

function rendimientoKey(produccionId, verdura, kgUtilizados, rendimientoKg) {
  return [
    produccionId,
    normalizeText(verdura),
    Number(kgUtilizados) || 0,
    Number(rendimientoKg) || 0,
  ].join('|');
}

function insertChunks(client, table, rows, chunkSize = 200) {
  return (async () => {
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
  })();
}

function buildRowsByParent(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.parent_legacy_id)) map.set(row.parent_legacy_id, []);
    map.get(row.parent_legacy_id).push(row);
  }
  return map;
}

function compareCandidateScore(a, b) {
  if (b.matchRends !== a.matchRends) return b.matchRends - a.matchRends;
  if (b.matchDets !== a.matchDets) return b.matchDets - a.matchDets;
  if (a.rendCount !== b.rendCount) return a.rendCount - b.rendCount;
  if (a.detCount !== b.detCount) return a.detCount - b.detCount;
  return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
}

async function main() {
  const env = parseEnv(await fs.readFile(envPath, 'utf8'));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const workbook = XLSX.readFile(workbookPath, { cellStyles: true, cellDates: true });

  const workbookProductions = nonEmptyRows(workbook.Sheets.PRODUCCION).map((row) => ({
    legacy_id: String(row[0] ?? '').trim(),
    fecha: parseDate(row[1]),
    responsable: cleanDisplayText(row[2]).toUpperCase(),
    turno: normalizeText(row[3]) || 'AM',
    observacion: cleanDisplayText(row[4]),
  })).filter((row) => row.legacy_id);
  const workbookProductionByLegacyId = new Map(workbookProductions.map((row) => [row.legacy_id, row]));

  const workbookRendimientos = yellowRows(workbook.Sheets.RENDIMIENTO).map((row) => ({
    legacy_id: String(row[0] ?? '').trim(),
    parent_legacy_id: String(row[1] ?? '').trim(),
    fecha: parseDate(row[2]),
    verdura: cleanDisplayText(row[3]),
    kg_utilizados: parseNumber(row[4], 0) ?? 0,
    rendimiento_kg: parseNumber(row[5], 0) ?? 0,
    responsable_nombre: cleanDisplayText(row[7]).toUpperCase(),
  })).filter((row) => row.legacy_id && row.parent_legacy_id && row.fecha);
  const workbookRendByParent = buildRowsByParent(workbookRendimientos);

  const workbookDetalles = nonEmptyRows(workbook.Sheets.DETALLE).map((row) => ({
    parent_legacy_id: String(row[1] ?? '').trim(),
    nombre_pp: cleanDisplayText(row[3]),
    cantidad: parseNumber(row[5], 0) ?? 0,
  })).filter((row) => row.parent_legacy_id);
  const workbookDetByParent = buildRowsByParent(workbookDetalles);

  const [produccionRes, detalleRes, rendimientoRes] = await Promise.all([
    supabase
      .from('produccion')
      .select('id,fecha,responsable_nombre,turno,observacion,created_at')
      .gte('fecha', '2026-01-01')
      .lte('fecha', '2026-12-31')
      .limit(10000),
    supabase
      .from('detalle_produccion')
      .select('id,produccion_id,nombre_pp,cantidad')
      .limit(20000),
    supabase
      .from('rendimiento')
      .select('id,produccion_id,verdura,kg_utilizados,rendimiento_kg')
      .gte('fecha', '2026-01-01')
      .lte('fecha', '2026-12-31')
      .limit(10000),
  ]);

  if (produccionRes.error) throw produccionRes.error;
  if (detalleRes.error) throw detalleRes.error;
  if (rendimientoRes.error) throw rendimientoRes.error;

  const productionCandidatesByKey = new Map();
  for (const row of (produccionRes.data ?? [])) {
    const key = productionKey({
      fecha: row.fecha,
      responsable: row.responsable_nombre,
      turno: row.turno,
      observacion: row.observacion,
    });
    if (!productionCandidatesByKey.has(key)) productionCandidatesByKey.set(key, []);
    productionCandidatesByKey.get(key).push(row);
  }

  const existingRendByProdId = new Map();
  const existingRendExact = new Set();
  for (const row of (rendimientoRes.data ?? [])) {
    if (!existingRendByProdId.has(row.produccion_id)) existingRendByProdId.set(row.produccion_id, []);
    existingRendByProdId.get(row.produccion_id).push(row);
    existingRendExact.add(rendimientoKey(row.produccion_id, row.verdura, row.kg_utilizados, row.rendimiento_kg));
  }

  const existingDetalleByProdId = new Map();
  for (const row of (detalleRes.data ?? [])) {
    if (!existingDetalleByProdId.has(row.produccion_id)) existingDetalleByProdId.set(row.produccion_id, []);
    existingDetalleByProdId.get(row.produccion_id).push(row);
  }

  const selectedProductionIdByLegacyId = new Map();
  const legacyIdsToResolve = [...new Set(workbookRendimientos.map((row) => row.parent_legacy_id))];
  for (const legacyId of legacyIdsToResolve) {
    const wbProd = workbookProductionByLegacyId.get(legacyId);
    if (!wbProd) {
      throw new Error(`No se encontro la produccion en el workbook para el legacy ${legacyId}`);
    }
    const key = productionKey(wbProd);
    const candidates = productionCandidatesByKey.get(key) ?? [];
    if (!candidates.length) {
      throw new Error(`No se encontro la produccion destino para legacy ${wbProd.legacy_id} (${key})`);
    }

    if (candidates.length === 1) {
      selectedProductionIdByLegacyId.set(wbProd.legacy_id, candidates[0].id);
      continue;
    }

    const scored = candidates.map((candidate) => {
      const candidateRends = existingRendByProdId.get(candidate.id) ?? [];
      const candidateDets = existingDetalleByProdId.get(candidate.id) ?? [];
      const wbRends = workbookRendByParent.get(wbProd.legacy_id) ?? [];
      const wbDets = workbookDetByParent.get(wbProd.legacy_id) ?? [];

      let matchRends = 0;
      for (const wbRend of wbRends) {
        if (candidateRends.some((er) => (
          normalizeText(er.verdura) === normalizeText(wbRend.verdura)
          && (Number(er.kg_utilizados) || 0) === wbRend.kg_utilizados
          && (Number(er.rendimiento_kg) || 0) === wbRend.rendimiento_kg
        ))) {
          matchRends += 1;
        }
      }

      let matchDets = 0;
      for (const wbDet of wbDets) {
        if (candidateDets.some((ed) => (
          normalizeText(ed.nombre_pp) === normalizeText(wbDet.nombre_pp)
          && (Number(ed.cantidad) || 0) === wbDet.cantidad
        ))) {
          matchDets += 1;
        }
      }

      return {
        candidate,
        matchRends,
        matchDets,
        rendCount: candidateRends.length,
        detCount: candidateDets.length,
        createdAt: candidate.created_at ?? '',
      };
    });

    scored.sort(compareCandidateScore);
    selectedProductionIdByLegacyId.set(wbProd.legacy_id, scored[0].candidate.id);
  }

  const rendimientoRowsToInsert = [];
  const pendingKeys = new Set();
  for (const row of workbookRendimientos) {
    const produccionId = selectedProductionIdByLegacyId.get(row.parent_legacy_id);
    if (!produccionId) {
      throw new Error(`No se pudo resolver la produccion padre para rendimiento legacy ${row.legacy_id}`);
    }

    const key = rendimientoKey(produccionId, row.verdura, row.kg_utilizados, row.rendimiento_kg);
    if (existingRendExact.has(key) || pendingKeys.has(key)) continue;
    pendingKeys.add(key);
    rendimientoRowsToInsert.push({
      id: randomUUID(),
      produccion_id: produccionId,
      fecha: row.fecha,
      verdura: row.verdura,
      kg_utilizados: row.kg_utilizados,
      rendimiento_kg: row.rendimiento_kg,
      responsable_nombre: row.responsable_nombre,
    });
  }

  console.log('');
  console.log('Resumen del analisis');
  console.log(`- Rendimientos amarillos en workbook: ${workbookRendimientos.length}`);
  console.log(`- Rendimientos faltantes detectados: ${rendimientoRowsToInsert.length}`);

  if (dryRun) return;

  await insertChunks(supabase, 'rendimiento', rendimientoRowsToInsert);

  const { data: verifyRend, error: verifyErr } = await supabase
    .from('rendimiento')
    .select('produccion_id,verdura,kg_utilizados,rendimiento_kg')
    .gte('fecha', '2026-01-01')
    .lte('fecha', '2026-12-31')
    .limit(10000);
  if (verifyErr) throw verifyErr;

  const verifySet = new Set(
    (verifyRend ?? []).map((row) => rendimientoKey(row.produccion_id, row.verdura, row.kg_utilizados, row.rendimiento_kg)),
  );
  const remaining = workbookRendimientos.filter((row) => {
    const produccionId = selectedProductionIdByLegacyId.get(row.parent_legacy_id);
    if (!produccionId) return true;
    return !verifySet.has(rendimientoKey(produccionId, row.verdura, row.kg_utilizados, row.rendimiento_kg));
  });

  console.log('');
  console.log('Verificacion final');
  console.log(`- Rendimientos pendientes: ${remaining.length}`);

  if (remaining.length) {
    const sample = remaining.slice(0, 20).map((row) => `${row.fecha} | ${row.verdura} | ${row.kg_utilizados} -> ${row.rendimiento_kg}`).join('\n');
    throw new Error(`Quedaron rendimientos sin migrar:\n${sample}`);
  }
}

main().catch((error) => {
  console.error('\nError fatal:', error.message);
  process.exit(1);
});
