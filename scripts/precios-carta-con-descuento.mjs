// Recalcula carta.precio_carta desde Toteat (pedido de la usuaria 2026-11-09):
//   precio = (venta total Toteat + descuento) / cantidad vendida
// Misma regla que el botón "Actualizar precio" de Costos (lib/precio-carta-toteat.ts).
// "venta total" = lo pagado (payed, ya con el descuento restado) y "descuento" = discounts (negativo en Toteat),
// así que se suma de vuelta el valor absoluto del descuento. Período: últimos 30 días; si no hubo ventas, 90.
// Cruce por carta.codigo_toteat. Respaldo previo en scripts/backups y detalle en Excel.
// Uso: node --no-warnings --import ./scripts/_register-alias.mjs scripts/precios-carta-con-descuento.mjs [--dry-run] [--solo-sin-precio] [desde=YYYY-MM-DD] [hasta=YYYY-MM-DD]
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
for (const k of Object.keys(env)) if (k.startsWith('TOTEAT')) process.env[k] = env[k];
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = r => { if (r.error) throw r.error; return r.data; };
const { fetchToteatSales } = await import('@/lib/toteat');

const { calcularPreciosToteat, rangoPrecioToteat, ventanasPorDefecto } = await import('@/lib/precio-carta-toteat');
const argHasta = process.argv.find(a => a.startsWith('hasta='))?.slice(6);
const argDesde = process.argv.find(a => a.startsWith('desde='))?.slice(6);
// --solo-sin-precio: solo rellena platos sin precio_carta (no toca los que ya tienen).
const SOLO_SIN_PRECIO = process.argv.includes('--solo-sin-precio');
const rango = rangoPrecioToteat(argHasta);
const D90 = argDesde ?? rango.desde90, HASTA = rango.hasta;
const ventanas = argDesde ? [{ desde: argDesde, periodo: `desde ${argDesde}` }] : ventanasPorDefecto(rango);

console.log(`Consultando Toteat ${D90} → ${HASTA}…`);
const { items } = await fetchToteatSales(D90, HASTA, { soloComida: false });
const precios = calcularPreciosToteat(items, ventanas);
const buscar = code => precios.get(code.toUpperCase()) ?? null;

const carta = must(await sb.from('carta').select('id, nombre, categoria, tipo_carta, codigo_toteat, precio_carta, activo'));
const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'America/Santiago' }).slice(0, 16).replace(/[-: ]/g, '');
if (!DRY) await fs.writeFile(`scripts/backups/carta_precio_carta_antes_${stamp}.json`, JSON.stringify(carta.map(c => ({ id: c.id, nombre: c.nombre, precio_carta: c.precio_carta })), null, 1));

const filas = [];
for (const c of carta) {
  const code = (c.codigo_toteat ?? '').trim();
  const t = code ? buscar(code) : null;
  const antes = Number(c.precio_carta) || null;
  const cambia = !!t && t.precio !== antes && (!SOLO_SIN_PRECIO || !(antes > 0));
  filas.push({ c, t, antes, cambia });
  if (cambia && !DRY) must(await sb.from('carta').update({ precio_carta: t.precio }).eq('id', c.id));
}
const cambiados = filas.filter(f => f.cambia);
console.log(`${DRY ? '[dry-run] ' : ''}platos con código Toteat: ${filas.filter(f => (f.c.codigo_toteat ?? '').trim()).length} · con ventas: ${filas.filter(f => f.t).length} · precio cambiado: ${cambiados.length} (antes sin precio: ${cambiados.filter(f => !f.antes).length}) · sin ventas (${ventanas.at(-1).periodo}): ${filas.filter(f => (f.c.codigo_toteat ?? '').trim() && !f.t).length}`);
for (const f of cambiados.slice(0, 15)) console.log(`  ${f.c.codigo_toteat} ${f.c.nombre}: ${f.antes ?? '-'} → ${f.t.precio}  ((${Math.round(f.t.venta)} + ${Math.round(-f.t.descuento)}) / ${f.t.cantidad}, ${f.t.periodo})`);

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Precios');
const cols = [['Cód. Toteat', 12], ['Plato', 44], ['Categoría', 28], ['Tipo carta', 12], ['Activo', 8], ['Precio anterior', 14], ['Venta Toteat', 14], ['Descuento', 13], ['Cantidad', 10], ['Precio nuevo', 14], ['Diferencia', 12], ['Periodo', 10], ['Acción', 24]];
ws.columns = cols.map(([header, width]) => ({ header, width }));
ws.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF31869B' } }; });
ws.views = [{ state: 'frozen', ySplit: 1 }];
ws.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } };
const money = '"$"#,##0';
for (const { c, t, antes, cambia } of filas.sort((a, b) => a.c.categoria.localeCompare(b.c.categoria) || a.c.nombre.localeCompare(b.c.nombre))) {
  const accion = !(c.codigo_toteat ?? '').trim() ? 'Sin código Toteat' : !t ? `Sin ventas (${ventanas.at(-1).periodo})` : cambia ? (DRY ? 'Cambiaría' : 'Actualizado') : SOLO_SIN_PRECIO && antes > 0 ? 'Ya tenía precio (no tocado)' : 'Sin cambio';
  const r = ws.addRow([c.codigo_toteat ?? '', c.nombre, c.categoria, c.tipo_carta, c.activo ? 'Sí' : 'No', antes, t ? Math.round(t.venta) : null, t ? Math.round(t.descuento) : null, t?.cantidad ?? null, t?.precio ?? null, t && antes ? t.precio - antes : null, t?.periodo ?? '', accion]);
  for (const i of [6, 7, 8, 10, 11]) r.getCell(i).numFmt = money;
}
const salida = `../Precios_carta_con_descuento_${SOLO_SIN_PRECIO ? 'sin_precio_' : ''}${DRY ? 'prueba_' : ''}${stamp}.xlsx`;
await wb.xlsx.writeFile(salida);
console.log('Excel:', salida);
