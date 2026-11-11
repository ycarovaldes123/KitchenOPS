// Conciliación Control Cárnicos — Octubre 2026 (Cambios_Octubre_2026_Claude_Code.md).
// Lleva cada producto/campo corregido a su valor "Final" del documento aplicando las operaciones de
// scripts/data/conciliacion-carnicos-octubre-2026.json sobre carnicos_movimientos:
//   insert      → movimiento nuevo (historial / mermas de platos / ERP Bodega 11 no registrados)
//   update      → corrige la cantidad de un movimiento existente (pesaje / cantidad del ERP)
//   delete      → elimina un ingreso sin respaldo en el ERP (duplicados)
//   mover_fecha → Pulpa de cerdo 31,2 kg pasa de octubre a septiembre (30-09)
//   reasignar   → producción 08-10 de 17 PP cargada a PP Malaya 400 pasa a PP Malaya criolla 200
// Respaldo de todo lo tocado en scripts/backups/. No se ejecuta dos veces (marca created_by).
// Uso: node --no-warnings --import ./scripts/_register-alias.mjs scripts/conciliacion-carnicos-octubre-2026.mjs [--dry-run]
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const MARCA = 'conciliacion-octubre-2026';
const RESPONSABLE = 'AJUSTE CONCILIACIÓN OCT-2026';

const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
Object.assign(process.env, env);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { calcularResumenFilas } = await import('@/lib/carnicos-resumen.server');

const ops = JSON.parse(await fs.readFile('scripts/data/conciliacion-carnicos-octubre-2026.json', 'utf8'));
const clp = n => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('es-CL');

const { count: yaAplicado, error: errMarca } = await sb.from('carnicos_movimientos').select('id', { count: 'exact', head: true }).eq('created_by', MARCA);
if (errMarca) throw errMarca;
if (yaAplicado) { console.log(`Ya aplicado (${yaAplicado} movimientos con created_by=${MARCA}). Nada que hacer.`); process.exit(0); }

// Movimientos existentes que se tocan: deben seguir con la cantidad/fecha esperada
const ids = ops.filter(o => o.id).map(o => o.id);
const { data: existentes, error: errEx } = await sb.from('carnicos_movimientos').select('*').in('id', ids);
if (errEx) throw errEx;
const porId = new Map(existentes.map(m => [m.id, m]));
for (const o of ops.filter(o => o.id)) {
  const m = porId.get(o.id);
  if (!m) throw new Error(`#${o.n} movimiento ${o.id} (${o.producto_nombre}) ya no existe`);
  const esperado = o.de ?? o.cantidad;
  if (Math.abs(Number(m.cantidad) - esperado) > 1e-9 || m.fecha !== o.fecha) throw new Error(`#${o.n} ${m.producto_nombre} ${m.fecha} cambió: ${m.cantidad} (esperado ${esperado} el ${o.fecha})`);
}

// Bodega para los nuevos: la más usada por ese producto/subtipo en sep-oct
const { data: hist, error: errHist } = await sb.from('carnicos_movimientos').select('producto_id,subtipo,bodega')
  .in('producto_id', [...new Set(ops.filter(o => o.op === 'insert').map(o => o.producto_id))]).gte('fecha', '2026-09-01').lte('fecha', '2026-10-31').neq('subtipo', 'VENTAS');
if (errHist) throw errHist;
const bodegaDe = (pid, sub) => {
  const c = {};
  for (const h of hist) if (h.producto_id === pid && h.subtipo === sub) c[h.bodega] = (c[h.bodega] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? (sub === 'RECEPCION_BODEGA' ? 'CAMARA CONGELADOS' : 'COCINA');
};

const resumen = async () => {
  const filas = await calcularResumenFilas(sb, '2026-10-01', '2026-10-31');
  const t = { TOTAL: 0 };
  for (const f of filas) if (f.diferencia_valor !== null) { t[f.unidad_medida] = (t[f.unidad_medida] ?? 0) + f.diferencia_valor; t.TOTAL += f.diferencia_valor; }
  return t;
};
const antes = await resumen();

const nuevos = ops.filter(o => o.op === 'insert').map(o => ({
  fecha: o.fecha, responsable_id: null, responsable_nombre: RESPONSABLE, turno: null,
  observacion: `Conciliación oct-2026 #${o.n}: ${o.nota}`.slice(0, 500),
  bodega: bodegaDe(o.producto_id, o.subtipo),
  movimiento: o.subtipo === 'RECEPCION_BODEGA' || o.subtipo === 'INGRESO_PP' ? 'INGRESO' : 'SALIDA',
  subtipo: o.subtipo, producto_id: o.producto_id, producto_nombre: o.producto_nombre, unidad_medida: o.unidad_medida,
  cantidad: o.cantidad, origen: 'manual', created_by: MARCA,
}));

console.log(`Operaciones: ${nuevos.length} nuevos, ${ops.filter(o => o.op === 'update').length} correcciones de cantidad, ${ops.filter(o => o.op === 'delete').length} eliminados, 1 cambio de fecha, 1 reasignación`);
if (DRY) { console.log('Diferencia $ octubre actual:', clp(antes.TOTAL), '(--dry-run, no se escribió nada)'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await fs.writeFile(`scripts/backups/conciliacion_octubre_2026_${stamp}.json`, JSON.stringify({ ops, existentes }, null, 1));

const marcar = (m, txt) => `${(m.observacion ?? '').trim()} [Conciliación oct-2026 #${txt}]`.trim().slice(0, 500);
for (const o of ops) {
  const m = porId.get(o.id);
  let r = null;
  if (o.op === 'update') r = await sb.from('carnicos_movimientos').update({ cantidad: o.a, observacion: marcar(m, `${o.n}: ${o.de} → ${o.a}`) }).eq('id', o.id);
  if (o.op === 'delete') r = await sb.from('carnicos_movimientos').delete().eq('id', o.id);
  if (o.op === 'mover_fecha') r = await sb.from('carnicos_movimientos').update({ fecha: o.a_fecha, observacion: marcar(m, `${o.n}: fecha ${o.fecha} → ${o.a_fecha}`) }).eq('id', o.id);
  if (o.op === 'reasignar') r = await sb.from('carnicos_movimientos').update({ producto_id: o.producto_id, producto_nombre: o.producto_nombre, unidad_medida: o.unidad_medida, observacion: marcar(m, `${o.n}: de ${o.de_producto}`) }).eq('id', o.id);
  if (r?.error) throw new Error(`#${o.n} ${o.op} ${o.id}: ${r.error.message}`);
}
const { error: errIns } = await sb.from('carnicos_movimientos').insert(nuevos);
if (errIns) throw errIns;

const despues = await resumen();
console.log('Diferencia $ octubre por U/M (antes → después):');
for (const um of [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter(k => k !== 'TOTAL').sort()) console.log(`  ${um.padEnd(4)} ${clp(antes[um] ?? 0).padStart(12)} → ${clp(despues[um] ?? 0)}`);
console.log(`  TOTAL ${clp(antes.TOTAL).padStart(11)} → ${clp(despues.TOTAL)}`);
