// Genera un Excel de VERIFICACION (no escribe nada en la DB) con todos los
// codigos que quedarian ocupados: los que ya estan en `carta` + los que el
// usuario completo a mano en productos_faltantes_codigo_toteat_*.xlsx.
// Ignora las filas que el usuario dejo en blanco. Marca duplicados de ID o
// ID TOTEAT para revisar antes de importar.
import ExcelJS from 'exceljs';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

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

function fechaHoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

// ── 1. Estado actual en carta ───────────────────────────────────
const { data: cartaData, error } = await supa
  .from('carta')
  .select('id, cod_softland, codigo_toteat, nombre, categoria, activo')
  .eq('activo', true)
  .order('categoria')
  .order('nombre');
if (error) throw error;

// ── 2. Leer lo que el usuario completo a mano ───────────────────
const wbIn = new ExcelJS.Workbook();
await wbIn.xlsx.readFile(ARCHIVO_PENDIENTES);
const wsIn = wbIn.worksheets[0];

// Clave por categoria+nombre (no solo nombre) porque hay nombres de plato
// repetidos en distintas categorias (ej. "TABLA CRIOLLA").
const completadosPorUsuario = new Map(); // "categoria||nombre normalizado" -> { id, id_toteat }
let filasIgnoradasEnBlanco = 0;
for (let r = 2; r <= wsIn.rowCount; r++) {
  const row = wsIn.getRow(r);
  const categoria = row.getCell(1).value;
  const plato = row.getCell(2).value;
  const id = row.getCell(3).value;
  const idToteat = row.getCell(4).value;
  if (!plato) continue;
  const idStr = id != null ? String(id).trim() : '';
  const idToteatStr = idToteat != null ? String(idToteat).trim() : '';
  if (!idStr || !idToteatStr) { filasIgnoradasEnBlanco++; continue; }
  const key = `${norm(categoria)}||${norm(plato)}`;
  completadosPorUsuario.set(key, { id: idStr, id_toteat: idToteatStr, plato: String(plato).trim() });
}
console.log(`Filas completadas por el usuario: ${completadosPorUsuario.size} | ignoradas por estar en blanco: ${filasIgnoradasEnBlanco}`);

// ── 3. Combinar: DB + lo recien completado (aun no escrito en DB) ──
const filas = [];
for (const p of cartaData) {
  const key = `${norm(p.categoria)}||${norm(p.nombre)}`;
  const yaEnDb = !!(p.cod_softland && p.codigo_toteat);
  const completado = completadosPorUsuario.get(key);

  if (yaEnDb) {
    filas.push({ categoria: p.categoria, plato: p.nombre, id: p.cod_softland, id_toteat: p.codigo_toteat, origen: 'Ya en base de datos' });
  } else if (completado) {
    filas.push({ categoria: p.categoria, plato: p.nombre, id: completado.id, id_toteat: completado.id_toteat, origen: 'Completado a mano (pendiente de importar)' });
  }
  // si no esta en ninguna de las dos, sigue faltando -> no entra en este reporte
}

// ── 4. Marcar duplicados ────────────────────────────────────────
const porId = new Map();
const porToteat = new Map();
for (const f of filas) {
  porId.set(f.id, (porId.get(f.id) ?? 0) + 1);
  porToteat.set(f.id_toteat, (porToteat.get(f.id_toteat) ?? 0) + 1);
}
for (const f of filas) {
  const dupId = porId.get(f.id) > 1;
  const dupToteat = porToteat.get(f.id_toteat) > 1;
  f.duplicado = dupId && dupToteat ? 'ID e ID TOTEAT duplicados'
    : dupId ? 'ID duplicado'
    : dupToteat ? 'ID TOTEAT duplicado'
    : '';
}

filas.sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.plato.localeCompare(b.plato, 'es'));

const totalDuplicados = filas.filter(f => f.duplicado).length;
console.log(`Total codigos ocupados a verificar: ${filas.length} | con posible duplicado: ${totalDuplicados}`);

// ── 5. Generar Excel ─────────────────────────────────────────────
const wbOut = new ExcelJS.Workbook();
const wsOut = wbOut.addWorksheet('Codigos ocupados');
wsOut.columns = [
  { header: 'CATEGORIA', key: 'categoria', width: 22 },
  { header: 'PLATO', key: 'plato', width: 40 },
  { header: 'ID (cod_softland)', key: 'id', width: 18 },
  { header: 'ID TOTEAT (codigo_toteat)', key: 'id_toteat', width: 22 },
  { header: 'ORIGEN', key: 'origen', width: 32 },
  { header: 'DUPLICADO?', key: 'duplicado', width: 22 },
];
wsOut.getRow(1).font = { bold: true };
wsOut.autoFilter = { from: 'A1', to: 'F1' };
wsOut.views = [{ state: 'frozen', ySplit: 1 }];
wsOut.getColumn('id').numFmt = '@';
wsOut.getColumn('id_toteat').numFmt = '@';

const ROJO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

for (const f of filas) {
  const row = wsOut.addRow(f);
  if (f.duplicado) row.eachCell(cell => { cell.fill = ROJO; });
}

const nombreArchivo = `${CARPETA}/codigos_ocupados_verificacion_${fechaHoy()}.xlsx`;
await wbOut.xlsx.writeFile(nombreArchivo);
console.log(`\nExcel generado: ${nombreArchivo}`);
