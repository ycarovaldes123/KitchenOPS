// Actualiza Control Cárnicos → carnicos_platos (receta de carne por plato Toteat) desde las recetas de Costos.
// Reglas acordadas con la usuaria (2026-11-10):
// - Carnes = productos 0301xxx–0304xxx. PP = los que ella mantiene en carnicos_productos (es_pp).
// - Línea de Costos con PP 0502 que está en la tabla de PP → ese PP (si hay varios, se elige por cantidad).
// - Línea con carne cruda: si el plato ya descuenta un PP de esa carne se mantiene; si no, PP cuyo gramaje
//   calza con la cantidad; si no, la carne cruda en la unidad de Control Cárnicos.
// - PP intermedios con carne que no están en la tabla (pancetas, brochetas, salsa española…) se desglosan a carne cruda.
// - Se mantienen como están: K15011 MENÚ NIÑO POLLO y K14022 PORCIÓN MECHADA.
// - Platos de Control Cárnicos sin plato activo en Costos no se tocan (solo se listan).
// Uso: node scripts/sync-carnicos-platos-desde-costos.mjs [--dry-run]
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = async (t, sel) => {
  let out = [], i = 0;
  for (;;) { const { data, error } = await sb.from(t).select(sel).range(i, i + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; i += 1000; }
  return out;
};

const MANTENER = new Set(['K15011', 'K14022']);
// Platos sacados del Control Cárnicos por decisión de la usuaria: no se crean ni reactivan.
const EXCLUIR = new Set([]);
// No se desglosan (agosto 2026 mostró sobre-descuento): pancetas de ciruela (tocino) y salsa española
// (el hueso carnudo ya sale como Producción al hacer la salsa).
const NO_DESGLOSAR = new Set(['0502037', '0502273']);
// PP de Costos que en la tabla de Control Cárnicos están con el código de la carne
const EQUIVALENTES = {}; // schnitzel (0502302/0502303) y osobuco (0502296) ya usan su código de receta PP

const carta = await all('carta', 'id,nombre,categoria,activo,codigo_toteat,tipo_carta');
const ings = await all('carta_ingredientes', 'carta_id,codigo_producto,nombre,cantidad,unidad_medida');
const cprods = (await all('carnicos_productos', 'id,codigo,nombre,unidad_medida,es_pp,activo')).filter(p => p.activo);
const cplatos = await all('carnicos_platos', '*');
const recetas = await all('pp_recetas', 'codigo_pp,nombre,activo,rendimiento,unidad_rendimiento,pp_receta_ingredientes(codigo_ingrediente,nombre_ingrediente,cantidad,unidad_medida)');

const esCarne = c => /^030[1-4]/.test(c || '');
const recetaPP = new Map(recetas.filter(r => r.activo && r.codigo_pp).map(r => [r.codigo_pp, r]));
const tieneCarne = c => recetaPP.get(c)?.pp_receta_ingredientes.some(i => esCarne(i.codigo_ingrediente));
const ppPorCodigo = c => cprods.filter(p => p.es_pp && p.codigo === c);
const crudaPorCodigo = c => cprods.filter(p => !p.es_pp && p.codigo === c);
const prodPorNombre = new Map(cprods.map(p => [p.nombre, p]));

const conv = (q, de, a) => {
  de = de.toUpperCase(); a = a.toUpperCase();
  if (de === a) return q;
  if (de === 'KG' && a === 'GR') return q * 1000;
  if (de === 'GR' && a === 'KG') return q / 1000;
  if (de === 'LT' && a === 'CC') return q * 1000;
  if (de === 'CC' && a === 'LT') return q / 1000;
  if (['UN', 'PR'].includes(de) && ['UN', 'PR'].includes(a)) return q;
  return null;
};
// Gramos que indica el nombre del PP: "(120GR)", "(400 gr)", "(250)", "80GR", "(400 x PP)"
const gramosPP = n => { const m = n.match(/\(?(\d+)\s*(?:GRS?\b|gr\b|x PP|\))/i); return m ? Number(m[1]) : null; };

const avisos = [];
const r4 = x => Math.round(x * 10000) / 10000;

function lineasCarne(plato, actuales) {
  const out = [];
  const add = (prod, cant, origen) => {
    if (!prod) return;
    const ya = out.find(o => o.prod.id === prod.id);
    if (ya) ya.cant += cant; else out.push({ prod, cant, origen });
  };
  const actualesPP = actuales.map(a => prodPorNombre.get(a.producto_nombre)).filter(p => p?.es_pp);

  for (const ing of ings.filter(i => i.carta_id === plato.id)) {
    const c = ing.codigo_producto, q = Number(ing.cantidad) || 0, um = (ing.unidad_medida || '').toUpperCase();
    if (!c || q <= 0) continue;

    if (EQUIVALENTES[c]) { add(prodPorNombre.get(EQUIVALENTES[c]), q, c); continue; }

    const pps = ppPorCodigo(c);
    if (/^0502/.test(c) && pps.length) {
      let pp = pps.length === 1 ? pps[0] : null, cant = q;
      if (!pp && c === '0502031') {
        const porCant = { 1: 'PP PLATEADA (UN)', 0.5: 'PP MECHADA 100 GR RENDIMIENTO = 0.5 PP PLATEADA', 0.75: 'PP MECHADA 150 GR RENDIMIENTO = 0.75 PP PLATEADA' }[q];
        pp = prodPorNombre.get(porCant ?? 'PP PLATEADA (UN)');
        if (porCant && porCant !== 'PP PLATEADA (UN)') cant = 1;
      }
      if (!pp) {
        const g = um === 'GR' ? q : um === 'KG' ? q * 1000 : null;
        pp = pps.find(p => gramosPP(p.nombre) === g);
        if (pp) cant = 1;
      }
      if (!pp) { avisos.push(`${plato.codigo_toteat} ${plato.nombre}: no sé qué PP usar para ${c} ${ing.nombre} ${q} ${um}`); continue; }
      add(pp, cant, c);
      continue;
    }

    if (esCarne(c)) {
      const ppActual = actualesPP.find(p => p.codigo === c);
      if (ppActual) { add(ppActual, Number(actuales.find(a => a.producto_nombre === ppActual.nombre).cantidad), c); continue; }
      const g = um === 'KG' ? q * 1000 : um === 'GR' ? q : null;
      const ppG = g ? pps.find(p => gramosPP(p.nombre) === g) : null;
      if (ppG) { add(ppG, 1, c); continue; }
      const crudas = crudaPorCodigo(c);
      if (crudas.length !== 1) { avisos.push(`${plato.codigo_toteat} ${plato.nombre}: ${c} ${ing.nombre} → ${crudas.length ? 'varios productos con ese código: ' + crudas.map(p => p.nombre).join(' / ') : 'no está en Control Cárnicos'}`); continue; }
      const cant = conv(q, um, crudas[0].unidad_medida);
      if (cant === null) { avisos.push(`${plato.codigo_toteat} ${plato.nombre}: no convierte ${um}→${crudas[0].unidad_medida} (${ing.nombre})`); continue; }
      add(crudas[0], cant, c);
      continue;
    }

    if (tieneCarne(c) && !NO_DESGLOSAR.has(c)) { // PP intermedio con carne que no está en la tabla de PP → desglose
      const rec = recetaPP.get(c);
      const qRend = conv(q, um, rec.unidad_rendimiento);
      if (qRend === null) { avisos.push(`${plato.codigo_toteat} ${plato.nombre}: no convierte ${um}→${rec.unidad_rendimiento} para desglosar ${rec.nombre}`); continue; }
      const factor = qRend / Number(rec.rendimiento);
      for (const ri of rec.pp_receta_ingredientes.filter(i => esCarne(i.codigo_ingrediente))) {
        const crudas = crudaPorCodigo(ri.codigo_ingrediente);
        if (crudas.length !== 1) { avisos.push(`${plato.codigo_toteat} ${plato.nombre}: desglose ${rec.nombre} → ${ri.codigo_ingrediente} ${ri.nombre_ingrediente} ${crudas.length ? 'ambiguo' : 'no está en Control Cárnicos'}`); continue; }
        const cant = conv(Number(ri.cantidad) * factor, ri.unidad_medida, crudas[0].unidad_medida);
        if (cant === null) { avisos.push(`${plato.codigo_toteat} ${plato.nombre}: desglose ${rec.nombre} no convierte ${ri.unidad_medida}→${crudas[0].unidad_medida}`); continue; }
        add(crudas[0], cant, `${c} desglose`);
      }
    }
  }
  return out.map(o => ({ ...o, cant: r4(o.cant) }));
}

// Plato de Costos por código Toteat (si hay varios activos con el mismo código, el primero con carne)
const platosCosto = new Map();
for (const p of carta.filter(c => c.activo && c.codigo_toteat && c.tipo_carta !== 'BEBESTIBLES')) {
  const actuales = cplatos.filter(x => x.codigo_toteat === p.codigo_toteat && x.activo);
  const lineas = lineasCarne(p, actuales);
  const prev = platosCosto.get(p.codigo_toteat);
  if (!prev || (!prev.lineas.length && lineas.length)) platosCosto.set(p.codigo_toteat, { plato: p, lineas, actuales });
}

// Códigos Toteat que se siguen vendiendo pero no están en Costos: descuentan igual que su plato gemelo
// (decisión de la usuaria 2026-11-10: "venden de los dos platos, misma cantidad, dos códigos").
const GEMELOS = {
  K15072: 'K15017', // PERNIL BOCKMEISTER        = PERNIL DE CERDO
  K15005: 'K13081', // ENTRAÑA                   = ENTRAÑA TOROBAYO
  K14051: 'K14036', // SMASH HAUS                = CLASSIC SMASH BURGER
  K14050: 'K14036', // SMASH MEISTER             = CLASSIC SMASH BURGER
  K14043: 'K14028', // SLOPMEISTER               = SLOPPY JAMES
  K15024: 'K15089', // PORCION DE SALMON         = PORCION SALMON CREMOSO
  K14052: 'K14013', // MECHADA BAYO              = MECHADA DE RES
  K15082: 'K15091', // PLATEADA DOPPELMALZ       = PLATEADA CON CANASTO
};
for (const [viejo, base] of Object.entries(GEMELOS)) {
  const b = platosCosto.get(base);
  const actuales = cplatos.filter(x => x.codigo_toteat === viejo && x.activo);
  if (!b || platosCosto.has(viejo) || !actuales.length) continue;
  const plato = { ...b.plato, codigo_toteat: viejo, nombre: actuales[0].plato_nombre, categoria: actuales[0].categoria };
  platosCosto.set(viejo, { plato, lineas: b.lineas, actuales });
}

const inserts = [], updates = [], desactivar = [], informe = [];
for (const [cod, { plato, lineas, actuales }] of platosCosto) {
  if (EXCLUIR.has(cod)) { informe.push(`- ${cod} ${plato.nombre}: excluido del control, no se toca`); continue; }
  if (MANTENER.has(cod)) { informe.push(`= ${cod} ${plato.nombre}: se mantiene como está`); continue; }
  if (!lineas.length && !actuales.length) continue;
  const cambios = [];
  for (const l of lineas) {
    const fila = cplatos.find(x => x.codigo_toteat === cod && x.producto_nombre === l.prod.nombre);
    if (!fila) {
      inserts.push({ categoria: plato.categoria || 'SIN CATEGORIA', codigo_toteat: cod, plato_nombre: plato.nombre, producto_id: l.prod.id, codigo_producto: l.prod.codigo, producto_nombre: l.prod.nombre, unidad_medida: l.prod.unidad_medida, cantidad: l.cant, activo: true });
      cambios.push(`+ ${l.prod.nombre} ${l.cant} ${l.prod.unidad_medida}`);
    } else if (!fila.activo || Math.abs(Number(fila.cantidad) - l.cant) > 1e-4 || fila.producto_id !== l.prod.id || fila.unidad_medida !== l.prod.unidad_medida) {
      updates.push({ id: fila.id, cantidad: l.cant, activo: true, producto_id: l.prod.id, codigo_producto: l.prod.codigo, unidad_medida: l.prod.unidad_medida, advertencia: null });
      cambios.push(`~ ${l.prod.nombre} ${fila.activo ? Number(fila.cantidad) : 'inactivo'} → ${l.cant} ${l.prod.unidad_medida}`);
    }
  }
  for (const a of actuales) {
    if (!lineas.some(l => l.prod.nombre === a.producto_nombre)) { desactivar.push(a.id); cambios.push(`- ${a.producto_nombre} ${a.cantidad} ${a.unidad_medida} (ya no está en la receta de Costos)`); }
  }
  if (cambios.length) informe.push(`${cod} ${plato.nombre}\n    ${cambios.join('\n    ')}`);
}

const sinCosto = [...new Set(cplatos.filter(x => x.activo && !platosCosto.has(x.codigo_toteat)).map(x => `${x.codigo_toteat} ${x.plato_nombre}`))];

console.log(informe.join('\n'));
console.log(`\nResumen: ${inserts.length} filas nuevas, ${updates.length} actualizadas, ${desactivar.length} desactivadas.`);
if (avisos.length) console.log('\nAVISOS:\n  ' + avisos.join('\n  '));
console.log(`\nEn Control Cárnicos sin plato activo en Costos (${sinCosto.length}, no se tocan):\n  ` + sinCosto.join('\n  '));

if (DRY) process.exit(0);

await fs.mkdir('scripts/backups', { recursive: true });
const bk = `scripts/backups/carnicos_platos_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
await fs.writeFile(bk, JSON.stringify(cplatos, null, 1));
console.log(`\nRespaldo: ${bk}`);
const ahora = new Date().toISOString();
if (inserts.length) { const { error } = await sb.from('carnicos_platos').insert(inserts); if (error) throw error; }
for (const u of updates) { const { id, ...rest } = u; const { error } = await sb.from('carnicos_platos').update({ ...rest, updated_at: ahora }).eq('id', id); if (error) throw error; }
if (desactivar.length) { const { error } = await sb.from('carnicos_platos').update({ activo: false, updated_at: ahora }).in('id', desactivar); if (error) throw error; }
console.log('Aplicado.');
