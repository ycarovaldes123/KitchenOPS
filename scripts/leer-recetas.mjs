import XLSX from 'xlsx';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(__dirname, '../../Reporteria de Costos/Recetas Torobayo Actualizadas.xlsx');

const wb = XLSX.readFile(FILE);
console.log(`\nHojas (${wb.SheetNames.length}): ${wb.SheetNames.join(', ')}\n`);

for (const name of wb.SheetNames) {
  const ws   = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows.length) { console.log(`── ${name}: vacía\n`); continue; }
  const total = rows.length - 1;
  console.log(`── ${name} (${total} filas) ──────────────────────`);
  // Imprimir cabecera + primeras 6 filas
  rows.slice(0, 7).forEach((r, i) => {
    console.log(`  [${i}] ${r.join(' | ')}`);
  });
  console.log('');
}
