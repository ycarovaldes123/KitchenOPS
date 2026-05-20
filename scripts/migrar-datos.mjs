/**
 * Migración completa desde el Excel legado hacia Supabase
 *
 * Uso:
 *   node scripts/migrar-datos.mjs              → migración real
 *   node scripts/migrar-datos.mjs --dry-run     → solo muestra resumen, no escribe
 *   node scripts/migrar-datos.mjs --solo=prod   → solo hoja PRODUCCION + DETALLE + RENDIMIENTO
 *   node scripts/migrar-datos.mjs --solo=col    → solo COLACION
 *   node scripts/migrar-datos.mjs --solo=mer    → solo MERMAS
 *   node scripts/migrar-datos.mjs --solo=maestros → PRODUCTOS, PP, RESPONSABLES, VERDURAS
 *
 * ⚠️  Ejecutar UNA sola vez. El script hace upsert en maestros y skip en operacionales.
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { randomUUID }   from 'node:crypto';
import * as path        from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────
const SUPABASE_URL = 'https://fqiqagesrujcmbjnbkqr.supabase.co';
const SERVICE_KEY  =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxaXFhZ2VzcnVqY21iam5ia3FyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzI3ODkyMywiZXhwIjoyMDkyODU0OTIzfQ.Yn-SI-siVI0bNiofABD8bbTjE_dfbevMMi2CbuadPV0';

const EXCEL_PATH = path.resolve(
  __dirname,
  '../../PEDIDOS PRODUCCION EN PROCESO 2026  (1).xlsx'
);

const DRY_RUN = process.argv.includes('--dry-run');
const SOLO    = (process.argv.find(a => a.startsWith('--solo=')) ?? '').replace('--solo=', '') || null;
const CHUNK   = 300; // filas por lote de insert

const supa = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ──────────────────────────────────────────────────────
function excelFecha(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Fórmula estándar Excel serial → Unix ms (ajuste 25569 = días 1899-12-30 → 1970-01-01)
  const ms   = Math.round((serial - 25569) * 86400 * 1000);
  const d    = new Date(ms);
  // Devolver YYYY-MM-DD en UTC (sin zona) para Postgres DATE
  return d.toISOString().split('T')[0];
}

function parseCosto(v) {
  if (v == null || v === '') return 0;
  const s = String(v).replace(/[$.,\s]/g, match => match === '.' || match === ',' ? '' : '');
  // reemplazar punto decimal chileno ↑ — en realidad quitar todo menos dígitos
  const limpio = String(v).replace(/[^\d]/g, '');
  return parseInt(limpio, 10) || 0;
}

function normNombre(s) {
  return String(s ?? '').trim().toUpperCase();
}

async function insert(tabla, rows, { onConflict } = {}) {
  if (DRY_RUN) { console.log(`  [dry-run] INSERT ${tabla} ×${rows.length}`); return; }
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const q = supa.from(tabla).upsert(chunk, onConflict ? { onConflict } : {});
    const { error } = await q;
    if (error) {
      console.error(`  ✗ Error en ${tabla} (chunk ${i / CHUNK + 1}):`, error.message);
      throw error;
    }
    process.stdout.write(`  ${tabla}: ${Math.min(i + CHUNK, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ✅ ${tabla}: ${rows.length} filas`);
}

// ── Leer Excel ──────────────────────────────────────────────────
console.log('\n📊 Leyendo Excel...');
const wb = XLSX.readFile(EXCEL_PATH);

function hoja(nombre) {
  const ws = wb.Sheets[nombre];
  if (!ws) { console.error(`Hoja "${nombre}" no encontrada`); return []; }
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(1)
    .filter(r => r.some(c => c !== ''));
}

const rawProd    = hoja('PRODUCCION');
const rawDet     = hoja('DETALLE');
const rawRend    = hoja('RENDIMIENTO');
const rawCol     = hoja('COLACION');
const rawDetCol  = hoja('Detalle_Colacion');
const rawMer     = hoja('MERMAS');
const rawDetMer  = hoja('Detalle_Mermas');
const rawResp    = hoja('RESPONSABLE');
const rawPP      = hoja('PRODUCTO EN PROCESO');
const rawProds   = hoja('PRODUCTOS');
const rawVerd    = hoja('VERDURAS');

console.log(`  PRODUCCION:    ${rawProd.length} filas`);
console.log(`  DETALLE:       ${rawDet.length} filas`);
console.log(`  RENDIMIENTO:   ${rawRend.length} filas`);
console.log(`  COLACION:      ${rawCol.length} filas`);
console.log(`  Det.Colacion:  ${rawDetCol.length} filas`);
console.log(`  MERMAS:        ${rawMer.length} filas`);
console.log(`  Det.Mermas:    ${rawDetMer.length} filas`);
console.log(`  PRODUCTOS:     ${rawProds.length} filas`);
console.log(`  PP:            ${rawPP.length} filas`);

// ── Mapas de lookup ──────────────────────────────────────────────

// Productos: codigo → { nombre, um, costo_promedio }
const prodMap = {};
for (const r of rawProds) {
  const codigo = String(r[0] ?? '').trim();
  if (!codigo) continue;
  prodMap[codigo] = {
    codigo,
    nombre:         String(r[1] ?? '').trim(),
    unidad_medida:  String(r[2] ?? '').trim().toUpperCase() || 'UN',
    costo_promedio: parseCosto(r[3]),
    activo: true,
  };
}

// PP: nombre → { tipo_pp, gramos_por_pp }
const ppMap = {};
for (const r of rawPP) {
  const nombre = normNombre(r[1]);
  if (!nombre) continue;
  const tipo = normNombre(r[2]) || 'PORCION';
  const tipoMapped = tipo === 'UNIDAD' ? 'UND' : tipo === 'PORCION' ? 'PORCION' : tipo; // CC, DIRECTO siguen igual
  ppMap[nombre] = {
    nombre,
    tipo_pp:      tipoMapped,
    gramos_por_pp: parseFloat(String(r[3]).replace(',', '.')) || null,
    activo: true,
  };
}

// Responsables: nombre → UUID (se completa en main() leyendo la DB)
const respMap  = {};
const respRows = []; // solo los nuevos a insertar

// Recolectar todos los nombres únicos del Excel
const nombresExcel = new Set();
for (const r of rawResp) {
  const n = normNombre(r[1] || r[0]);
  if (n && n !== 'RESPONSABLE') nombresExcel.add(n);
}
rawProd.forEach(r  => { const n = normNombre(r[2]); if (n) nombresExcel.add(n); });
rawCol.forEach(r   => { const n = normNombre(r[2]); if (n) nombresExcel.add(n); });
rawMer.forEach(r   => { const n = normNombre(r[2]); if (n) nombresExcel.add(n); });
rawRend.forEach(r  => { const n = normNombre(r[7]); if (n) nombresExcel.add(n); });

// Verduras únicas del Excel
const verdurasSet = new Set();
for (const r of rawVerd) {
  const v = normNombre(r[1] || r[0]);
  if (v) verdurasSet.add(v);
}
for (const r of rawRend) {
  const v = normNombre(r[3]);
  if (v) verdurasSet.add(v);
}

console.log(`\n  Nombres en Excel: ${nombresExcel.size}`);
console.log(`  Verduras únicas:  ${verdurasSet.size}`);

// ── MAESTROS ────────────────────────────────────────────────────
async function migrarMaestros() {
  console.log('\n── Maestros ─────────────────────────────────────────');

  await insert('productos', Object.values(prodMap), { onConflict: 'codigo' });

  // PP sin ID heredado → upsert on nombre (ignoreDuplicates para no pisar existentes)
  const ppRows = Object.values(ppMap);
  if (!DRY_RUN) {
    for (let i = 0; i < ppRows.length; i += CHUNK) {
      const chunk = ppRows.slice(i, i + CHUNK);
      const { error } = await supa.from('pp')
        .upsert(chunk, { onConflict: 'nombre', ignoreDuplicates: true });
      if (error) { console.error('  ✗ pp:', error.message); throw error; }
    }
    console.log(`  ✅ pp: ${ppRows.length} filas`);
  } else {
    console.log(`  [dry-run] INSERT pp ×${ppRows.length}`);
  }

  // Responsables: solo insertar los que no existen en la DB
  // (los existentes ya tienen UUIDs y emails reales — no tocar)
  if (!DRY_RUN) {
    if (respRows.length > 0) {
      const { error } = await supa.from('responsables')
        .upsert(respRows, { onConflict: 'nombre', ignoreDuplicates: true });
      if (error) { console.error('  ✗ responsables:', error.message); throw error; }
    }
    console.log(`  ✅ responsables: ${respRows.length} nuevos insertados`);
  } else {
    console.log(`  [dry-run] INSERT responsables ×${respRows.length} nuevos`);
  }

  // Verduras: solo las que no existen ya
  const verdurasRows = Array.from(verdurasSet)
    .map(nombre => ({ id: randomUUID(), nombre }));
  if (!DRY_RUN) {
    const { error } = await supa.from('verduras')
      .upsert(verdurasRows, { onConflict: 'nombre', ignoreDuplicates: true });
    if (error) { console.error('  ✗ verduras:', error.message); throw error; }
    console.log(`  ✅ verduras: ${verdurasRows.length} filas (skip duplicados)`);
  } else {
    console.log(`  [dry-run] INSERT verduras ×${verdurasRows.length}`);
  }
}

// ── PRODUCCIÓN ──────────────────────────────────────────────────
async function migrarProduccion() {
  console.log('\n── Producción ───────────────────────────────────────');

  // Mapa: legacyId → { uuid, fecha, responsableNombre }
  const legacyProdMap = {};

  const prodRows = [];
  for (const r of rawProd) {
    const legId  = String(r[0]).trim();
    if (!legId) continue;
    const fecha  = excelFecha(r[1]) ?? String(r[1]).trim();
    const resp   = normNombre(r[2]);
    const turno  = normNombre(r[3]) || 'AM';
    const obs    = String(r[4] ?? '').trim() || 'Migrado desde sistema legado';
    const uuid   = randomUUID();

    legacyProdMap[legId] = { uuid, fecha, responsableNombre: resp };

    prodRows.push({
      id:                uuid,
      fecha,
      responsable_id:    respMap[resp] ?? null,
      responsable_nombre: resp,
      turno:             ['AM','PM'].includes(turno) ? turno : 'AM',
      observacion:       obs,
      estado:            'REGISTRADO',
    });
  }

  await insert('produccion', prodRows);

  // Leer UUIDs de PP desde Supabase (ya insertados)
  let ppUUIDs = {};
  if (!DRY_RUN) {
    const { data } = await supa.from('pp').select('id, nombre');
    (data ?? []).forEach(p => { ppUUIDs[p.nombre] = p.id; });
  }

  // DETALLE → detalle_produccion
  // DETALLE cols: IDDETALLE | IDPRODUCCION | FECHA | P.P | RECETAS | CANTIDAD PRODUCIDA | MERMAS | TOTAL PRODUCIDO
  const detRows = [];
  for (const r of rawDet) {
    const legProdId = String(r[1]).trim();
    const parent    = legacyProdMap[legProdId];
    if (!parent) continue;

    const nombrePP    = normNombre(r[3]);
    const pp          = ppMap[nombrePP] ?? {};
    const cantidad    = parseFloat(String(r[5]).replace(',', '.')) || 0;
    const total       = parseFloat(String(r[7]).replace(',', '.')) || 0;

    detRows.push({
      id:              randomUUID(),
      produccion_id:   parent.uuid,
      nombre_pp:       nombrePP,
      tipo_pp:         pp.tipo_pp ?? 'PORCION',
      cantidad,
      gramos_por_pp:   pp.gramos_por_pp ?? null,
      total_producido: total,
      recetas_ref:     parseInt(r[4]) || 1,
      codigo_producto: null,
      costo_unitario:  0,
      costo_total:     0,
    });
  }

  await insert('detalle_produccion', detRows);

  // RENDIMIENTO
  // cols: IDRENDIMIENTO | IDPRODUCCION | FECHA | VERDURA | KG UTILIZADOS | RENDIMIENTO | MERMA X REND | RESPONSABLE
  const rendRows = [];
  for (const r of rawRend) {
    const legProdId = String(r[1]).trim();
    const parent    = legacyProdMap[legProdId];
    if (!parent) continue;

    const kgUtil  = parseFloat(String(r[4]).replace(',', '.')) || 0;
    const rendKg  = parseFloat(String(r[5]).replace(',', '.')) || 0;
    const fecha   = excelFecha(r[2]) ?? parent.fecha;
    const resp    = normNombre(r[7]) || parent.responsableNombre;

    rendRows.push({
      id:              randomUUID(),
      produccion_id:   parent.uuid,
      fecha,
      verdura:         normNombre(r[3]),
      kg_utilizados:   kgUtil,
      rendimiento_kg:  rendKg,
      responsable_nombre: resp,
    });
  }

  await insert('rendimiento', rendRows);
}

// ── COLACIÓN ────────────────────────────────────────────────────
async function migrarColacion() {
  console.log('\n── Colación ─────────────────────────────────────────');

  // COLACION cols: ID_COLACION | FECHA | IDRESPONSABLE | OBSERVACION
  // Detalle_Colacion cols: ID_DETALLE_COLACION | ID_COLACION | PRODUCTO | Cantidad | NOMBRE_PRODUCTO

  // Primero calcular costo_total sumando detalle
  const costoPorCol = {};
  for (const r of rawDetCol) {
    const colId  = String(r[1]).trim();
    const cant   = parseFloat(String(r[3]).replace(',', '.')) || 0;
    const prod   = prodMap[String(r[2]).trim()];
    const costo  = prod ? Math.round(prod.costo_promedio * cant) : 0;
    costoPorCol[colId] = (costoPorCol[colId] ?? 0) + costo;
  }

  const legacyColMap = {};
  const colRows = [];

  for (const r of rawCol) {
    const legId = String(r[0]).trim();
    if (!legId) continue;
    const fecha = excelFecha(r[1]) ?? String(r[1]).trim();
    const resp  = normNombre(r[2]);
    const menu  = String(r[3] ?? '').trim() || 'Sin descripción';
    const uuid  = randomUUID();

    legacyColMap[legId] = uuid;

    colRows.push({
      id:                uuid,
      fecha,
      responsable_id:    respMap[resp] ?? null,
      responsable_nombre: resp,
      menu,
      n_inscritos:       0,       // no existía en sistema legado
      costo_total:       costoPorCol[legId] ?? 0,
    });
  }

  await insert('colacion', colRows);

  // Detalle_Colacion → detalle_colacion
  const detColRows = [];
  for (const r of rawDetCol) {
    const legColId = String(r[1]).trim();
    const colUUID  = legacyColMap[legColId];
    if (!colUUID) continue;

    const codProd = String(r[2] ?? '').trim();
    const prod    = prodMap[codProd];
    const cant    = parseFloat(String(r[3]).replace(',', '.')) || 0;
    const costoU  = prod?.costo_promedio ?? 0;
    const costoT  = Math.round(costoU * cant);

    detColRows.push({
      id:              randomUUID(),
      colacion_id:     colUUID,
      codigo_producto: prod ? codProd : null,  // null si no existe en productos
      nombre_producto: String(r[4] ?? '').trim() || prod?.nombre || '',
      cantidad:        cant,
      unidad_medida:   prod?.unidad_medida ?? '',
      costo_unitario:  costoU,
      costo_total:     costoT,
    });
  }

  await insert('detalle_colacion', detColRows);
}

// ── MERMAS ──────────────────────────────────────────────────────
async function migrarMermas() {
  console.log('\n── Mermas ───────────────────────────────────────────');

  // MERMAS cols: ID_MERMAS | FECHA | IDRESPONSABLE | OBSERVACION
  // Detalle_Mermas cols: ID_DETALLE_MERMAS | ID_MERMAS | PRODUCTO | Cantidad | NOMBRE_PRODUCTO

  const legacyMerMap = {};
  const merRows = [];

  for (const r of rawMer) {
    const legId = String(r[0]).trim();
    if (!legId) continue;
    const fecha = excelFecha(r[1]) ?? String(r[1]).trim();
    const resp  = normNombre(r[2]);
    const obs   = String(r[3] ?? '').trim() || 'Migrado desde sistema legado';
    const uuid  = randomUUID();

    legacyMerMap[legId] = uuid;

    merRows.push({
      id:                uuid,
      fecha,
      responsable_id:    respMap[resp] ?? null,
      responsable_nombre: resp,
      observacion:       obs,
      estado:            'REGISTRADO',
    });
  }

  await insert('mermas', merRows);

  const detMerRows = [];
  for (const r of rawDetMer) {
    const legMerId = String(r[1]).trim();
    const merUUID  = legacyMerMap[legMerId];
    if (!merUUID) continue;

    const codProd = String(r[2] ?? '').trim();
    const prod    = prodMap[codProd];
    const cant    = parseFloat(String(r[3]).replace(',', '.')) || 0;
    const costoU  = prod?.costo_promedio ?? 0;
    const costoT  = Math.round(costoU * cant);

    detMerRows.push({
      id:              randomUUID(),
      merma_id:        merUUID,
      codigo_producto: prod ? codProd : null,  // null si no existe en productos
      nombre_producto: String(r[4] ?? '').trim() || prod?.nombre || '',
      cantidad:        cant,
      unidad_medida:   prod?.unidad_medida ?? '',
      motivo:          null,
      costo_unitario:  costoU,
      costo_total:     costoT,
    });
  }

  await insert('detalle_mermas', detMerRows);
}

// ── MAIN ─────────────────────────────────────────────────────────
async function main() {
  if (DRY_RUN) console.log('\n⚠  MODO DRY-RUN — no se escribirá nada en Supabase\n');

  // ── 1. Leer responsables existentes en Supabase ────────────────
  // Necesitamos los UUIDs reales para las FK de produccion/colacion/mermas
  if (!DRY_RUN) {
    const { data: existentes, error } = await supa
      .from('responsables').select('id, nombre');
    if (error) { console.error('Error leyendo responsables:', error.message); process.exit(1); }

    // Cargar UUIDs reales en el mapa
    for (const r of (existentes ?? [])) {
      respMap[normNombre(r.nombre)] = r.id;
    }
    console.log(`\n  Responsables en DB: ${existentes?.length ?? 0}`);
  }

  // ── 2. Identificar responsables nuevos (no están en DB) ────────
  for (const nombre of nombresExcel) {
    if (respMap[nombre]) continue; // ya existe
    const id   = randomUUID();
    respMap[nombre] = id;
    const slug = nombre.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '');
    respRows.push({ id, nombre, email: `${slug}@torobayo.legacy`, rol: 'cocina' });
  }
  console.log(`  Responsables nuevos a insertar: ${respRows.length}`);

  const t0 = Date.now();

  if (!SOLO || SOLO === 'maestros') await migrarMaestros();
  if (!SOLO || SOLO === 'prod')     await migrarProduccion();
  if (!SOLO || SOLO === 'col')      await migrarColacion();
  if (!SOLO || SOLO === 'mer')      await migrarMermas();

  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ Migración completada en ${seg}s`);
}

main().catch(e => { console.error('\n✗ Error fatal:', e.message); process.exit(1); });
