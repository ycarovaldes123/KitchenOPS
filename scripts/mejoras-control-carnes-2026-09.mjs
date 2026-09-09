// Mejoras Control de Carnes (2026-09):
//   1. Renombra "PP SALMON TROZO GR (250"  -> "PP SALMON TROZO GR (250)"
//   2. Renombra "PP SALMON CEVICHE GR"     -> "PP SALMON CEVICHE (GR)"
//   3. MECHADA: repunta los platos/movimientos/inventarios/ventas de
//      "PP MECHADA NIDO GR (100 GR)" a "PP MECHADA 100 GR RENDIMIENTO = 0.5 PP PLATEADA"
//      y desactiva el producto NIDO.
//   4. Agrega "PP OSOBUCO (UND)" (PP) y lo relaciona con el codigo de venta K15041
//      (OSOBUCO CON PASTELERA DE CHOCLO).
//
// Idempotente. Uso:
//   node scripts/mejoras-control-carnes-2026-09.mjs --dry-run
//   node scripts/mejoras-control-carnes-2026-09.mjs

import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

const RENOMBRES = [
  { de: 'PP SALMON TROZO GR (250', a: 'PP SALMON TROZO GR (250)' },
  { de: 'PP SALMON CEVICHE GR', a: 'PP SALMON CEVICHE (GR)' },
];

const MECHADA_NIDO = 'PP MECHADA NIDO GR (100 GR)';
const MECHADA_100 = 'PP MECHADA 100 GR RENDIMIENTO = 0.5 PP PLATEADA';

const OSOBUCO_PP = {
  tipo: 'PRODUCTOS PROCESADOS',
  codigo: '0301042',
  nombre: 'PP OSOBUCO (UND)',
  unidad_medida: 'UN',
  es_pp: true,
  activo: true,
  costo_unitario: 3214,
};
const OSOBUCO_PLATO = {
  categoria: 'PLATOS',
  codigo_toteat: 'K15041',
  plato_nombre: 'OSOBUCO CON PASTELERA DE CHOCLO',
  codigo_producto: '0301042',
  producto_nombre: 'PP OSOBUCO (UND)',
  unidad_medida: 'UN',
  cantidad: 1,
  activo: true,
};

