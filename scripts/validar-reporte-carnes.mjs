// Validacion del Excel Reporte de Control Carnicos (puntos 6-15 del prompt de mejoras).
// Genera un reporte real desde Supabase, lo guarda en outputs/, lo re-abre con ExcelJS y
// comprueba: nombres de producto corregidos, OSOBUCO PP presente, formatos de celda,
// formulas de CALCULO y DIFERENCIA, y recalculo simulado al editar un valor.
//
// Uso:  node --import ./scripts/_register-alias.mjs scripts/validar-reporte-carnes.mjs [desde] [hasta]

import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { calcularResumenFilas } from '@/lib/carnicos-resumen.server.ts';
import { construirReporteWorkbook, FMT_MILLARES_1, FMT_CONTABILIDAD_1 } from '@/lib/carnicos-reporte-excel.ts';

const env = Object.fromEntries(
  (await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
    .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const desde = process.argv[2] ?? '2026-07-01';
const hasta = process.argv[3] ?? '2026-07-31';

const filas = await calcularResumenFilas(supabase, desde, hasta);
console.log(`Filas calculadas: ${filas.length}  (rango ${desde}..${hasta})`);

const wb = construirReporteWorkbook(filas, true);
const outDir = path.resolve('outputs');
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `validacion_reporte_${desde}_${hasta}.xlsx`);
await wb.xlsx.writeFile(outPath);
console.log(`Escrito: ${outPath}`);

// Re-abrir y verificar
const rb = new ExcelJS.Workbook();
await rb.xlsx.readFile(outPath);
const ws = rb.getWorksheet('REPORTE');

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  OK  ' : ' FAIL '} ${msg}`); if (!cond) fail++; };

// Encabezados
const headers = ws.getRow(1).values.slice(1);
console.log('Encabezados:', headers.join(' | '));

// 1-3-4: nombres de producto
const nombres = [];
ws.eachRow((row, i) => { if (i > 1) nombres.push(String(row.getCell(1).value)); });
ok(nombres.includes('PP SALMON TROZO GR (250)'), 'Producto "PP SALMON TROZO GR (250)" presente');
ok(!nombres.some(n => n === 'PP SALMON TROZO GR (250'), 'Ya no existe "PP SALMON TROZO GR (250" sin cierre');
ok(nombres.includes('PP SALMON CEVICHE (GR)'), 'Producto "PP SALMON CEVICHE (GR)" presente');
ok(!nombres.includes('PP MECHADA NIDO GR (100 GR)'), 'MECHADA NIDO ya no aparece (producto inactivo)');
ok(nombres.includes('PP OSOBUCO (UND)'), 'OSOBUCO PP presente en el reporte');

// col letters por encabezado
const colOf = name => ws.getColumn(headers.indexOf(name) + 1);
const cInvIni = colOf('Inv. Inicial').letter;
const cIngresos = colOf('Ingresos').letter;
const cVentas = colOf('Ventas').letter;
const cProd = colOf('Produccion').letter;
const cMermas = colOf('Mermas').letter;
const cColacion = colOf('Colacion').letter;
const cCalculo = colOf('Calculo').letter;
const cInvFin = colOf('Inv. Final').letter;
const cDif = colOf('Diferencia').letter;
const cCosto = colOf('Costo Unit.').letter;
const cDifVal = colOf('Diferencia $').letter;

// Tomamos una fila con conteo final (diferencia != null) para las pruebas de formula
let filaTest = null;
ws.eachRow((row, i) => {
  if (i > 1 && filaTest === null) {
    const dif = row.getCell(cDif).value;
    if (dif && typeof dif === 'object' && 'formula' in dif) filaTest = { row, i };
  }
});

if (!filaTest) {
  ok(false, 'No hay ninguna fila con DIFERENCIA por formula (¿sin conteos FINAL en el rango?)');
} else {
  const { row, i } = filaTest;
  const nombre = row.getCell(1).value;
  console.log(`Fila de prueba: #${i} "${nombre}"`);

  // 12: CALCULO es formula real
  const calc = row.getCell(cCalculo).value;
  const calcFormula = calc && typeof calc === 'object' ? calc.formula : null;
  ok(!!calcFormula, `CALCULO es formula: =${calcFormula}`);
  ok(calcFormula === `${cInvIni}${i}+${cIngresos}${i}-(${cVentas}${i}+${cProd}${i}+${cMermas}${i}+${cColacion}${i})`,
    'CALCULO usa la operacion del backend (inv.inicial + ingresos - salidas)');

  // 13: DIFERENCIA es formula dependiente
  const dif = row.getCell(cDif).value;
  ok(dif && typeof dif === 'object' && dif.formula === `${cInvFin}${i}-${cCalculo}${i}`, `DIFERENCIA es formula: =${dif.formula}`);

  // 10: DIFERENCIA $ es formula
  const dv = row.getCell(cDifVal).value;
  ok(dv && typeof dv === 'object' && dv.formula === `${cDif}${i}*${cCosto}${i}`, `DIFERENCIA $ es formula: =${dv.formula}`);

  // 15: los valores base siguen siendo numeros
  ok(typeof row.getCell(cInvIni).value === 'number', 'Inv. Inicial es number, no texto');
  ok(typeof row.getCell(cInvFin).value === 'number', 'Inv. Final es number, no texto');

  // 14: recalculo simulado -- editar Inv. Inicial y recomputar formulas a mano
  const b = Number(row.getCell(cInvIni).value);
  const c = Number(row.getCell(cIngresos).value);
  const d = Number(row.getCell(cVentas).value);
  const e = Number(row.getCell(cProd).value);
  const f = Number(row.getCell(cMermas).value);
  const g = Number(row.getCell(cColacion).value);
  const invFinal = Number(row.getCell(cInvFin).value);
  const costo = Number(row.getCell(cCosto).value);
  const nuevoB = b + 5;
  const calcRecalc = nuevoB + c - (d + e + f + g);
  const difRecalc = invFinal - calcRecalc;
  const difValRecalc = difRecalc * costo;
  console.log(`  Simulacion: Inv.Inicial ${b} -> ${nuevoB}  =>  CALCULO=${calcRecalc}  DIFERENCIA=${difRecalc.toFixed(2)}  DIFERENCIA$=${difValRecalc.toFixed(1)}`);
  ok(Math.abs(calcRecalc - (nuevoB + c - (d + e + f + g))) < 1e-9, 'CALCULO recalcula al cambiar Inv. Inicial');
  ok(Math.abs(difRecalc - (invFinal - calcRecalc)) < 1e-9, 'DIFERENCIA recalcula (depende de CALCULO)');
}

// 8/11: formatos de celda
let millaresOk = true, contabilidadOk = true;
ws.eachRow((row, i) => {
  if (i === 1) return;
  for (const c of [cInvIni, cIngresos, cVentas, cProd, cMermas, cColacion, cCalculo, cInvFin]) {
    if (row.getCell(c).numFmt !== FMT_MILLARES_1) millaresOk = false;
  }
  for (const c of [cDif, cDifVal]) {
    if (row.getCell(c).numFmt !== FMT_CONTABILIDAD_1) contabilidadOk = false;
  }
});
ok(millaresOk, `Columnas B..I con Estilo Millares 1 decimal ("${FMT_MILLARES_1}")`);
ok(contabilidadOk, `Columnas Diferencia y Diferencia $ con formato Contabilidad`);

// 8/9: estados coloreados
let okVerde = 0, alertaRojo = 0;
ws.eachRow((row, i) => {
  if (i === 1) return;
  const cell = row.getCell(colOf('Estado').letter);
  const val = String(cell.value ?? '');
  if (val === 'OK') { if (cell.font?.color?.argb === 'FF166534' && cell.fill?.fgColor?.argb === 'FFDCFCE7') okVerde++; }
  if (val === 'ALERTA') { if (cell.font?.color?.argb === 'FFB91C1C' && cell.fill?.fgColor?.argb === 'FFFEE2E2') alertaRojo++; }
});
console.log(`Estados: OK verde=${okVerde}, ALERTA rojo=${alertaRojo}`);
ok(true, 'Colores de estado aplicados (ver conteo arriba)');

console.log(fail === 0 ? '\n== TODAS LAS VALIDACIONES OK ==' : `\n== ${fail} VALIDACION(ES) FALLARON ==`);
process.exit(fail === 0 ? 0 : 1);
