// Completa cod_softland y codigo_toteat en `carta` a partir de la hoja
// "VENTAS DEL MES" de VENTAS INVENTARIO.xlsx, cruzando por nombre de plato
// normalizado. Solo actualiza platos cuyo nombre calza exacto y sin ambiguedad
// (ni en el Excel ni en la propia tabla carta), y que hoy tienen el campo
// vacio en la DB (nunca sobrescribe un valor existente que difiera).
//
// Al final genera un Excel con los platos que quedaron sin ID / ID TOTEAT,
// para completarlos a mano.
import ExcelJS from 'exceljs';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');
const EXCEL_ORIGEN = 'C:/Users/kunstmann/Desktop/SaaS/KitchenOPS/VENTAS INVENTARIO.xlsx';
const CARPETA_SALIDA = 'C:/Users/kunstmann/Desktop/SaaS/KitchenOPS';

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

// ── 1. Leer Excel origen ──────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(EXCEL_ORIGEN);
const ws = wb.getWorksheet('VENTAS DEL MES');

const excelByName = new Map();
for (let r = 2; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const softland = row.getCell(3).value;
  const toteat = row.getCell(4).value;
  const nombre = row.getCell(5).value;
  if (!nombre) continue;
  const key = norm(nombre);
  const entry = {
    softland: softland != null ? String(softland).trim() : null,
    toteat: toteat != null ? String(toteat).trim() : null,
    nombre: String(nombre).trim(),
  };
  if (excelByName.has(key)) excelByName.get(key).push(entry);
  else excelByName.set(key, [entry]);
}

// ── 2. Leer carta ──────────────────────────────────────────────
const { data: cartaData, error } = await supa
  .from('carta')
  .select('id, cod_softland, codigo_toteat, nombre, categoria, activo')
  .eq('activo', true);
if (error) throw error;

const nombresDuplicadosEnCarta = new Set();
{
  const conteo = new Map();
  for (const p of cartaData) {
    const key = norm(p.nombre);
    conteo.set(key, (conteo.get(key) ?? 0) + 1);
  }
  for (const [key, n] of conteo.entries()) if (n > 1) nombresDuplicadosEnCarta.add(key);
}

// ── 3. Calcular actualizaciones y pendientes ───────────────────
const paraActualizar = [];
const pendientes = []; // platos que quedan sin ID y/o ID TOTEAT completos

for (const plato of cartaData) {
  const key = norm(plato.nombre);
  const tieneSoftland = !!String(plato.cod_softland ?? '').trim();
  const tieneToteat = !!String(plato.codigo_toteat ?? '').trim();

  if (nombresDuplicadosEnCarta.has(key)) {
    if (!tieneSoftland || !tieneToteat) {
      pendientes.push({ plato, motivo: 'Nombre duplicado en carta (hay 2+ platos con el mismo nombre); no se puede saber cual codigo TOTEAT le corresponde a cada uno.' });
    }
    continue;
  }

  const candidatos = excelByName.get(key);
  if (!candidatos || candidatos.length !== 1) {
    if (!tieneSoftland || !tieneToteat) {
      pendientes.push({ plato, motivo: candidatos ? 'Nombre ambiguo en VENTAS DEL MES (aparece mas de una vez)' : 'No aparece en VENTAS DEL MES del Excel' });
    }
    continue;
  }

  const excelRow = candidatos[0];
  if (!excelRow.softland || !excelRow.toteat) {
    if (!tieneSoftland || !tieneToteat) {
      pendientes.push({ plato, motivo: 'Fila en VENTAS DEL MES sin SOFTLAND o TOTEAT completo' });
    }
    continue;
  }

  if (tieneSoftland && String(plato.cod_softland).trim() !== excelRow.softland) {
    pendientes.push({ plato, motivo: `cod_softland en DB (${plato.cod_softland}) difiere del Excel (${excelRow.softland})` });
    continue;
  }
  if (tieneToteat && String(plato.codigo_toteat).trim() !== excelRow.toteat) {
    pendientes.push({ plato, motivo: `codigo_toteat en DB (${plato.codigo_toteat}) difiere del Excel (${excelRow.toteat})` });
    continue;
  }
  if (tieneSoftland && tieneToteat) continue; // ya estaba completo y coincide

  paraActualizar.push({
    id: plato.id,
    nombre: plato.nombre,
    cod_softland: tieneSoftland ? plato.cod_softland : excelRow.softland,
    codigo_toteat: tieneToteat ? plato.codigo_toteat : excelRow.toteat,
  });
}

