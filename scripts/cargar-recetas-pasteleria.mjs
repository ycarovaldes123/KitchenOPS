// Carga las recetas PP de Pastelería (matriz 2026-11-10, scripts/data/recetas-pasteleria-2026-11-10.tsv).
// - Código receta 0501xxx → código PP 0502xxx; sección PASTELERIA.
// - Rendimiento = columna "Rendimiento" de la matriz; unidad desde el nombre: (UND)→UN, (PORC)→PR, (GRS)→GR, (CC)→CC.
// - Cantidad = "Cantidad receta" en la unidad del producto (igual que la matriz Softland).
// - Si la receta (codigo_receta) ya existe, no se toca.
// - Al final recalcula costos con lib/recalcular-pp.ts (sincroniza costo de los 0502 y de la Carta).
// Uso: node --no-warnings --import ./scripts/_register-alias.mjs scripts/cargar-recetas-pasteleria.mjs [--dry-run]
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const filas = (await fs.readFile('scripts/data/recetas-pasteleria-2026-11-10.tsv', 'utf8')).trim().split(/\r?\n/).map(l => l.split('\t'));

const UNIDAD = { UND: 'UN', PORC: 'PR', GRS: 'GR', CC: 'CC' };
const nombreReceta = n => n.trim().replace(/\.$/, '').replace(/CONG\(/, 'CONG (')
  .replace(/\((UND|PORC|GRS|CC)\)$/, (_, u) => `(${UNIDAD[u]})`);
const unidadDe = n => { const m = n.match(/\((UND|PORC|GRS|CC)\)\.?\s*$/); if (!m) throw new Error(`Sin unidad: ${n}`); return UNIDAD[m[1]]; };

const recetas = new Map();
for (const [cod, nombre, , rend, codIng, nomIng, cant] of filas) {
  if (!recetas.has(cod)) recetas.set(cod, { cod, nombre: nombreReceta(nombre), unidad: unidadDe(nombre), rend: Number(rend), ings: [] });
  recetas.get(cod).ings.push({ codIng, nomIng: nomIng.trim(), cant: Number(cant) });
}

const codsIng = [...new Set(filas.map(f => f[4]))];
const { data: prods, error: pErr } = await sb.from('productos').select('codigo, unidad_medida').in('codigo', codsIng);
if (pErr) throw pErr;
const um = new Map(prods.map(p => [p.codigo, p.unidad_medida]));
const faltan = codsIng.filter(c => !um.has(c));
if (faltan.length) throw new Error(`Insumos sin producto: ${faltan.join(', ')}`);

const ids = [];
for (const r of recetas.values()) {
  const { data: ya } = await sb.from('pp_recetas').select('id').eq('codigo_receta', r.cod).maybeSingle();
  if (ya) { console.log(`= ${r.cod} ya existe, no se toca`); continue; }
  console.log(`+ ${r.cod} ${r.nombre} · rinde ${r.rend} ${r.unidad} · ${r.ings.length} insumos`);
  if (DRY) continue;
  const { data: ins, error } = await sb.from('pp_recetas').insert({
    codigo_receta: r.cod, codigo_pp: '0502' + r.cod.slice(4), nombre: r.nombre, rendimiento: r.rend,
    unidad_rendimiento: r.unidad, activo: true, area: 'PASTELERIA', estado: 'PENDIENTE',
  }).select('id').single();
  if (error) throw new Error(`${r.cod}: ${error.message}`);
  const { error: e2 } = await sb.from('pp_receta_ingredientes').insert(r.ings.map((g, i) => ({
    pp_receta_id: ins.id, orden: i + 1, codigo_ingrediente: g.codIng, nombre_ingrediente: g.nomIng,
    cantidad: g.cant, unidad_medida: um.get(g.codIng), sin_codigo: false,
  })));
  if (e2) { await sb.from('pp_recetas').delete().eq('id', ins.id); throw new Error(`${r.cod} ingredientes: ${e2.message}`); }
  ids.push(ins.id);
}

if (DRY || !ids.length) process.exit(0);

const pps = [...recetas.keys()].map(c => '0502' + c.slice(4));
const { data: antes } = await sb.from('productos').select('codigo, costo_promedio').in('codigo', pps);
const costoAntes = new Map(antes.map(p => [p.codigo, Number(p.costo_promedio)]));

const { recalcularCostosPP } = await import('@/lib/recalcular-pp');
const res = await recalcularCostosPP(sb, ids);
console.log(`\nRecalculadas ${res.recalculadas}; errores: ${res.errores.length}`, res.errores.slice(0, 10));

const { data: fin } = await sb.from('pp_recetas').select('codigo_receta, codigo_pp, nombre, estado, costo_total_calculado, costo_unitario_calculado, unidad_rendimiento').in('id', ids).order('codigo_receta');
console.log('\nreceta | estado | costo unitario nuevo | costo 0502 anterior');
for (const r of fin) console.log(`${r.codigo_receta} ${r.nombre} | ${r.estado} | ${Number(r.costo_unitario_calculado).toFixed(2)}/${r.unidad_rendimiento} | antes ${costoAntes.get(r.codigo_pp)?.toFixed(2)}`);
