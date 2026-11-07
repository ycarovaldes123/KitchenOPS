// Carga las recetas PP de Salón: SYRUP ARANDANO y SYRUP FRAMBUESA (rinden 500 CC / 16 porciones).
// - JUGO LIMON NATURAL → 0502180 PP. JUGO DE LIMON (CC), igual que el resto de recetas.
// - PULPA DE FRAMBUESA 250 CC → 0604005 PULPA JUGO FRAMBUESA (KG) cargada como 250 GR (1 cc ≈ 1 g),
//   porque el costo no convierte CC→KG.
// - AGUA sin código: costo 0 (lib/recalcular-pp.ts no la marca como incompleta).
// Idempotente (no duplica si ya existe el nombre). Uso:
//   node scripts/cargar-syrups-salon.mjs [--dry-run]
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const RECETAS = [
  { nombre: 'SYRUP ARANDANO', ingredientes: [
    ['0901001', 'ARANDANOS CONG. (GR)', 250, 'GR'],
    ['0101025', 'AZÚCAR GRANULADA (KG)', 250, 'GR'],
    ['0502180', 'PP. JUGO DE LIMON (CC)', 20, 'CC'],
    [null, 'AGUA', 150, 'CC'],
  ] },
  { nombre: 'SYRUP FRAMBUESA', ingredientes: [
    ['0604005', 'PULPA JUGO FRAMBUESA (KG)', 250, 'GR'],
    ['0101025', 'AZÚCAR GRANULADA (KG)', 250, 'GR'],
    ['0502180', 'PP. JUGO DE LIMON (CC)', 20, 'CC'],
    [null, 'AGUA', 100, 'CC'],
  ] },
];

const { error: colErr } = await sb.from('pp_recetas').select('area').limit(1);
const tieneArea = !colErr;
if (!tieneArea) console.warn('⚠ Falta la columna area: ejecuta scripts/supabase_pp_recetas_area.sql (la deja en SALON).');

const { data: nuevas } = await sb.from('pp_recetas').select('codigo_receta').like('codigo_receta', 'NUEVA-%');
let n = (nuevas ?? []).reduce((m, r) => Math.max(m, Number(r.codigo_receta.slice(6)) || 0), 0);
const ids = [];

for (const r of RECETAS) {
  const { data: ya } = await sb.from('pp_recetas').select('id, codigo_receta').eq('nombre', r.nombre).maybeSingle();
  if (ya) { console.log(`= ${r.nombre} ya existe (${ya.codigo_receta})`); ids.push(ya.id); if (tieneArea && !DRY) await sb.from('pp_recetas').update({ area: 'SALON' }).eq('id', ya.id); continue; }
  const codigo = `NUEVA-${String(++n).padStart(3, '0')}`;
  console.log(`+ ${codigo} ${r.nombre}`);
  if (DRY) continue;
  const fila = { codigo_receta: codigo, codigo_pp: null, nombre: r.nombre, rendimiento: 500, unidad_rendimiento: 'CC', activo: true, estado: 'PENDIENTE' };
  if (tieneArea) fila.area = 'SALON';
  const { data: ins, error } = await sb.from('pp_recetas').insert(fila).select('id').single();
  if (error) throw error;
  const { error: e2 } = await sb.from('pp_receta_ingredientes').insert(r.ingredientes.map(([cod, nom, cant, um], i) => ({
    pp_receta_id: ins.id, orden: i + 1, codigo_ingrediente: cod, nombre_ingrediente: nom, cantidad: cant, unidad_medida: um, sin_codigo: !cod,
  })));
  if (e2) throw e2;
  ids.push(ins.id);
}

// Costo igual que lib/recalcular-pp.ts (GR→KG / CC→LT; agua sin código = $0)
const factor = (i, p) => i === p ? 1 : i === 'GR' && p === 'KG' ? 1 / 1000 : i === 'CC' && p === 'LT' ? 1 / 1000 : i === 'KG' && p === 'GR' ? 1000 : i === 'LT' && p === 'CC' ? 1000 : 1;
const r6 = x => Math.round(x * 1e6) / 1e6;
for (const id of DRY ? [] : ids) {
  const { data: rec } = await sb.from('pp_recetas').select('nombre, rendimiento, pp_receta_ingredientes(id, codigo_ingrediente, cantidad, unidad_medida)').eq('id', id).single();
  const cods = rec.pp_receta_ingredientes.map(i => i.codigo_ingrediente).filter(Boolean);
  const { data: prods } = await sb.from('productos').select('codigo, unidad_medida, costo_promedio').in('codigo', cods);
  const pm = new Map(prods.map(p => [p.codigo, p]));
  let total = 0, sinCosto = false;
  for (const ing of rec.pp_receta_ingredientes) {
    const prod = ing.codigo_ingrediente ? pm.get(ing.codigo_ingrediente) : null;
    const cu = Number(prod?.costo_promedio) || 0;
    const linea = prod ? r6(ing.cantidad * factor(ing.unidad_medida, prod.unidad_medida) * cu) : 0;
    if (prod && cu === 0) sinCosto = true;
    total += linea;
    await sb.from('pp_receta_ingredientes').update({ costo_unitario_snap: cu, costo_linea_calculado: linea, sin_codigo: false, sin_costo: !!prod && cu === 0 }).eq('id', ing.id);
  }
  total = r6(total);
  const unit = r6(total / (Number(rec.rendimiento) || 1));
  await sb.from('pp_recetas').update({ costo_total_calculado: total, costo_unitario_calculado: unit, estado: sinCosto ? 'PENDIENTE' : 'ACTIVO', calculado_at: new Date().toISOString() }).eq('id', id);
  console.log(`  ${rec.nombre}: total ${total.toFixed(0)} · ${unit.toFixed(2)}/CC · porción (31,25 CC) ${(unit * 500 / 16).toFixed(0)}`);
}
