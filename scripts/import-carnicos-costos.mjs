// Importa el costo unitario de cada producto carnico desde "Costo unitario.xlsx"
// (planilla general de costos por Cod. Producto, no solo carnicos) hacia
// carnicos_productos.costo_unitario, cruzando por codigo. Idempotente: re-ejecutable.
// Requiere haber corrido antes scripts/supabase_carnicos_costo_unitario.sql.
//
// Uso:
//   node scripts/import-carnicos-costos.mjs           -> escribe en Supabase
//   node scripts/import-carnicos-costos.mjs --dry-run -> solo imprime el resumen

import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const DRY_RUN = process.argv.includes('--dry-run');

async function loadEnv() {
  const text = await fs.readFile('.env.local', 'utf8').catch(() => '');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter(line => line && !line.trim().startsWith('#') && line.includes('='))
      .map(line => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
}

function normCodigo(value) {
  return String(value ?? '').trim();
}

async function main() {
  const env = await loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!DRY_RUN && (!supabaseUrl || !serviceKey)) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  }
  const supabase = DRY_RUN ? null : createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const costoPath = path.resolve('..', 'Costo unitario.xlsx');
  const wbCosto = XLSX.readFile(costoPath);
  const costoRows = XLSX.utils.sheet_to_json(wbCosto.Sheets[wbCosto.SheetNames[0]], { defval: null });

  const costoPorCodigo = new Map();
  for (const row of costoRows) {
    const codigo = normCodigo(row['Cod. Producto']);
    const costo = Number(row['Costo Unit.']);
    if (codigo && Number.isFinite(costo)) costoPorCodigo.set(codigo, costo);
  }

  const supabaseQuery = DRY_RUN ? null : await supabase.from('carnicos_productos').select('id,codigo,nombre,costo_unitario');
  if (supabaseQuery?.error) throw new Error(`Error al leer carnicos_productos: ${supabaseQuery.error.message}`);

  // En dry-run leemos igual desde BASE DE DATOS CARNES.xlsx (no requiere Supabase) solo para el reporte de cobertura.
  let productosCarnicos;
  if (DRY_RUN) {
    const wbCarnes = XLSX.readFile(path.resolve('..', 'BASE DE DATOS CARNES.xlsx'));
    const carnesRows = XLSX.utils.sheet_to_json(wbCarnes.Sheets[wbCarnes.SheetNames[0]], { defval: null });
    productosCarnicos = carnesRows.map(row => ({ codigo: normCodigo(row.CODIGO), nombre: String(row['PRODUCTO NOMBRE']).trim() }));
  } else {
    productosCarnicos = supabaseQuery.data ?? [];
  }

  const actualizaciones = [];
  const sinCosto = [];
  for (const p of productosCarnicos) {
    const costo = costoPorCodigo.get(normCodigo(p.codigo));
    if (costo === undefined) {
      sinCosto.push(`${p.codigo} - ${p.nombre}`);
      continue;
    }
    actualizaciones.push({ id: p.id, codigo: p.codigo, nombre: p.nombre, costo_unitario: costo });
  }

  console.log(`Productos carnicos: ${productosCarnicos.length}`);
  console.log(`Con costo encontrado en "Costo unitario.xlsx": ${actualizaciones.length}`);
  console.log(`Sin costo (quedan en 0, completar manualmente en Valorizacion): ${sinCosto.length}`);
  if (sinCosto.length) {
    console.log(sinCosto.map(s => `  - ${s}`).join('\n'));
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] No se escribio en Supabase.');
    return;
  }

  for (const p of actualizaciones) {
    const { error } = await supabase.from('carnicos_productos').update({ costo_unitario: p.costo_unitario }).eq('id', p.id);
    if (error) throw new Error(`Error actualizando costo de "${p.nombre}" (${p.codigo}): ${error.message}`);
  }

  console.log(`\nListo: ${actualizaciones.length} producto(s) actualizado(s) en carnicos_productos.costo_unitario.`);
}

main().catch(err => {
  console.error(err.message ?? err);
  process.exit(1);
});
