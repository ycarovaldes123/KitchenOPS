// Costos → Coctelería: 2 cócteles con kombucha (2026-11-07). Nombres provisorios, se cambian desde Costos.
// - Syrups (recetas PP NUEVA-001/002) pasan a producto interno SYR-ARANDANO / SYR-FRAMBUESA (CC),
//   vinculado por codigo_pp: el recálculo de PP les actualiza el costo y lo lleva a la carta.
// - Activa 0806501 KOMBUCHACHA BARRIL (LT) y 0604002 JUGO NARANJA (CC).
// - HIELO $0 (precio manual); GOMA y MENTA sin producto (pendientes).
// Idempotente. Uso: node scripts/cargar-cocteles-kombucha.mjs [--dry-run]
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = r => { if (r.error) throw r.error; return r.data; };

// 1) Syrups → producto interno
for (const [receta, codigo, nombre] of [['SYRUP ARANDANO', 'SYR-ARANDANO', 'SYRUP ARANDANO (CC)'], ['SYRUP FRAMBUESA', 'SYR-FRAMBUESA', 'SYRUP FRAMBUESA (CC)']]) {
  const rec = must(await sb.from('pp_recetas').select('id, codigo_pp, costo_unitario_calculado').eq('nombre', receta).single());
  console.log(`syrup ${receta} → ${codigo} ($${Number(rec.costo_unitario_calculado).toFixed(2)}/CC)`);
  if (DRY) continue;
  if (rec.codigo_pp !== codigo) must(await sb.from('pp_recetas').update({ codigo_pp: codigo }).eq('id', rec.id));
  const ya = must(await sb.from('productos').select('codigo').eq('codigo', codigo).maybeSingle());
  const fila = { nombre, unidad_medida: 'CC', costo_promedio: Number(rec.costo_unitario_calculado) || 0, activo: true };
  must(ya ? await sb.from('productos').update(fila).eq('codigo', codigo) : await sb.from('productos').insert({ codigo, ...fila }));
}

// 2) Activar kombucha y jugo naranja
if (!DRY) must(await sb.from('productos').update({ activo: true }).in('codigo', ['0806501', '0604002']));

// 3) Cócteles
const COCTELES = [
  { nombre: 'KOMBUCHA ARANDANO', lineas: [
    ['SYR-ARANDANO', 45, 'CC'], ['0502180', 20, 'CC'], [null, 20, 'CC', 'GOMA'],
    ['0806501', 300, 'CC'], [null, 20, 'GR', 'HIELO', 0], [null, 3, 'GR', 'MENTA HOJAS'],
  ] },
  { nombre: 'KOMBUCHA FRAMBUESA NARANJA', lineas: [
    ['0604002', 180, 'CC'], ['SYR-FRAMBUESA', 30, 'CC'], ['0806501', 200, 'CC'], [null, 20, 'GR', 'HIELO', 0],
  ] },
];
const factor = (i, p) => i === p ? 1 : i === 'GR' && p === 'KG' ? 1 / 1000 : i === 'CC' && p === 'LT' ? 1 / 1000 : i === 'KG' && p === 'GR' ? 1000 : i === 'LT' && p === 'CC' ? 1000 : 1;
const cods = [...new Set(COCTELES.flatMap(c => c.lineas.map(l => l[0]).filter(Boolean)))];
const prods = new Map(must(await sb.from('productos').select('codigo, nombre, unidad_medida, costo_promedio').in('codigo', cods)).map(p => [p.codigo, p]));

for (const c of COCTELES) {
  const filas = c.lineas.map(([cod, cant, um, nom, manual]) => {
    const p = cod ? prods.get(cod) : null;
    if (cod && !p) throw new Error(`Falta producto ${cod}`);
    const precio = p ? Number(p.costo_promedio) * factor(um, p.unidad_medida) : manual ?? null;
    return { codigo_producto: cod, nombre: p?.nombre ?? nom, cantidad: cant, unidad_medida: um, precio_unitario: precio, costo_total: precio == null ? null : precio * cant, precio_manual: manual === 0, pp_id: null };
  });
  const total = filas.reduce((s, f) => s + (f.costo_total ?? 0), 0);
  console.log(`\n${c.nombre}: costo $${total.toFixed(0)}`);
  for (const f of filas) console.log(`   ${f.cantidad} ${f.unidad_medida} ${f.nombre} → ${f.costo_total == null ? 'PENDIENTE' : '$' + f.costo_total.toFixed(0)}`);
  if (DRY) continue;
  const ya = must(await sb.from('carta').select('id').eq('nombre', c.nombre).maybeSingle());
  const id = ya?.id ?? must(await sb.from('carta').insert({ nombre: c.nombre, categoria: 'COCTELERÍA', tipo_carta: 'BEBESTIBLES', activo: true }).select('id').single()).id;
  must(await sb.from('carta_ingredientes').delete().eq('carta_id', id));
  must(await sb.from('carta_ingredientes').insert(filas.map(f => ({ ...f, carta_id: id }))));
}
