// Vuelve a registrar las ventas Toteat de Control Cárnicos en un rango de fechas con las recetas
// actuales de carnicos_platos (reemplaza las ventas ya registradas de esos días) y muestra la
// diferencia valorizada de la Tabla Resumen antes y después, por unidad y por producto.
// Respaldo de lo reemplazado en scripts/backups/.
// Uso: node --no-warnings --import ./scripts/_register-alias.mjs scripts/recalcular-ventas-carnicos.mjs 2026-08-01 2026-08-31 [--dry-run]
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const [desde, hasta] = process.argv.slice(2).filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
const DRY = process.argv.includes('--dry-run');
if (!desde || !hasta) throw new Error('Uso: recalcular-ventas-carnicos.mjs DESDE HASTA [--dry-run]');

const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
Object.assign(process.env, env);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { calcularResumenFilas, resolverHastaConConteoFinal } = await import('@/lib/carnicos-resumen.server');
const { fetchToteatSales } = await import('@/lib/toteat');
const { calcularConsumoCarnicos } = await import('@/lib/carnicos-ventas');
const { convertirCantidad } = await import('@/lib/unidades-carnicos');

const all = async (build) => {
  let out = [], i = 0;
  for (;;) { const { data, error } = await build().range(i, i + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; i += 1000; }
  return out;
};
const clp = n => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('es-CL');

async function resumen() {
  const hastaConteo = await resolverHastaConConteoFinal(sb, desde, hasta);
  const filas = await calcularResumenFilas(sb, desde, hastaConteo);
  return { hastaConteo, filas };
}
const totales = filas => {
  const t = { TOTAL: 0 };
  for (const f of filas) if (f.diferencia_valor !== null) { t[f.unidad_medida] = (t[f.unidad_medida] ?? 0) + f.diferencia_valor; t.TOTAL += f.diferencia_valor; }
  return t;
};

const antes = await resumen();
console.log(`Tabla Resumen ${desde} → ${antes.hastaConteo} (último conteo final)`);

// Ventas nuevas
const [platos, productos] = await Promise.all([
  all(() => sb.from('carnicos_platos').select('id,categoria,codigo_toteat,plato_nombre,producto_id,codigo_producto,producto_nombre,unidad_medida,cantidad,advertencia,activo').eq('activo', true).order('id')),
  all(() => sb.from('carnicos_productos').select('id,tipo,codigo,nombre,unidad_medida,es_pp,activo').eq('activo', true).order('id')),
]);
console.log('Consultando Toteat…');
const toteat = await fetchToteatSales(desde, hasta, { soloComida: true });
const porDia = new Map();
for (const it of toteat.items) (porDia.get(it.fecha) ?? porDia.set(it.fecha, []).get(it.fecha)).push({ fecha: it.fecha, product_code: it.product_code, product_name: it.product_name, quantity: it.quantity });

const movsNuevos = [], ventasNuevas = [], sinRelacion = new Map();
for (const [fecha, ventas] of [...porDia].sort()) {
  const { consumos, pendientes } = calcularConsumoCarnicos(ventas, platos, productos);
  for (const p of pendientes) if (p.tipo === 'codigo_toteat_sin_relacion') sinRelacion.set(p.codigo_toteat, p.plato_nombre);
  for (const c of consumos) {
    for (const o of c.platos_origen) {
      const consumo = convertirCantidad(o.cantidad_por_plato * o.cantidad_vendida, o.unidad_receta, c.unidad_medida);
      if (!consumo || consumo <= 0) continue;
      const id = randomUUID();
      movsNuevos.push({ id, fecha, responsable_id: null, responsable_nombre: 'Sistema Ventas Toteat', turno: null,
        observacion: `Venta Toteat ${o.codigo_toteat} - ${o.plato_nombre}`, bodega: 'COCINA', movimiento: 'SALIDA', subtipo: 'VENTAS',
        producto_id: c.producto_id, producto_nombre: c.producto_nombre, unidad_medida: c.unidad_medida, cantidad: consumo,
        origen: 'venta_toteat', created_by: 'recalculo-recetas-costos' });
      ventasNuevas.push({ fecha, codigo_toteat: o.codigo_toteat, plato_nombre: o.plato_nombre, cantidad_vendida: o.cantidad_vendida,
        producto_id: c.producto_id, cantidad_por_plato: o.cantidad_por_plato, unidad_medida: c.unidad_medida, consumo_total: consumo, movimiento_id: id });
    }
  }
}

// Ventas registradas hoy en el rango
const movsViejos = await all(() => sb.from('carnicos_movimientos').select('*').eq('subtipo', 'VENTAS').eq('origen', 'venta_toteat').gte('fecha', desde).lte('fecha', hasta).order('id'));
const ventasViejas = await all(() => sb.from('carnicos_ventas_registradas').select('*').gte('fecha', desde).lte('fecha', hasta).order('id'));

// Cambio de ventas por producto
const nombre = new Map(productos.map(p => [p.id, p]));
const delta = new Map();
for (const m of movsViejos) delta.set(m.producto_id, (delta.get(m.producto_id) ?? 0) - Number(m.cantidad));
for (const m of movsNuevos) delta.set(m.producto_id, (delta.get(m.producto_id) ?? 0) + Number(m.cantidad));
console.log(`\nDías con ventas Toteat: ${porDia.size}. Movimientos de venta: ${movsViejos.length} → ${movsNuevos.length}`);
console.log('\nCambio en VENTAS por producto (cantidad):');
for (const [id, d] of [...delta].filter(([, d]) => Math.abs(d) > 1e-4).sort((a, b) => (nombre.get(a[0])?.nombre ?? '').localeCompare(nombre.get(b[0])?.nombre ?? ''))) {
  const p = nombre.get(id); console.log(`  ${p?.nombre ?? id} (${p?.unidad_medida}): ${d > 0 ? '+' : ''}${Math.round(d * 10000) / 10000}`);
}
if (sinRelacion.size) console.log('\nCódigos vendidos sin receta de carne (no descuentan):\n  ' + [...sinRelacion].map(([c, n]) => `${c} ${n}`).join('\n  '));

if (DRY) process.exit(0);

await fs.mkdir('scripts/backups', { recursive: true });
const bk = `scripts/backups/carnicos_ventas_${desde}_${hasta}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
await fs.writeFile(bk, JSON.stringify({ movimientos: movsViejos, ventas_registradas: ventasViejas }, null, 1));
console.log(`\nRespaldo: ${bk}`);

// Reemplazo: borrar movimientos (cascada borra ventas_registradas) + huérfanas, insertar nuevos
for (let i = 0; i < movsViejos.length; i += 200) {
  const { error } = await sb.from('carnicos_movimientos').delete().in('id', movsViejos.slice(i, i + 200).map(m => m.id)); if (error) throw error;
}
{ const { error } = await sb.from('carnicos_ventas_registradas').delete().gte('fecha', desde).lte('fecha', hasta); if (error) throw error; }
for (let i = 0; i < movsNuevos.length; i += 500) { const { error } = await sb.from('carnicos_movimientos').insert(movsNuevos.slice(i, i + 500)); if (error) throw error; }
for (let i = 0; i < ventasNuevas.length; i += 500) { const { error } = await sb.from('carnicos_ventas_registradas').insert(ventasNuevas.slice(i, i + 500)); if (error) throw error; }

const despues = await resumen();
const ta = totales(antes.filas), td = totales(despues.filas);
console.log('\nDiferencia valorizada (Tabla Resumen):  antes → después');
for (const k of [...new Set([...Object.keys(ta), ...Object.keys(td)])].filter(k => k !== 'TOTAL').concat('TOTAL')) {
  console.log(`  ${k.padEnd(6)} ${clp(ta[k] ?? 0).padStart(14)} → ${clp(td[k] ?? 0).padStart(14)}`);
}
const fa = new Map(antes.filas.map(f => [f.producto_id, f]));
console.log('\nPor producto (diferencia $ antes → después):');
for (const f of despues.filas) {
  const a = fa.get(f.producto_id);
  if (a && Math.abs((a.diferencia_valor ?? 0) - (f.diferencia_valor ?? 0)) >= 1)
    console.log(`  ${f.producto_nombre} (${f.unidad_medida}): ventas ${a.ventas} → ${f.ventas} | dif ${a.diferencia} → ${f.diferencia} | ${clp(a.diferencia_valor ?? 0)} → ${clp(f.diferencia_valor ?? 0)}`);
}
