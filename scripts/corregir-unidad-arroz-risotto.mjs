// Corrige la unidad de medida de "PP ARROZ RISOTTO (GR) (1PP = 150 GR)" (codigo 0502292) de KG a
// GR. El producto ya se maneja en gramos en la practica (produccion, mermas e inventario tienen
// cantidades en escala de gramos: 120-4500, acorde a total_producido de detalle_produccion), solo
// la unidad_medida quedo mal cargada como KG desde su creacion. No se tocan cantidades numericas,
// solo la etiqueta de unidad (en el producto y en los snapshots de detalle_inventario/detalle_mermas).
//
// Idempotente. Uso:
//   node scripts/corregir-unidad-arroz-risotto.mjs --dry-run
//   node scripts/corregir-unidad-arroz-risotto.mjs

import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');
const CODIGO = '0502292';

const env = Object.fromEntries(
  (await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
    .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a) => console.log(DRY_RUN ? '[dry-run]' : '[aplicar]', ...a);

const { data: prod, error: eProd } = await supabase.from('productos').select('codigo,nombre,unidad_medida').eq('codigo', CODIGO).maybeSingle();
if (eProd) throw eProd;
if (!prod) throw new Error(`No existe el producto ${CODIGO}`);

if (prod.unidad_medida === 'GR') {
  log(`OK producto "${prod.nombre}" ya esta en GR`);
} else {
  log(`Producto "${prod.nombre}": unidad_medida ${prod.unidad_medida} -> GR`);
  if (!DRY_RUN) {
    const { error } = await supabase.from('productos').update({ unidad_medida: 'GR' }).eq('codigo', CODIGO);
    if (error) throw error;
  }
}

for (const tabla of ['detalle_inventario', 'detalle_mermas']) {
  const { data, error } = await supabase.from(tabla).select('id,cantidad,unidad_medida').eq('codigo_producto', CODIGO).eq('unidad_medida', 'KG');
  if (error) throw error;
  log(`${tabla}: ${data.length} filas con unidad_medida KG a corregir`);
  for (const r of data) log(`  ${r.id}: cantidad ${r.cantidad} KG -> GR (cantidad sin cambios)`);
  if (!DRY_RUN && data.length) {
    const { error: eUpd } = await supabase.from(tabla).update({ unidad_medida: 'GR' }).in('id', data.map(r => r.id));
    if (eUpd) throw eUpd;
  }
}

log(DRY_RUN ? 'Fin dry-run (no se escribio nada).' : 'Listo.');
