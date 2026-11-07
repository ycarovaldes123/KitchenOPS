// Costos → Cafetería: carga las recetas de ../recetas_cafeteria.xlsx (hoja "Recetas cafetería", 2026-11-07).
// Una fila por insumo; se agrupa por Plato. Categorías del Excel → categoría del sistema (con tildes):
//   CAFETERIA → CAFETERÍA · CAFETERIA GASTO → CAFETERÍA GASTO · CAFETERIA PERSONAL → CAFETERÍA PERSONAL · CAFÉ CORTESIA → CAFÉ CORTESÍA
// tipo_carta BEBESTIBLES; guarda Código Softland (cod_softland) y Código Toteat. Cantidad en la U/M del producto.
// Idempotente: si el plato ya existe (mismo nombre) no se toca. Uso: node scripts/cargar-recetas-cafeteria.mjs [--dry-run] [ruta.xlsx]
import fs from 'node:fs/promises';
import X from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const RUTA = process.argv.slice(2).find(a => a.endsWith('.xlsx')) ?? '../recetas_cafeteria.xlsx';
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = r => { if (r.error) throw r.error; return r.data; };

const CATEGORIA = {
  'CAFETERIA': 'CAFETERÍA',
  'CAFETERIA GASTO': 'CAFETERÍA GASTO',
  'CAFETERIA PERSONAL': 'CAFETERÍA PERSONAL',
  'CAFE CORTESIA': 'CAFÉ CORTESÍA',
};
const sinTilde = s => String(s).trim().toUpperCase().normalize('NFD').replace(/\p{M}/gu, '');

const wb = X.readFile(RUTA);
const filas = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
const platos = new Map();
for (const f of filas) {
  const nombre = String(f['Plato'] ?? '').trim();
  if (!nombre) continue;
  const cat = CATEGORIA[sinTilde(f['Categoría'])];
  if (!cat) throw new Error(`Categoría no reconocida: ${f['Categoría']} (${nombre})`);
  if (!platos.has(nombre)) platos.set(nombre, { nombre, categoria: cat, cod_softland: String(f['Código Softland'] ?? '').trim() || null, codigo_toteat: String(f['Código Toteat'] ?? '').trim() || null, lineas: [] });
  platos.get(nombre).lineas.push({ codigo: String(f['Código insumo']).trim(), cantidad: Number(f['Cantidad']) });
}

const cods = [...new Set([...platos.values()].flatMap(p => p.lineas.map(l => l.codigo)))];
const prods = new Map(must(await sb.from('productos').select('codigo, nombre, unidad_medida, costo_promedio, activo').in('codigo', cods)).map(p => [p.codigo, p]));
const faltan = cods.filter(c => !prods.has(c));
if (faltan.length) throw new Error('Faltan productos: ' + faltan.join(', '));

const resumen = {};
let creados = 0, omitidos = 0;
for (const p of platos.values()) {
  const ya = must(await sb.from('carta').select('id').eq('nombre', p.nombre).maybeSingle());
  if (ya) { omitidos++; console.log(`= ${p.nombre} ya existe, no se toca`); continue; }
  const ings = p.lineas.map(l => {
    const pr = prods.get(l.codigo);
    const precio = Number(pr.costo_promedio) || 0;
    return { codigo_producto: l.codigo, nombre: pr.nombre, cantidad: l.cantidad, unidad_medida: pr.unidad_medida, precio_unitario: precio, costo_total: precio * l.cantidad, precio_manual: false, pp_id: null };
  });
  const total = ings.reduce((s, i) => s + i.costo_total, 0);
  (resumen[p.categoria] ??= []).push(`${p.nombre} $${Math.round(total)}`);
  if (DRY) continue;
  const id = must(await sb.from('carta').insert({ nombre: p.nombre, categoria: p.categoria, tipo_carta: 'BEBESTIBLES', cod_softland: p.cod_softland, codigo_toteat: p.codigo_toteat, activo: true }).select('id').single()).id;
  must(await sb.from('carta_ingredientes').insert(ings.map(i => ({ ...i, carta_id: id }))));
  creados++;
}
for (const [cat, lista] of Object.entries(resumen)) console.log(`\n${cat} (${lista.length})\n  ${lista.join('\n  ')}`);
console.log(`\n${DRY ? '[dry-run] ' : ''}creados ${DRY ? 0 : creados}, omitidos (ya existían) ${omitidos}`);
