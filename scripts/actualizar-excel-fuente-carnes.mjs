// Sincroniza los Excel fuente (BASE DE DATOS CARNES.xlsx / BASE DE DATOS DE PLATOS.xlsx)
// con las mejoras 2026-09, para que una re-importacion (scripts/import-carnicos-excel.mjs)
// no revierta los cambios. Hace copia .bak-2026-09 antes de escribir.

import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const CARNES = path.resolve('..', 'BASE DE DATOS CARNES.xlsx');
const PLATOS = path.resolve('..', 'BASE DE DATOS DE PLATOS.xlsx');

for (const f of [CARNES, PLATOS]) {
  const bak = f.replace(/\.xlsx$/, ` .bak-2026-09.xlsx`);
  if (!fs.existsSync(bak)) fs.copyFileSync(f, bak);
}

const MECHADA_100 = 'PP MECHADA 100 GR RENDIMIENTO = 0.5 PP PLATEADA';

// ── CARNES ────────────────────────────────────────────────────────────────
{
  const wb = XLSX.readFile(CARNES);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sh, { defval: null });
  const out = [];
  let osobucoYa = false;
  for (const r of rows) {
    const nombre = String(r['PRODUCTO NOMBRE'] ?? '').trim();
    if (nombre === 'PP MECHADA NIDO GR (100 GR)') continue; // se elimina: ahora inactivo
    if (nombre === 'PP SALMON TROZO GR (250') r['PRODUCTO NOMBRE'] = 'PP SALMON TROZO GR (250)';
    if (nombre === 'PP SALMON CEVICHE GR') r['PRODUCTO NOMBRE'] = 'PP SALMON CEVICHE (GR)';
    if (nombre === 'PP OSOBUCO (UND)') osobucoYa = true;
    out.push(r);
  }
  if (!osobucoYa) {
    out.push({ TIPO: 'PRODUCTOS PROCESADOS', CODIGO: '0301042', 'PRODUCTO NOMBRE': 'PP OSOBUCO (UND)', 'UNIDAD DE MEDIDA': 'UN' });
  }
  const ns = XLSX.utils.json_to_sheet(out, { header: ['TIPO', 'CODIGO', 'PRODUCTO NOMBRE', 'UNIDAD DE MEDIDA'] });
  wb.Sheets[wb.SheetNames[0]] = ns;
  XLSX.writeFile(wb, CARNES);
  console.log(`CARNES: ${out.length} filas escritas`);
}

// ── PLATOS ────────────────────────────────────────────────────────────────
{
  const wb = XLSX.readFile(PLATOS);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sh, { defval: null });
  const header = ['CATEGORIA', 'CODIGO TOTEAT', 'PLATOS', 'CODIGO', 'PRODUCTO NOMBRE', 'UNIDAD DE MEDIDA', 'CANTIDAD'];
  let osobucoYa = false;
  for (const r of rows) {
    const nombre = String(r['PRODUCTO NOMBRE'] ?? '').trim();
    if (nombre === 'PP SALMON TROZO GR (250') r['PRODUCTO NOMBRE'] = 'PP SALMON TROZO GR (250)';
    if (nombre === 'PP SALMON CEVICHE GR') r['PRODUCTO NOMBRE'] = 'PP SALMON CEVICHE (GR)';
    if (nombre === 'PP MECHADA NIDO GR (100 GR)') {
      r['PRODUCTO NOMBRE'] = MECHADA_100;
      r['CODIGO'] = '0502031';
      r['UNIDAD DE MEDIDA'] = 'PR';
    }
    if (String(r['CODIGO TOTEAT'] ?? '').trim() === 'K15041') osobucoYa = true;
  }
  if (!osobucoYa) {
    rows.push({
      CATEGORIA: 'PLATOS', 'CODIGO TOTEAT': 'K15041', PLATOS: 'OSOBUCO CON PASTELERA DE CHOCLO',
      CODIGO: '0301042', 'PRODUCTO NOMBRE': 'PP OSOBUCO (UND)', 'UNIDAD DE MEDIDA': 'UN', CANTIDAD: 1,
    });
  }
  const ns = XLSX.utils.json_to_sheet(rows, { header });
  wb.Sheets[wb.SheetNames[0]] = ns;
  XLSX.writeFile(wb, PLATOS);
  console.log(`PLATOS: ${rows.length} filas escritas`);
}
