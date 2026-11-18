// Reemplaza el Ingreso PP digitado a mano en Control Cárnicos por el generado desde Producción
// para un rango de fechas (el vínculo queda en created_by = auto-produccion:<id>).
// Respalda lo eliminado en scripts/backups/. Idempotente.
// Uso: node --no-warnings --import ./scripts/_register-alias.mjs scripts/sync-ingreso-pp-desde-produccion.mjs 2026-11-01 2026-11-30 [--aplicar]
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
const [desde, hasta] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const APLICAR = process.argv.includes('--aplicar');
if (!desde || !hasta) throw new Error('Indica desde y hasta (YYYY-MM-DD)');
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { sincronizarIngresoPPDeProduccion, MARCA_AUTO_PRODUCCION } = await import('@/lib/carnicos-ingreso-pp.server');

const suma = async () => {
  const { data } = await sb.from('carnicos_movimientos').select('producto_nombre,cantidad').eq('subtipo', 'INGRESO_PP').gte('fecha', desde).lte('fecha', hasta);
  const t = {}; for (const m of data) t[m.producto_nombre] = (t[m.producto_nombre] ?? 0) + Number(m.cantidad); return t;
};
const antes = await suma();
const { data: manuales } = await sb.from('carnicos_movimientos').select('*').eq('subtipo', 'INGRESO_PP').gte('fecha', desde).lte('fecha', hasta).not('created_by', 'like', `${MARCA_AUTO_PRODUCCION}%`);
const { data: prods } = await sb.from('produccion').select('id').gte('fecha', desde).lte('fecha', hasta);
console.log(`Manuales a reemplazar: ${manuales.length} | producciones: ${prods.length}`);
if (!APLICAR) { console.log('(simulación; usa --aplicar)'); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await fs.writeFile(`scripts/backups/ingreso_pp_manual_${desde}_${hasta}_${stamp}.json`, JSON.stringify(manuales, null, 1));
if (manuales.length) { const { error } = await sb.from('carnicos_movimientos').delete().in('id', manuales.map(m => m.id)); if (error) throw error; }
for (const p of prods) await sincronizarIngresoPPDeProduccion(sb, p.id);
const despues = await suma();
for (const k of [...new Set([...Object.keys(antes), ...Object.keys(despues)])].sort()) if ((antes[k] ?? 0) !== (despues[k] ?? 0)) console.log(`  ${k}: ${antes[k] ?? 0} → ${despues[k] ?? 0}`);
console.log('Listo.');
