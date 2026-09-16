// Control Carnicos: repunta todos los movimientos e inventarios (inicial/final) de
// "OSOBUCO VACUNO UNID." (CARNES ROJAS, es_pp=false) hacia "PP OSOBUCO (UND)" (PRODUCTOS
// PROCESADOS, es_pp=true, ya relacionado con el codigo de venta K15041). Desactiva el
// producto VACUNO al terminar, igual que se hizo con MECHADA NIDO -> MECHADA 100GR
// (scripts/mejoras-control-carnes-2026-09.mjs).
//
// Colisiones de inventario (unique(fecha,bodega,tipo,producto_id)): se SUMA la cantidad
// VACUNO al conteo existente de PP OSOBUCO (mismo criterio usado en MECHADA).
//
// Idempotente. Uso:
//   node scripts/migrar-osobuco-vacuno-a-pp.mjs --dry-run
//   node scripts/migrar-osobuco-vacuno-a-pp.mjs

import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

const VACUNO_NOMBRE = 'OSOBUCO VACUNO UNID.';
const PP_NOMBRE = 'PP OSOBUCO (UND)';

const env = Object.fromEntries(
  (await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
    .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a) => console.log(DRY_RUN ? '[dry-run]' : '[aplicar]', ...a);

async function getProductoPorNombre(nombre) {
  const { data, error } = await supabase.from('carnicos_productos').select('*').eq('nombre', nombre).maybeSingle();
  if (error) throw new Error(`${nombre}: ${error.message}`);
  return data;
}

const vacuno = await getProductoPorNombre(VACUNO_NOMBRE);
const pp = await getProductoPorNombre(PP_NOMBRE);

if (!pp) throw new Error(`No existe el producto destino "${PP_NOMBRE}"`);
if (!vacuno) {
  log(`OK: "${VACUNO_NOMBRE}" ya no existe. Nada que hacer.`);
  process.exit(0);
}
if (vacuno.id === pp.id) {
  log('Mismo id, nada que hacer.');
  process.exit(0);
}

log(`Repuntar ${vacuno.id} ("${VACUNO_NOMBRE}") -> ${pp.id} ("${PP_NOMBRE}") y desactivar VACUNO`);

// ── inventarios: colisiona con unique(fecha,bodega,tipo,producto_id) ──────────
const { data: invVacuno } = await supabase.from('carnicos_inventarios').select('id,fecha,bodega,tipo,cantidad').eq('producto_id', vacuno.id);
const { data: invPP } = await supabase.from('carnicos_inventarios').select('id,fecha,bodega,tipo,cantidad').eq('producto_id', pp.id);
const ppPorClave = new Map((invPP ?? []).map(r => [`${r.fecha}|${r.bodega}|${r.tipo}`, r]));
const invColisiones = (invVacuno ?? []).filter(r => ppPorClave.has(`${r.fecha}|${r.bodega}|${r.tipo}`));
const invMovibles = (invVacuno ?? []).filter(r => !ppPorClave.has(`${r.fecha}|${r.bodega}|${r.tipo}`));

log(`inventarios VACUNO: ${invVacuno?.length ?? 0} (${invMovibles.length} se repuntan, ${invColisiones.length} se suman al conteo PP existente)`);
for (const r of invColisiones) {
  const dest = ppPorClave.get(`${r.fecha}|${r.bodega}|${r.tipo}`);
  log(`  colision ${r.fecha} ${r.bodega} ${r.tipo}: PP ${dest.cantidad} + VACUNO ${r.cantidad} = ${Number(dest.cantidad) + Number(r.cantidad)}`);
}
for (const r of invMovibles) {
  log(`  repunte  ${r.fecha} ${r.bodega} ${r.tipo}: cantidad ${r.cantidad}`);
}

// ── movimientos: sin restriccion unique, repunte directo ──────────────────────
const { data: movVacuno } = await supabase.from('carnicos_movimientos').select('id,fecha,bodega,movimiento,subtipo,cantidad').eq('producto_id', vacuno.id);
log(`movimientos VACUNO: ${movVacuno?.length ?? 0}`);
for (const m of movVacuno ?? []) {
  log(`  ${m.fecha} ${m.bodega} ${m.movimiento}/${m.subtipo}: cantidad ${m.cantidad}`);
}

if (!DRY_RUN) {
  for (const r of invColisiones) {
    const dest = ppPorClave.get(`${r.fecha}|${r.bodega}|${r.tipo}`);
    const e1 = await supabase.from('carnicos_inventarios')
      .update({ cantidad: Number(dest.cantidad) + Number(r.cantidad) }).eq('id', dest.id);
    if (e1.error) throw new Error(`inv suma: ${e1.error.message}`);
    const e2 = await supabase.from('carnicos_inventarios').delete().eq('id', r.id);
    if (e2.error) throw new Error(`inv borrar VACUNO: ${e2.error.message}`);
  }
  if (invMovibles.length) {
    const { error } = await supabase.from('carnicos_inventarios')
      .update({ producto_id: pp.id, producto_nombre: PP_NOMBRE }).in('id', invMovibles.map(r => r.id));
    if (error) throw new Error(`inv repunte: ${error.message}`);
  }
  const r1 = await supabase.from('carnicos_movimientos')
    .update({ producto_id: pp.id, producto_nombre: PP_NOMBRE }).eq('producto_id', vacuno.id);
  if (r1.error) throw new Error(`mov repunte: ${r1.error.message}`);
  const r3 = await supabase.from('carnicos_productos')
    .update({ activo: false, updated_at: new Date().toISOString() }).eq('id', vacuno.id);
  if (r3.error) throw new Error(`desactivar VACUNO: ${r3.error.message}`);
}

log(DRY_RUN ? 'Fin dry-run (no se escribio nada).' : 'Listo.');
