// Importa BASE DE DATOS CARNES.xlsx y BASE DE DATOS DE PLATOS.xlsx a Supabase
// (tablas carnicos_productos / carnicos_platos). Idempotente: re-ejecutable.
//
// Uso:
//   node scripts/import-carnicos-excel.mjs           -> escribe en Supabase
//   node scripts/import-carnicos-excel.mjs --dry-run -> solo imprime el resumen

import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const DRY_RUN = process.argv.includes('--dry-run');

const CARNES_HEADERS = ['TIPO', 'CODIGO', 'PRODUCTO NOMBRE', 'UNIDAD DE MEDIDA'];
const PLATOS_HEADERS = ['CATEGORIA', 'CODIGO TOTEAT', 'PLATOS', 'CODIGO', 'PRODUCTO NOMBRE', 'UNIDAD DE MEDIDA', 'CANTIDAD'];

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

function normNombre(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function assertHeaders(rows, expected, fileLabel) {
  const actual = Object.keys(rows[0] ?? {});
  const missing = expected.filter(h => !actual.includes(h));
  if (missing.length) {
    throw new Error(`${fileLabel}: faltan columnas esperadas: ${missing.join(', ')}. Columnas encontradas: ${actual.join(', ')}`);
  }
}

async function main() {
  const env = await loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!DRY_RUN && (!supabaseUrl || !serviceKey)) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  }
  const supabase = DRY_RUN ? null : createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const carnesPath = path.resolve('..', 'BASE DE DATOS CARNES.xlsx');
  const platosPath = path.resolve('..', 'BASE DE DATOS DE PLATOS.xlsx');

  const wbCarnes = XLSX.readFile(carnesPath);
  const carnesRows = XLSX.utils.sheet_to_json(wbCarnes.Sheets[wbCarnes.SheetNames[0]], { defval: null });
  assertHeaders(carnesRows, CARNES_HEADERS, 'BASE DE DATOS CARNES.xlsx');

  const productos = carnesRows.map(row => {
    const tipo = String(row.TIPO).trim().toUpperCase();
    return {
      tipo,
      codigo: String(row.CODIGO).trim(),
      nombre: String(row['PRODUCTO NOMBRE']).trim(),
      unidad_medida: String(row['UNIDAD DE MEDIDA']).trim().toUpperCase(),
      es_pp: tipo === 'PRODUCTOS PROCESADOS',
      activo: true,
    };
  });

  const nombreSet = new Set(productos.map(p => normNombre(p.nombre)));
  if (nombreSet.size !== productos.length) {
    throw new Error(`Se esperaba PRODUCTO NOMBRE unico en BASE DE DATOS CARNES.xlsx, pero hay ${productos.length - nombreSet.size} duplicado(s). Revisar el Excel antes de importar.`);
  }

  let productosInsertados = 0;
  let productosActualizados = 0;
  let nombreToId = new Map();

  if (!DRY_RUN) {
    const { data: existentes } = await supabase.from('carnicos_productos').select('nombre');
    const existentesSet = new Set((existentes ?? []).map(r => normNombre(r.nombre)));
    for (const p of productos) {
      if (existentesSet.has(normNombre(p.nombre))) productosActualizados++;
      else productosInsertados++;
    }

    const { error: upsertProductosError } = await supabase.from('carnicos_productos').upsert(productos, { onConflict: 'nombre' });
    if (upsertProductosError) throw new Error(`Error al insertar carnicos_productos: ${upsertProductosError.message}`);

    const { data: guardados, error: fetchError } = await supabase.from('carnicos_productos').select('id,nombre');
    if (fetchError) throw new Error(`Error al leer carnicos_productos: ${fetchError.message}`);
    nombreToId = new Map((guardados ?? []).map(r => [normNombre(r.nombre), r.id]));
  } else {
    nombreToId = new Map(productos.map(p => [normNombre(p.nombre), `dry-${normNombre(p.nombre)}`]));
    productosInsertados = productos.length;
  }

  const wbPlatos = XLSX.readFile(platosPath);
  const platosRows = XLSX.utils.sheet_to_json(wbPlatos.Sheets[wbPlatos.SheetNames[0]], { defval: null });
  assertHeaders(platosRows, PLATOS_HEADERS, 'BASE DE DATOS DE PLATOS.xlsx');

  const advertencias = [];
  const platos = platosRows.map(row => {
    const productoNombre = String(row['PRODUCTO NOMBRE']).trim();
    const key = normNombre(productoNombre);
    const producto_id = nombreToId.get(key) ?? null;
    let advertencia = null;
    if (!producto_id) {
      advertencia = 'Sin coincidencia por PRODUCTO NOMBRE en BASE DE DATOS CARNES';
      advertencias.push({
        codigo_toteat: String(row['CODIGO TOTEAT']).trim(),
        plato_nombre: String(row.PLATOS).trim(),
        codigo: String(row.CODIGO).trim(),
        producto_nombre: productoNombre,
        motivo: advertencia,
      });
    }
    return {
      categoria: String(row.CATEGORIA).trim().toUpperCase(),
      codigo_toteat: String(row['CODIGO TOTEAT']).trim(),
      plato_nombre: String(row.PLATOS).trim(),
      producto_id,
      codigo_producto: String(row.CODIGO).trim(),
      producto_nombre: productoNombre,
      unidad_medida: String(row['UNIDAD DE MEDIDA']).trim().toUpperCase(),
      cantidad: Number(row.CANTIDAD),
      advertencia,
      activo: true,
    };
  });

  let platosInsertados = 0;
  let platosActualizados = 0;

  if (!DRY_RUN) {
    const { data: existentesPlatos } = await supabase.from('carnicos_platos').select('codigo_toteat,producto_nombre');
    const existentesPlatosSet = new Set((existentesPlatos ?? []).map(r => `${r.codigo_toteat}||${r.producto_nombre}`));
    for (const p of platos) {
      if (existentesPlatosSet.has(`${p.codigo_toteat}||${p.producto_nombre}`)) platosActualizados++;
      else platosInsertados++;
    }
    const { error: upsertPlatosError } = await supabase.from('carnicos_platos').upsert(platos, { onConflict: 'codigo_toteat,producto_nombre' });
    if (upsertPlatosError) throw new Error(`Error al insertar carnicos_platos: ${upsertPlatosError.message}`);
  } else {
    platosInsertados = platos.length;
  }

  console.log('');
  console.log('== Resumen import Control Carnicos ==');
  console.log(`carnicos_productos: ${productos.length} filas (${productosInsertados} insertadas, ${productosActualizados} actualizadas)`);
  console.log(`carnicos_platos: ${platos.length} filas (${platosInsertados} insertadas, ${platosActualizados} actualizadas)`);
  console.log(`ADVERTENCIAS (${advertencias.length}):`);
  for (const a of advertencias) {
    console.log(`  - ${a.codigo_toteat} "${a.plato_nombre}" -> codigo ${a.codigo} / "${a.producto_nombre}": ${a.motivo}`);
  }
  if (DRY_RUN) console.log('(dry-run: no se escribio nada en Supabase)');
}

main().catch(err => {
  console.error('Error en import-carnicos-excel:', err.message);
  process.exit(1);
});
