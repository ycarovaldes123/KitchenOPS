/**
 * Migra la carta completa desde:
 *   - SEMAFORO sheet del Excel  → tabla carta (nombre, categoria, precio_carta)
 *   - Hojas categoría del Excel → cod_softland por plato
 *   - FICHAS del HTML           → carta_ingredientes
 *
 * Uso: node scripts/migrar-carta.mjs [--dry-run]
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { randomUUID }   from 'node:crypto';
import * as fs          from 'node:fs';
import * as path        from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN   = process.argv.includes('--dry-run');

const SUPABASE_URL = 'https://fqiqagesrujcmbjnbkqr.supabase.co';
const SERVICE_KEY  =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxaXFhZ2VzcnVqY21iam5ia3FyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzI3ODkyMywiZXhwIjoyMDkyODU0OTIzfQ.Yn-SI-siVI0bNiofABD8bbTjE_dfbevMMi2CbuadPV0';

const EXCEL = path.resolve(__dirname, '../../Reporteria de Costos/Recetas Torobayo Actualizadas.xlsx');
const HTML  = path.resolve(__dirname, '../../Reporteria de Costos/reporteria_costos_kunstmann_v4.html');

const supa = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Platos ELIMINADOS de carta (no incluir) ─────────────────────
const ELIMINADOS = new Set([
  '3 EMPANADAS QUESO CENTOLLA',
  '3 EMPANADAS QUESO CENTOLLA N',
  '3 EMPANADAS DE QUESO - CENTOLLA',
  'FETTUCCINI DE LA COSTA',
  'FETTUCCINE DE LA COSTA',
]);

// ── Aliases: nombre en SEMAFORO → nombre real en hojas de categoría ─
// Para cruzar cuando los nombres difieren entre ambas fuentes
const NOMBRE_ALIASES = {
  'ENTRAÑA':               'ENTRAÑAS',
  'MALAYA DE CERDO':       'MALAYA',
  'MENU NIÑO POLLO':       'MENU POLLO',
  'MENU NIÑO SALCHICHAS':  'MENU SALCHICHA',
  'FETUCCINI A LA BOLOGNESA': 'FETUCCINI BOLOÑESA',
  'FETUCCINI SALSA FUNJI': 'FETUCCINE FUNJI',
  'HAMBURGUESA ITALIANA':  'HAMBURGESA ITALIANA',
  'VEGGIEBURGER':          'VEGGIE BURGER',
  'CLASSIC SMASH BURGER':  'CLASSIC SMASH BURGUER',
  'VEGGIEBURGER ITALIANA': 'VEGGIE ITALIANA',
  'TARTAR DE RES':         'TAR TAR DE RES',
  'PORCION HAMBURGUESA':   'PORCION HAMBURGUESA UND',
  'PORCION FILETE DE POLLO SANDWICH': 'FILETE POLLO SANDWICH',
};

function normNombre(s) {
  return String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}

// ── 1. Leer FICHAS del HTML (ingredientes por cod_softland) ──────
console.log('\n📄 Extrayendo FICHAS del HTML...');
const htmlContent = fs.readFileSync(HTML, 'utf8');
const fichasStart = htmlContent.indexOf('const FICHAS = {');
const fichasEnd   = htmlContent.indexOf('};', fichasStart) + 2;
const fichasRaw   = htmlContent.substring(fichasStart + 'const FICHAS = '.length, fichasEnd - 1);

let FICHAS = {};
try {
  FICHAS = JSON.parse(fichasRaw);
  console.log(`  ✅ FICHAS: ${Object.keys(FICHAS).length} platos con ingredientes`);
} catch (e) {
  console.error('  ✗ Error parseando FICHAS:', e.message);
  process.exit(1);
}

// ── 2. Leer el Excel ─────────────────────────────────────────────
console.log('\n📊 Leyendo Excel...');
const wb = XLSX.readFile(EXCEL);

function sheetRows(name) {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

// ── 3. Extraer cod_softland por plato de las hojas de categorías ─
// Cada receta comienza con: [cod_softland | nombre_plato | 'U/M' | 'CANTIDAD' | 'PRECIO' | ...]
// Las filas de ingredientes siguen debajo. Una fila vacía separa recetas.

const CAT_SHEETS = {
  'PICADAS':               'PICADAS',
  'PLATOS':                'CLÁSICOS',
  'SANDWICHS':             'SANDWICH & BURGERS',
  'ENSALADAS':             'ENSALADAS',
  'CATERING':              'CATERING',
  'AGREGADOS Y PORCIONES': 'AGREGADOS',
};

// cod_softland → nombre normalizado del plato
const codNombreMap = {};

for (const [sheetName, categoria] of Object.entries(CAT_SHEETS)) {
  const rows = sheetRows(sheetName);
  for (const row of rows) {
    const col1 = String(row[1] ?? '').trim();
    const col2 = String(row[2] ?? '').trim();
    const col3 = String(row[3] ?? '').trim().toUpperCase();
    // Encabezado de receta: col1 = cod 6xxxxxxx, col3 = 'U/M'
    if (/^6\d{6}$/.test(col1) && col3 === 'U/M' && col2) {
      codNombreMap[col1] = { nombre: normNombre(col2), categoria, cod: col1 };
    }
  }
}
console.log(`  ✅ cod_softland encontrados: ${Object.keys(codNombreMap).length}`);

// ── 4. Parsear hoja SEMAFORO para obtener nombre + precio + costo ─
// Estructura: secciones por categoría, cada fila = un plato
// Col 0: nombre, Col 1: costo_neto, Col 2: precio_carta

const semRows = sheetRows('SEMAFORO');

// Detectar qué categoría corresponde a cada fila
// Las filas de sección tienen: col1=categoria_nombre, col2="Costo por receta"
// POSTRES excluido: el SEMAFORO lo usa para propuestas/duplicados, no para postres reales
const SECCION_HEADERS = new Set([
  'PICADAS','CLASICOS','CLÁSICOS','SANDWICH & BURGERS','SANDWICHS',
  'ENSALADAS','CATERING','PASTELERIA','PASTELERÍA',
  'AGREGADOS','AGREGADOS Y PORCIONES','INNOVACIONES',
]);

let currentCat = '';
const platosData = []; // { nombre, categoria, precio_carta, costo_neto }

for (const row of semRows) {
  const c1 = normNombre(row[1]);
  const c2 = String(row[2] ?? '').trim();

  // Detectar cabecera de sección: col1=nombre sección, col2 contiene "costo"
  if (SECCION_HEADERS.has(c1) && c2.toLowerCase().includes('costo')) {
    if (c1 === 'CLASICOS' || c1 === 'CLÁSICOS') currentCat = 'CLÁSICOS';
    else if (c1 === 'SANDWICHS') currentCat = 'SANDWICH & BURGERS';
    else if (c1 === 'PASTELERIA' || c1 === 'PASTELERÍA') currentCat = 'PASTELERÍA';
    else currentCat = c1;
    continue;
  }

  // Fila de plato: col1=nombre, col2=costo_neto, col3=precio_carta
  const costoNeto   = parseFloat(String(row[2]).replace(',', '.'));
  const precioCarta = parseFloat(String(row[3]).replace(',', '.'));

  if (!c1 || isNaN(costoNeto) || costoNeto <= 0 || !currentCat) continue;
  if (ELIMINADOS.has(c1)) continue;
  if (c1.includes('COSTO') || c1.includes('PRECIO') || c1.includes('MARGEN')) continue;

  platosData.push({
    nombre:       c1,
    categoria:    currentCat,
    costo_neto:   Math.round(costoNeto),
    precio_carta: isNaN(precioCarta) || precioCarta <= 0 ? null : Math.round(precioCarta),
  });
}

console.log(`  ✅ Platos en SEMAFORO: ${platosData.length}`);

// ── 5. Cruzar SEMAFORO + codNombreMap + FICHAS ───────────────────
// Necesitamos el cod_softland para cada plato del SEMAFORO

// Construir mapa nombre→cod desde codNombreMap
const nombreCodMap = {};
for (const [cod, info] of Object.entries(codNombreMap)) {
  nombreCodMap[info.nombre] = cod;
}

// Unificar información
const cartaFinal = [];
let sinCod = 0;
let sinFicha = 0;

for (const p of platosData) {
  const aliasNombre = NOMBRE_ALIASES[p.nombre] ?? p.nombre;
  const cod = nombreCodMap[p.nombre] ?? nombreCodMap[aliasNombre] ?? null;
  if (!cod) sinCod++;

  const fichaItems = cod ? (FICHAS[cod] ?? null) : null;
  if (cod && !fichaItems) sinFicha++;

  cartaFinal.push({ ...p, cod_softland: cod, fichaItems });
}

console.log(`\n  Total platos: ${cartaFinal.length}`);
console.log(`  Sin cod_softland: ${sinCod}`);
console.log(`  Sin ficha técnica: ${sinFicha}`);

// Mostrar muestra
console.log('\n  Muestra (primeros 8):');
cartaFinal.slice(0, 8).forEach(p =>
  console.log(`  [${p.cod_softland ?? '??????'}] ${p.nombre} | ${p.categoria} | $${p.precio_carta} | ings: ${p.fichaItems?.length ?? 0}`)
);

if (DRY_RUN) {
  console.log('\n⚠  DRY-RUN — no se escribirá nada\n');
  process.exit(0);
}

// ── 6. Leer productos existentes en Supabase ────────────────────
console.log('\n🔍 Leyendo productos en Supabase...');
const { data: prodsSupa } = await supa.from('productos').select('codigo');
const codsEnDB = new Set((prodsSupa ?? []).map(p => p.codigo));

// ── 7. Insertar carta + carta_ingredientes ───────────────────────
console.log('\n📥 Insertando carta...\n');

let cartaOK = 0, ingredOK = 0, errores = 0;

// Leer URL de foto ya subida para cada plato
const fotosSnap = {};
{
  const BUCKET_URL = 'https://fqiqagesrujcmbjnbkqr.supabase.co/storage/v1/object/public/fotos-platos';
  // Mapeo por nombre normalizado → storage key
  const { data: listaFotos } = await supa.storage.from('fotos-platos').list();
  for (const f of (listaFotos ?? [])) {
    const keyNorm = f.name.replace(/_/g, ' ').replace(/\.jpg$/i, '').toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    fotosSnap[keyNorm] = `${BUCKET_URL}/${f.name}`;
  }
}

function normFotoKey(nombre) {
  return nombre.toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

for (const plato of cartaFinal) {
  // Buscar foto
  const fotoKey = normFotoKey(plato.nombre);
  let fotoUrl = fotosSnap[fotoKey] ?? null;
  // Búsqueda parcial si no hay match exacto
  if (!fotoUrl) {
    for (const [k, v] of Object.entries(fotosSnap)) {
      if (k.includes(fotoKey) || fotoKey.includes(k)) { fotoUrl = v; break; }
    }
  }

  // Insertar en carta
  const cartaId = randomUUID();
  const { error: errCarta } = await supa.from('carta').upsert({
    id:           cartaId,
    cod_softland: plato.cod_softland,
    nombre:       plato.nombre,
    categoria:    plato.categoria,
    precio_carta: plato.precio_carta,
    activo:       true,
    foto_url:     fotoUrl,
  }, { onConflict: 'cod_softland', ignoreDuplicates: false });

  if (errCarta) {
    // Si falla por cod_softland, intentar sin cod
    const { error: errCarta2 } = await supa.from('carta').upsert({
      id:           cartaId,
      cod_softland: null,
      nombre:       plato.nombre,
      categoria:    plato.categoria,
      precio_carta: plato.precio_carta,
      activo:       true,
      foto_url:     fotoUrl,
    });
    if (errCarta2) {
      console.error(`  ✗ carta "${plato.nombre}":`, errCarta2.message);
      errores++;
      continue;
    }
  }

  cartaOK++;

  // Obtener el id real (puede haberse hecho upsert sobre existente)
  let realCartaId = cartaId;
  if (plato.cod_softland) {
    const { data: existing } = await supa.from('carta')
      .select('id').eq('cod_softland', plato.cod_softland).maybeSingle();
    if (existing?.id) realCartaId = existing.id;
  }

  // Insertar ingredientes si hay ficha técnica
  if (!plato.fichaItems?.length) continue;

  // Borrar ingredientes anteriores (upsert limpio)
  await supa.from('carta_ingredientes').delete().eq('carta_id', realCartaId);

  const ings = plato.fichaItems.map(item => {
    const cod = String(item.cod ?? '').trim();
    const enDB = codsEnDB.has(cod);
    const esPP = cod.startsWith('05'); // PP tienen código 05xxxxx

    return {
      id:              randomUUID(),
      carta_id:        realCartaId,
      codigo_producto: (!esPP && enDB) ? cod : null,
      pp_id:           null,  // Se puede enlazar al PP después si se necesita
      nombre:          String(item.nombre ?? '').trim(),
      cantidad:        parseFloat(item.cantidad) || 0,
      unidad_medida:   String(item.um ?? '').trim(),
      precio_unitario: parseFloat(item.precio) || 0,
      costo_total:     parseFloat(item.total) || 0,
    };
  });

  const { error: errIng } = await supa.from('carta_ingredientes').insert(ings);
  if (errIng) {
    console.error(`  ✗ ingredientes "${plato.nombre}":`, errIng.message);
    errores++;
  } else {
    ingredOK += ings.length;
  }

  process.stdout.write(`  carta: ${cartaOK}/${cartaFinal.length}\r`);
}

console.log(`\n\n✅ Carta insertada: ${cartaOK} platos`);
console.log(`✅ Ingredientes insertados: ${ingredOK} líneas`);
if (errores) console.log(`✗ Errores: ${errores}`);
console.log('');

// ── 8. Re-correr upload de fotos ahora que carta tiene datos ─────
console.log('💡 Actualizando foto_url en carta desde Storage...');
const { data: cartaRows } = await supa.from('carta').select('id, nombre, foto_url').is('foto_url', null);
let fotosAsignadas = 0;
for (const row of (cartaRows ?? [])) {
  const key = normFotoKey(row.nombre);
  let url = fotosSnap[key];
  if (!url) {
    for (const [k, v] of Object.entries(fotosSnap)) {
      if (k.includes(key) || key.includes(k)) { url = v; break; }
    }
  }
  if (url) {
    await supa.from('carta').update({ foto_url: url }).eq('id', row.id);
    fotosAsignadas++;
  }
}
console.log(`  ✅ ${fotosAsignadas} fotos vinculadas a platos sin foto`);
