/**
 * Sube las fotos de platos a Supabase Storage y actualiza carta.foto_url
 *
 * Uso:  node scripts/upload-fotos.mjs
 *
 * Requisitos:
 *   - Crea el bucket "fotos-platos" en Supabase Storage con acceso público
 *     (Dashboard → Storage → New bucket → nombre: fotos-platos → Public: ✓)
 *   - Las fotos deben estar en ../Fotos platos/ relativo a este script
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL        = 'https://fqiqagesrujcmbjnbkqr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxaXFhZ2VzcnVqY21iam5ia3FyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzI3ODkyMywiZXhwIjoyMDkyODU0OTIzfQ.Yn-SI-siVI0bNiofABD8bbTjE_dfbevMMi2CbuadPV0';

const BUCKET      = 'fotos-platos';
const FOTOS_DIR   = path.resolve(__dirname, '../../Fotos platos');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Normaliza un nombre para comparación: mayúsculas, sin acentos, sin puntuación extra
function norm(s) {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  // 1. Leer platos desde la carta
  const { data: platos, error: errPlatos } = await supabase
    .from('carta')
    .select('id, nombre, foto_url');

  if (errPlatos) { console.error('Error leyendo carta:', errPlatos.message); process.exit(1); }
  console.log(`\n✅ ${platos.length} platos en carta\n`);

  // 2. Leer archivos de fotos
  if (!fs.existsSync(FOTOS_DIR)) {
    console.error(`No se encontró la carpeta: ${FOTOS_DIR}`);
    process.exit(1);
  }

  const archivos = fs.readdirSync(FOTOS_DIR)
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

  console.log(`📁 ${archivos.length} fotos encontradas en ${FOTOS_DIR}\n`);

  const normPlatos = platos.map(p => ({ ...p, norm: norm(p.nombre) }));

  const resultados = [];

  for (const archivo of archivos) {
    const nombreSinExt = path.basename(archivo, path.extname(archivo));
    const normArch     = norm(nombreSinExt);
    const filePath     = path.join(FOTOS_DIR, archivo);
    const fileBuffer   = fs.readFileSync(filePath);
    // Sanitizar nombre: espacios → _, tildes y ñ → ascii
    const storageName  = archivo
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quita tildes
      .replace(/ñ/gi, 'n')                                 // ñ → n
      .replace(/ /g, '_');

    // Subir a Supabase Storage
    const { error: errUp } = await supabase.storage
      .from(BUCKET)
      .upload(storageName, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (errUp) {
      console.error(`  ✗ Error subiendo ${archivo}:`, errUp.message);
      resultados.push({ archivo, estado: 'error_upload', match: null });
      continue;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storageName);

    // Buscar match en carta
    // 1. Exact match normalizado
    let match = normPlatos.find(p => p.norm === normArch);

    // 2. El nombre del plato contiene la foto (ej: "SALMON CREMOSO" está en "SALMON CREMOSO C/PURE CAMOTE")
    if (!match) match = normPlatos.find(p => p.norm.includes(normArch));

    // 3. La foto contiene el nombre del plato (ej: "ATUN SELLADO C PURE ARVEJAS" buscando foto "ATUN SELLADO")
    if (!match) match = normPlatos.find(p => normArch.includes(p.norm));

    if (match) {
      const { error: errUpd } = await supabase
        .from('carta')
        .update({ foto_url: publicUrl })
        .eq('id', match.id);

      if (errUpd) {
        console.error(`  ✗ Error actualizando carta para ${match.nombre}:`, errUpd.message);
        resultados.push({ archivo, estado: 'error_update', match: match.nombre });
      } else {
        console.log(`  ✅ ${archivo}  →  "${match.nombre}"`);
        resultados.push({ archivo, estado: 'ok', match: match.nombre });
      }
    } else {
      console.log(`  ⚠  ${archivo}  →  sin match en carta (foto subida igualmente)`);
      resultados.push({ archivo, estado: 'sin_match', match: null, publicUrl });
    }
  }

  // Resumen
  const ok      = resultados.filter(r => r.estado === 'ok').length;
  const sinMatch = resultados.filter(r => r.estado === 'sin_match');
  const errores = resultados.filter(r => r.estado.startsWith('error'));

  console.log('\n── Resumen ──────────────────────────────');
  console.log(`  ✅ Subidas y enlazadas:  ${ok}`);
  console.log(`  ⚠  Sin match en carta:  ${sinMatch.length}`);
  console.log(`  ✗  Errores:             ${errores.length}`);

  if (sinMatch.length > 0) {
    console.log('\n── Fotos sin match (asignar manualmente) ──');
    sinMatch.forEach(r => console.log(`  ${r.archivo}  →  ${r.publicUrl}`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
