// Costos → Coctelería, planilla en onzas (2026-11-07). 1 oz = 30 CC (o 30 GR en pulpas); hielo 35 GR por cubo.
// Agua, hielo y goma = $0. No se tocan recetas ya existentes (las duplicadas se omiten).
// Uso: node scripts/cargar-cocteles-carta-2026-11-b.mjs [--dry-run]
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = r => { if (r.error) throw r.error; return r.data; };

const OZ = 30;
const HIELO = cubos => [null, cubos * 35, 'GR', 'HIELO', 0];
const GOMA = cc => [null, cc, 'CC', 'GOMA', 0];
const BEBIDA = [null, 1, 'UN', 'BEBIDA (LATA 220 CC)', undefined];

const COCTELES = [
  { nombre: 'WHISCOLA (BALLANTINES)', lineas: [['0702003', 3 * OZ, 'CC'], BEBIDA, HIELO(4)] },
  { nombre: 'PISCOLA (35°- 40°)', lineas: [['0702007', 3 * OZ, 'CC'], BEBIDA, HIELO(4)] },
  { nombre: 'PISCO SOUR', lineas: [['0502165', 1, 'PR']] },
  { nombre: 'JAGERMEISTER', lineas: [['0702006', 2 * OZ, 'CC']] },
  { nombre: 'BERRY WITH BEER', lineas: [
    ['0604005', 2 * OZ, 'GR'], ['0502180', 1 * OZ, 'CC'], GOMA(1 * OZ), ['0803004', 180, 'CC'], HIELO(5), ['0901001', 12.5, 'GR'],
  ] },
];

const factor = (i, p) => i === p ? 1 : i === 'GR' && p === 'KG' ? 1 / 1000 : i === 'CC' && p === 'LT' ? 1 / 1000 : i === 'KG' && p === 'GR' ? 1000 : i === 'LT' && p === 'CC' ? 1000 : 1;
const cods = [...new Set(COCTELES.flatMap(c => c.lineas.map(l => l[0]).filter(Boolean)))];
const prods = new Map(must(await sb.from('productos').select('codigo, nombre, unidad_medida, costo_promedio, activo').in('codigo', cods)).map(p => [p.codigo, p]));
const faltan = cods.filter(c => !prods.has(c)); if (faltan.length) throw new Error('Faltan productos ' + faltan);
const activar = cods.filter(c => prods.get(c).activo === false);
console.log('Activar:', activar.map(c => `${c} ${prods.get(c).nombre}`).join(' · ') || '—');
if (!DRY && activar.length) must(await sb.from('productos').update({ activo: true }).in('codigo', activar));

for (const c of COCTELES) {
  const ya = must(await sb.from('carta').select('id').eq('nombre', c.nombre).maybeSingle());
  if (ya) { console.log(`= ${c.nombre} ya existe, no se toca`); continue; }
  const filas = c.lineas.map(([cod, cant, um, nom, manual]) => {
    const p = cod ? prods.get(cod) : null;
    const precio = p ? Number(p.costo_promedio) * factor(um, p.unidad_medida) : manual ?? null;
    return { codigo_producto: cod, nombre: p?.nombre ?? nom, cantidad: cant, unidad_medida: um, precio_unitario: precio, costo_total: precio == null ? null : precio * cant, precio_manual: !p && manual === 0, pp_id: null };
  });
  const total = filas.reduce((s, f) => s + (f.costo_total ?? 0), 0);
  console.log(`${c.nombre}: $${total.toFixed(0)}`);
  for (const f of filas) console.log(`   ${f.cantidad} ${f.unidad_medida} ${f.nombre} → ${f.costo_total == null ? 'PENDIENTE' : '$' + f.costo_total.toFixed(0)}`);
  if (DRY) continue;
  const id = must(await sb.from('carta').insert({ nombre: c.nombre, categoria: 'COCTELERÍA', tipo_carta: 'BEBESTIBLES', activo: true }).select('id').single()).id;
  must(await sb.from('carta_ingredientes').insert(filas.map(f => ({ ...f, carta_id: id }))));
}
