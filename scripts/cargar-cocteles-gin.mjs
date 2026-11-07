// Costos → Coctelería: GIN GARTEN y GIN BEEREN (2026-11-07).
// Activa 0703006 GIN KANTAL (CC), 0802004 SCHOP GARDEN TONIC (LT), 0802003 SCHOP BEEREN SPRITZ (LT).
// Jugo limón → 0502180 PP. JUGO DE LIMON; jugo naranja → 0604002; GOMA $0 manual (provisorio).
// Idempotente. Uso: node scripts/cargar-cocteles-gin.mjs [--dry-run]
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = r => { if (r.error) throw r.error; return r.data; };

if (!DRY) must(await sb.from('productos').update({ activo: true }).in('codigo', ['0703006', '0802004', '0802003']));

const COCTELES = [
  { nombre: 'GIN GARTEN', lineas: [
    ['0703006', 30, 'CC'], ['0604002', 40, 'CC'], ['0502180', 20, 'CC'], ['0802004', 120, 'CC'], [null, 20, 'CC', 'GOMA', 0],
  ] },
  { nombre: 'GIN BEEREN', lineas: [
    ['0703006', 60, 'CC'], ['SYR-FRAMBUESA', 45, 'CC'], ['0502180', 20, 'CC'], ['0802003', 120, 'CC'],
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
  for (const f of filas) console.log(`   ${f.cantidad} ${f.unidad_medida} ${f.nombre} → $${(f.costo_total ?? 0).toFixed(0)}`);
  if (DRY) continue;
  const ya = must(await sb.from('carta').select('id').eq('nombre', c.nombre).maybeSingle());
  const id = ya?.id ?? must(await sb.from('carta').insert({ nombre: c.nombre, categoria: 'COCTELERÍA', tipo_carta: 'BEBESTIBLES', activo: true }).select('id').single()).id;
  must(await sb.from('carta_ingredientes').delete().eq('carta_id', id));
  must(await sb.from('carta_ingredientes').insert(filas.map(f => ({ ...f, carta_id: id }))));
}
