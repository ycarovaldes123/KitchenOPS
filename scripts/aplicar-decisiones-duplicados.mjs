// Importa los codigos que el usuario completo a mano en
// productos_faltantes_codigo_toteat_2026-08-26.xlsx, aplicando las
// decisiones tomadas sobre los 3 conflictos de codigo duplicado:
//
// 1. MALAYA BRAVA (Carta Nueva) se queda con 6002471/K13080.
//    MALAYA DE CERDO (Clasicos) NO se importa, queda sin codigo.
// 2. MENU DE NIÑO (Carta Nueva) se queda con 6001209/K15011.
//    MENU NIÑO POLLO (Clasicos) se le limpia el codigo que tenia en la DB.
// 3. TABLA DIE FREUDE (Carta Nueva) se queda con 6002474/K13038.
//    TABLA DIE FREUNDE (Picadas) se le limpia el codigo que tenia en la DB.
//
// PORCION FILETE DE POLLO / PORCION FILETE DE POLLO SANDWICH no se tocan
// (comparten solo el ID softland a proposito, con ID TOTEAT distinto).
import ExcelJS from 'exceljs';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');
const CARPETA = 'C:/Users/kunstmann/Desktop/SaaS/KitchenOPS';
const ARCHIVO_PENDIENTES = `${CARPETA}/productos_faltantes_codigo_toteat_2026-08-26.xlsx`;

const env = fs.readFileSync('.env.local', 'utf8');
const vars = Object.fromEntries(env.split('\n').filter(l => l.includes('=')).map(l => {
  const i = l.indexOf('=');
  return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
}));
const supa = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

function norm(v) {
  return String(v ?? '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const EXCLUIR = new Set([`${norm('CLÁSICOS')}||${norm('MALAYA DE CERDO')}`]);
const LIMPIAR = [
  { categoria: 'CLÁSICOS', plato: 'MENU NIÑO POLLO' },
  { categoria: 'PICADAS', plato: 'TABLA DIE FREUNDE' },
];

// ── 1. Leer lo que el usuario completo ──────────────────────────
const wbIn = new ExcelJS.Workbook();
await wbIn.xlsx.readFile(ARCHIVO_PENDIENTES);
const wsIn = wbIn.worksheets[0];

const filasAImportar = [];
for (let r = 2; r <= wsIn.rowCount; r++) {
  const row = wsIn.getRow(r);
  const categoria = row.getCell(1).value;
  const plato = row.getCell(2).value;
  const id = row.getCell(3).value;
  const idToteat = row.getCell(4).value;
  if (!plato) continue;
  const idStr = id != null ? String(id).trim() : '';
  const idToteatStr = idToteat != null ? String(idToteat).trim() : '';
  if (!idStr || !idToteatStr) continue; // en blanco, se ignora

  const key = `${norm(categoria)}||${norm(plato)}`;
  if (EXCLUIR.has(key)) {
    console.log(`Excluido por decision del usuario: ${plato} (${categoria})`);
    continue;
  }
  filasAImportar.push({ categoria: String(categoria).trim(), plato: String(plato).trim(), id: idStr, id_toteat: idToteatStr, key });
}
console.log(`Filas a importar: ${filasAImportar.length}`);

// ── 2. Leer carta ────────────────────────────────────────────────
const { data: cartaData, error } = await supa
  .from('carta')
  .select('id, cod_softland, codigo_toteat, nombre, categoria, activo')
  .eq('activo', true);
if (error) throw error;

const cartaByKey = new Map();
for (const p of cartaData) {
  const key = `${norm(p.categoria)}||${norm(p.nombre)}`;
  cartaByKey.set(key, p);
}

// ── 3. Preparar updates de importacion ──────────────────────────
const updates = [];
for (const f of filasAImportar) {
  const plato = cartaByKey.get(f.key);
  if (!plato) {
    console.log(`  ! No encontrado en carta (revisar): ${f.plato} (${f.categoria})`);
    continue;
  }
  updates.push({ id: plato.id, nombre: plato.nombre, cod_softland: f.id, codigo_toteat: f.id_toteat });
}

// ── 4. Preparar limpiezas ───────────────────────────────────────
const limpiezas = [];
for (const l of LIMPIAR) {
  const key = `${norm(l.categoria)}||${norm(l.plato)}`;
  const plato = cartaByKey.get(key);
  if (!plato) { console.log(`  ! No encontrado para limpiar: ${l.plato} (${l.categoria})`); continue; }
  limpiezas.push({ id: plato.id, nombre: plato.nombre });
}

// ── 5. Verificar que no queden duplicados tras aplicar todo ────
const codigoFinal = new Map(); // id_toteat -> plato
for (const p of cartaData) {
  const limpiar = limpiezas.some(l => l.id === p.id);
  const actualizado = updates.find(u => u.id === p.id);
  const code = limpiar ? null : (actualizado ? actualizado.codigo_toteat : p.codigo_toteat);
  if (!code) continue;
  const key = code.trim().toUpperCase();
  if (codigoFinal.has(key)) {
    console.log(`\n!! ADVERTENCIA: codigo_toteat ${key} quedaria duplicado entre "${codigoFinal.get(key)}" y "${p.nombre}". Abortando.`);
    process.exit(1);
  }
  codigoFinal.set(key, p.nombre);
}
console.log('\nVerificacion OK: no quedan codigo_toteat duplicados tras aplicar los cambios.');

console.log(`\nResumen: ${updates.length} platos a completar, ${limpiezas.length} platos a limpiar.`);

if (DRY_RUN) {
  console.log('\n--- DRY RUN, no se escribio nada ---');
  process.exit(0);
}

// ── 6. Escribir ──────────────────────────────────────────────────
let ok = 0, fail = 0;
for (const u of updates) {
  const { error: e } = await supa.from('carta').update({ cod_softland: u.cod_softland, codigo_toteat: u.codigo_toteat }).eq('id', u.id);
  if (e) { console.error('  x', u.nombre, e.message); fail++; } else { ok++; }
}
for (const l of limpiezas) {
  const { error: e } = await supa.from('carta').update({ cod_softland: null, codigo_toteat: null }).eq('id', l.id);
  if (e) { console.error('  x (limpieza)', l.nombre, e.message); fail++; } else { ok++; console.log(`  limpiado: ${l.nombre}`); }
}
console.log(`\nOperaciones OK: ${ok} | Fallidas: ${fail}`);