console.log(`Platos a actualizar: ${paraActualizar.length}`);
console.log(`Platos que quedaran pendientes (para el Excel de faltantes): ${pendientes.length}`);

// Verificacion de no-duplicados tras la actualizacion
const toteatFinal = new Map();
for (const p of cartaData) {
  const actualizado = paraActualizar.find(u => u.id === p.id);
  const code = actualizado ? actualizado.codigo_toteat : p.codigo_toteat;
  if (!code) continue;
  const key = String(code).trim().toUpperCase();
  toteatFinal.set(key, (toteatFinal.get(key) ?? 0) + 1);
}
const dupes = [...toteatFinal.entries()].filter(([, n]) => n > 1);
if (dupes.length) {
  console.log('\n!! ADVERTENCIA: codigo_toteat quedaria duplicado, abortando escritura:', dupes);
  process.exit(1);
}

if (DRY_RUN) {
  console.log('\n--- DRY RUN, no se escribio nada en la DB ni se genero Excel ---');
  process.exit(0);
}

// ── 4. Escribir actualizaciones ─────────────────────────────────
let ok = 0, fail = 0;
for (const u of paraActualizar) {
  const { error: errUpd } = await supa
    .from('carta')
    .update({ cod_softland: u.cod_softland, codigo_toteat: u.codigo_toteat })
    .eq('id', u.id);
  if (errUpd) {
    console.error('  x', u.nombre, errUpd.message);
    fail++;
  } else {
    ok++;
  }
}
console.log(`\nActualizados OK: ${ok} | Fallidos: ${fail}`);

// ── 5. Generar Excel de pendientes (releer carta para tener datos frescos) ──
const { data: cartaFresca } = await supa
  .from('carta')
  .select('id, cod_softland, codigo_toteat, nombre, categoria, activo')
  .eq('activo', true)
  .order('categoria')
  .order('nombre');

const pendientesFinal = (cartaFresca ?? []).filter(p => !p.cod_softland || !p.codigo_toteat);
const motivoPorId = new Map(pendientes.map(x => [x.plato.id, x.motivo]));

const wbOut = new ExcelJS.Workbook();
const wsOut = wbOut.addWorksheet('Codigos faltantes');
wsOut.columns = [
  { header: 'CATEGORIA', key: 'categoria', width: 22 },
  { header: 'PLATO', key: 'plato', width: 40 },
  { header: 'ID (cod_softland)', key: 'id', width: 18 },
  { header: 'ID TOTEAT (codigo_toteat)', key: 'id_toteat', width: 22 },
  { header: 'OBSERVACION', key: 'observacion', width: 45 },
];
wsOut.getRow(1).font = { bold: true };
wsOut.autoFilter = { from: 'A1', to: 'E1' };
wsOut.views = [{ state: 'frozen', ySplit: 1 }];
wsOut.getColumn('id').numFmt = '@';
wsOut.getColumn('id_toteat').numFmt = '@';

for (const p of pendientesFinal) {
  wsOut.addRow({
    categoria: p.categoria,
    plato: p.nombre,
    id: p.cod_softland ?? '',
    id_toteat: p.codigo_toteat ?? '',
    observacion: motivoPorId.get(p.id) ?? 'No aparece en VENTAS DEL MES del Excel',
  });
}

const nombreArchivo = `${CARPETA_SALIDA}/productos_faltantes_codigo_toteat_${fechaHoy()}.xlsx`;
await wbOut.xlsx.writeFile(nombreArchivo);
console.log(`\nExcel de pendientes generado: ${nombreArchivo}`);
console.log(`Total platos activos que aun requieren completar ID / ID TOTEAT: ${pendientesFinal.length}`);