const env = Object.fromEntries(
  (await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
    .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a) => console.log(DRY_RUN ? '[dry-run]' : '[aplicar]', ...a);

async function getProductoPorNombre(nombre) {
  const { data, error } = await supabase.from('carnicos_productos').select('*').eq('nombre', nombre).maybeSingle();
  if (error) throw new Error(`${nombre}: ${error.message}`);
  return data;
}

// ── 1 y 2: renombres simples ───────────────────────────────────────────────
for (const { de, a } of RENOMBRES) {
  const prod = await getProductoPorNombre(de);
  if (!prod) {
    const yaRenombrado = await getProductoPorNombre(a);
    log(yaRenombrado ? `OK ya renombrado: "${a}"` : `AVISO: no existe "${de}" ni "${a}"`);
    continue;
  }
  log(`Renombrar producto ${prod.id}: "${de}" -> "${a}"`);
  if (!DRY_RUN) {
    const upd = [
      supabase.from('carnicos_productos').update({ nombre: a, updated_at: new Date().toISOString() }).eq('id', prod.id),
      supabase.from('carnicos_platos').update({ producto_nombre: a }).eq('producto_id', prod.id),
      supabase.from('carnicos_movimientos').update({ producto_nombre: a }).eq('producto_id', prod.id),
      supabase.from('carnicos_inventarios').update({ producto_nombre: a }).eq('producto_id', prod.id),
    ];
    for (const p of upd) { const { error } = await p; if (error) throw new Error(`${de}: ${error.message}`); }
  }
}

// ── 3: MECHADA NIDO -> MECHADA 100 GR ──────────────────────────────────────
{
  const nido = await getProductoPorNombre(MECHADA_NIDO);
  const cien = await getProductoPorNombre(MECHADA_100);
  if (!cien) throw new Error(`No existe el producto destino "${MECHADA_100}"`);
  if (!nido) {
    log(`OK MECHADA: "${MECHADA_NIDO}" ya no existe`);
  } else if (nido.id === cien.id) {
    log('MECHADA: mismo id, nada que hacer');
  } else {
    log(`MECHADA: repuntar ${nido.id} -> ${cien.id} y desactivar NIDO`);

    // inventarios: puede chocar con unique(fecha,bodega,tipo,producto_id). En colision se SUMA
    // la cantidad NIDO al conteo existente de 100GR (son items contados por separado el mismo dia).
    const { data: invNido } = await supabase.from('carnicos_inventarios').select('id,fecha,bodega,tipo,cantidad').eq('producto_id', nido.id);
    const { data: invCien } = await supabase.from('carnicos_inventarios').select('id,fecha,bodega,tipo,cantidad').eq('producto_id', cien.id);
    const cienPorClave = new Map((invCien ?? []).map(r => [`${r.fecha}|${r.bodega}|${r.tipo}`, r]));
    const invColisiones = (invNido ?? []).filter(r => cienPorClave.has(`${r.fecha}|${r.bodega}|${r.tipo}`));
    const invMovibles = (invNido ?? []).filter(r => !cienPorClave.has(`${r.fecha}|${r.bodega}|${r.tipo}`));
    log(`  inventarios NIDO: ${invNido?.length ?? 0} (${invMovibles.length} se repuntan, ${invColisiones.length} se suman al conteo 100GR existente)`);
    for (const r of invColisiones) {
      const dest = cienPorClave.get(`${r.fecha}|${r.bodega}|${r.tipo}`);
      log(`    ${r.fecha} ${r.bodega} ${r.tipo}: ${dest.cantidad} + ${r.cantidad} = ${Number(dest.cantidad) + Number(r.cantidad)}`);
    }

    // ventas_registradas: unique(fecha,codigo_toteat,producto_id)
    const { data: vrNido } = await supabase.from('carnicos_ventas_registradas').select('id,fecha,codigo_toteat').eq('producto_id', nido.id);
    const { data: vrCien } = await supabase.from('carnicos_ventas_registradas').select('fecha,codigo_toteat').eq('producto_id', cien.id);
    const clavesVr = new Set((vrCien ?? []).map(r => `${r.fecha}|${r.codigo_toteat}`));
    const vrColisiones = (vrNido ?? []).filter(r => clavesVr.has(`${r.fecha}|${r.codigo_toteat}`));
    const vrMovibles = (vrNido ?? []).filter(r => !clavesVr.has(`${r.fecha}|${r.codigo_toteat}`));
    log(`  ventas_registradas NIDO: ${vrNido?.length ?? 0} (${vrMovibles.length} se repuntan, ${vrColisiones.length} colisionan y se eliminan)`);

    // platos: unique(codigo_toteat,producto_nombre)
    const { data: plNido } = await supabase.from('carnicos_platos').select('id,codigo_toteat,plato_nombre').eq('producto_id', nido.id);
    log(`  platos NIDO: ${(plNido ?? []).map(p => `${p.codigo_toteat} "${p.plato_nombre}"`).join(', ')}`);

    const { count: movCount } = await supabase.from('carnicos_movimientos').select('id', { count: 'exact', head: true }).eq('producto_id', nido.id);
    log(`  movimientos NIDO: ${movCount}`);

    if (!DRY_RUN) {
      for (const r of invColisiones) {
        const dest = cienPorClave.get(`${r.fecha}|${r.bodega}|${r.tipo}`);
        const e1 = await supabase.from('carnicos_inventarios')
          .update({ cantidad: Number(dest.cantidad) + Number(r.cantidad) }).eq('id', dest.id);
        if (e1.error) throw new Error(`inv suma: ${e1.error.message}`);
        const e2 = await supabase.from('carnicos_inventarios').delete().eq('id', r.id);
        if (e2.error) throw new Error(`inv borrar NIDO: ${e2.error.message}`);
      }
      if (invMovibles.length) {
        const { error } = await supabase.from('carnicos_inventarios')
          .update({ producto_id: cien.id, producto_nombre: MECHADA_100 }).in('id', invMovibles.map(r => r.id));
        if (error) throw new Error(`inv repunte: ${error.message}`);
      }
      if (vrColisiones.length) {
        const { error } = await supabase.from('carnicos_ventas_registradas').delete().in('id', vrColisiones.map(r => r.id));
        if (error) throw new Error(`vr colisiones: ${error.message}`);
      }
      if (vrMovibles.length) {
        const { error } = await supabase.from('carnicos_ventas_registradas')
          .update({ producto_id: cien.id }).in('id', vrMovibles.map(r => r.id));
        if (error) throw new Error(`vr repunte: ${error.message}`);
      }
      const r1 = await supabase.from('carnicos_movimientos')
        .update({ producto_id: cien.id, producto_nombre: MECHADA_100 }).eq('producto_id', nido.id);
      if (r1.error) throw new Error(`mov repunte: ${r1.error.message}`);
      const r2 = await supabase.from('carnicos_platos')
        .update({ producto_id: cien.id, producto_nombre: MECHADA_100, codigo_producto: cien.codigo }).eq('producto_id', nido.id);
      if (r2.error) throw new Error(`platos repunte: ${r2.error.message}`);
      const r3 = await supabase.from('carnicos_productos')
        .update({ activo: false, updated_at: new Date().toISOString() }).eq('id', nido.id);
      if (r3.error) throw new Error(`desactivar NIDO: ${r3.error.message}`);
    }
  }
}

// ── 4: OSOBUCO PP + relacion K15041 ───────────────────────────────────────
{
  let osobuco = await getProductoPorNombre(OSOBUCO_PP.nombre);
  if (!osobuco) {
    log(`Crear producto "${OSOBUCO_PP.nombre}"`);
    if (!DRY_RUN) {
      const { data, error } = await supabase.from('carnicos_productos').insert(OSOBUCO_PP).select().single();
      if (error) throw new Error(`crear OSOBUCO PP: ${error.message}`);
      osobuco = data;
    }
  } else {
    log(`OK producto "${OSOBUCO_PP.nombre}" ya existe (${osobuco.id})`);
    if (!DRY_RUN) {
      const { error } = await supabase.from('carnicos_productos')
        .update({ ...OSOBUCO_PP, updated_at: new Date().toISOString() }).eq('id', osobuco.id);
      if (error) throw new Error(`actualizar OSOBUCO PP: ${error.message}`);
    }
  }

  const { data: platoExist } = await supabase.from('carnicos_platos')
    .select('id').eq('codigo_toteat', OSOBUCO_PLATO.codigo_toteat).eq('producto_nombre', OSOBUCO_PLATO.producto_nombre).maybeSingle();
  const fila = { ...OSOBUCO_PLATO, producto_id: osobuco?.id ?? (DRY_RUN ? 'dry-osobuco' : null) };
  log(platoExist ? `OK relacion K15041 ya existe, se actualiza` : `Crear relacion plato K15041 -> "${OSOBUCO_PP.nombre}"`);
  if (!DRY_RUN) {
    const { error } = await supabase.from('carnicos_platos').upsert(fila, { onConflict: 'codigo_toteat,producto_nombre' });
    if (error) throw new Error(`relacion K15041: ${error.message}`);
  }
}

log(DRY_RUN ? 'Fin dry-run (no se escribio nada).' : 'Listo.');
