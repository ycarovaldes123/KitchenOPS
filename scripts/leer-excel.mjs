/**
 * Lee el Excel de la base de datos legada e imprime la estructura de cada hoja
 * Uso:  node scripts/leer-excel.mjs
 */

import XLSX from 'xlsx';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = path.resolve(
  __dirname,
  '../../PEDIDOS PRODUCCION EN PROCESO 2026  (1).xlsx'
);

const wb = XLSX.readFile(EXCEL_PATH);

console.log(`\n📊 Archivo: ${path.basename(EXCEL_PATH)}`);
console.log(`📋 Hojas (${wb.SheetNames.length}): ${wb.SheetNames.join(', ')}\n`);

for (const sheetName of wb.SheetNames) {
  const ws   = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (rows.length === 0) {
    console.log(`── ${sheetName}: vacía`);
    continue;
  }

  const headers = rows[0];
  const total   = rows.length - 1;

  console.log(`── ${sheetName} ──────────────────────────────────`);
  console.log(`   Columnas (${headers.length}): ${headers.join(' | ')}`);
  console.log(`   Filas de datos: ${total}`);

  // Mostrar primeras 3 filas como muestra
  const muestra = rows.slice(1, 4);
  muestra.forEach((row, i) => {
    console.log(`   Fila ${i + 1}: ${row.slice(0, 8).join(' | ')}`);
  });
  console.log('');
}
