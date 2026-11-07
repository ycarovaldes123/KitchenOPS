// Costos → Coctelería: 12 cócteles de la carta de barra (2026-11-07).
// Criterios: limón → 0502180 PP. JUGO DE LIMON; jugo naranja → 0604002; hielo y goma $0 (manual);
// cervezas/pulpas en GR o CC se cargan en la unidad que convierte con el maestro (CC↔LT, GR↔KG);
// menta 0.1 = 0.1 UN de MENTA VERDE (como pidió la usuaria); insumos sin producto quedan PENDIENTES (sin código).
// Activa los productos de barra que estaban inactivos. Idempotente. Uso: node scripts/cargar-cocteles-carta-2026-11.mjs [--dry-run]
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = r => { if (r.error) throw r.error; return r.data; };

const CERO = 0;            // precio manual $0
const PEND = undefined;    // sin producto → pendiente
const HIELO = g => [null, g, 'GR', 'HIELO', CERO];
const GOMA = cc => [null, cc, 'CC', 'GOMA', CERO];
const LIMON = cc => ['0502180', cc, 'CC'];
const GIN90 = ['0703006', 90, 'CC'];

const COCTELES = [
  { nombre: 'SANGRÍA CHIVAS', lineas: [
    [null, 120, 'CC', 'VINO CASTILLO MOLINA', PEND], ['0702002', 45, 'CC'], ['0604002', 30, 'CC'], ['0801002', 180, 'CC'],
    GOMA(30), ['0901003', 15, 'GR'], ['0401023', 15, 'GR'],
  ] },
  { nombre: 'PISCO SOUR MANGO', lineas: [
    ['0702007', 90, 'CC'], GOMA(30), LIMON(30), ['0604007', 30, 'GR'],
  ] },
  { nombre: 'CHACHA SPRITZ', lineas: [
    ['0702015', 60, 'CC'], ['0806501', 350, 'CC'], HIELO(210), [null, 0.5, 'GR', 'RODAJA NARANJA DESHIDRATADA', PEND], [null, 30, 'CC', 'SODA', PEND],
  ] },
  { nombre: 'BOTANICAL BEER ARANDANO', lineas: [GIN90, GOMA(60), LIMON(60), ['0803003', 60, 'CC'], HIELO(100), [null, 60, 'CC', 'AGUA CON GAS', PEND]] },
  { nombre: 'BOTANICAL BEER VPL',      lineas: [GIN90, GOMA(60), LIMON(60), ['0805101', 60, 'CC'], HIELO(100), [null, 60, 'CC', 'AGUA CON GAS', PEND]] },
  { nombre: 'BOTANICAL BEER MIEL',     lineas: [GIN90, GOMA(60), LIMON(60), ['0803001', 60, 'CC'], HIELO(100), [null, 60, 'CC', 'AGUA CON GAS', PEND]] },
  { nombre: 'RAMAZZOTTI', lineas: [
    ['0702015', 90, 'CC'], ['0703008', 120, 'CC'], [null, 30, 'CC', 'SODA', PEND], [null, 0.5, 'GR', 'RODAJA LIMON DESHIDRATADO', PEND],
    ['0901001', 10, 'GR'], HIELO(210),
  ] },
  { nombre: 'SANGRÍA CERVECERA', lineas: [
    ['0701008', 120, 'CC'], ['0604002', 30, 'CC'], ['0801002', 180, 'CC'], GOMA(30), ['0901003', 15, 'GR'], ['0401023', 15, 'GR'],
  ] },
  { nombre: 'ALWAYS WITH BEER', lineas: [
    ['0803004', 180, 'CC'], ['0502233', 45, 'CC'], ['0604007', 45, 'GR'], ['0604010', 45, 'GR'], ['0401047', 0.1, 'UN'], HIELO(100),
    [null, 0.5, 'GR', 'RODAJA LIMON DESHIDRATADO', PEND],
  ] },
  { nombre: 'TROPICAL GIN', lineas: [GIN90, ['0602001', 1, 'UN'], HIELO(210)] },
  { nombre: 'GIN TONIC', lineas: [GIN90, [null, 1, 'UN', 'TONICA (LATA)', PEND], HIELO(210)] },
  { nombre: 'FERNET + BEBIDA', lineas: [['0702025', 90, 'CC'], [null, 1, 'UN', 'BEBIDA A ELECCION (LATA)', PEND], HIELO(210)] },
];

const factor = (i, p) => i === p ? 1 : i === 'GR' && p === 'KG' ? 1 / 1000 : i === 'CC' && p === 'LT' ? 1 / 1000 : i === 'KG' && p === 'GR' ? 1000 : i === 'LT' && p === 'CC' ? 1000 : 1;
const cods = [...new Set(COCTELES.flatMap(c => c.lineas.map(l => l[0]).filter(Boolean)))];
const prods = new Map(must(await sb.from('productos').select('codigo, nombre, unidad_medida, costo_promedio, activo').in('codigo', cods)).map(p => [p.codigo, p]));
const faltan = cods.filter(c => !prods.has(c)); if (faltan.length) throw new Error('Faltan productos ' + faltan);
const activar = cods.filter(c => prods.get(c).activo === false);
console.log('Activar:', activar.map(c => `${c} ${prods.get(c).nombre}`).join(' · ') || '—');
if (!DRY && activar.length) must(await sb.from('productos').update({ activo: true }).in('codigo', activar));

for (const c of COCTELES) {
  const filas = c.lineas.map(([cod, cant, um, nom, manual]) => {
    const p = cod ? prods.get(cod) : null;
    const precio = p ? Number(p.costo_promedio) * factor(um, p.unidad_medida) : manual ?? null;
    return { codigo_producto: cod, nombre: p?.nombre ?? nom, cantidad: cant, unidad_medida: um, precio_unitario: precio, costo_total: precio == null ? null : precio * cant, precio_manual: !p && manual === 0, pp_id: null };
  });
  const total = filas.reduce((s, f) => s + (f.costo_total ?? 0), 0);
  const pend = filas.filter(f => f.costo_total == null).map(f => f.nombre);
  console.log(`${c.nombre}: $${total.toFixed(0)}${pend.length ? '  · pendiente: ' + pend.join(', ') : ''}`);
  if (DRY) continue;
  const ya = must(await sb.from('carta').select('id').eq('nombre', c.nombre).maybeSingle());
  const id = ya?.id ?? must(await sb.from('carta').insert({ nombre: c.nombre, categoria: 'COCTELERÍA', tipo_carta: 'BEBESTIBLES', activo: true }).select('id').single()).id;
  must(await sb.from('carta_ingredientes').delete().eq('carta_id', id));
  must(await sb.from('carta_ingredientes').insert(filas.map(f => ({ ...f, carta_id: id }))));
}
