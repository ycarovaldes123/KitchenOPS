// Rellena carta.precio_carta de los platos SIN precio usando las ventas de Toteat, cruzando por codigo_toteat.
// Precio = el precio unitario (netPrice de Toteat, precio de carta con IVA) más vendido de los últimos 30 días;
// si no hubo ventas en 30 días, el más vendido de los últimos 90. Los platos que ya tienen precio NO se tocan:
// sus diferencias con Toteat quedan en el Excel para revisión.
// Uso: node --no-warnings --import ./scripts/_register-alias.mjs scripts/precios-carta-desde-toteat.mjs [--dry-run] [hasta=YYYY-MM-DD]
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const ACTUALIZAR_DISTINTOS = process.argv.includes('--actualizar-distintos');
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
for (const k of Object.keys(env)) if (k.startsWith('TOTEAT')) process.env[k] = env[k];
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = r => { if (r.error) throw r.error; return r.data; };
const { fetchToteatSales } = await import('@/lib/toteat');

const iso = d => d.toISOString().slice(0, 10);
const argHasta = process.argv.find(a => a.startsWith('hasta='))?.slice(6);
const hasta = argHasta ? new Date(`${argHasta}T12:00:00Z`) : new Date(Date.now() - 86400000);
const menos = n => { const d = new Date(hasta); d.setUTCDate(d.getUTCDate() - n); return iso(d); };
const D30 = menos(29), D90 = menos(89), HASTA = iso(hasta);

console.log(`Consultando Toteat ${D90} → ${HASTA}…`);
const { items } = await fetchToteatSales(D90, HASTA, { soloComida: false });

function modas(desde) {
  const m = new Map();
  for (const i of items) {
    if (i.fecha < desde) continue;
    const d = i.raw?.detail ?? {};
    const code = String(d.id ?? i.product_code ?? '').trim();
    const precio = Number(d.netPrice);
    if (!code || !(precio > 0)) continue;
    if (!m.has(code)) m.set(code, { nombre: d.name ?? i.product_name, precios: new Map() });
    const e = m.get(code);
    e.precios.set(precio, (e.precios.get(precio) ?? 0) + (Number(d.quantity) || 1));
  }
  const out = new Map();
  for (const [code, e] of m) {
    const arr = [...e.precios].sort((a, b) => b[1] - a[1]);
    const unid = arr.reduce((s, x) => s + x[1], 0);
    out.set(code, { nombre: e.nombre, precio: arr[0][0], unid, pct: arr[0][1] / unid, otros: arr.slice(1, 4).map(([p, q]) => `$${p.toLocaleString('es-CL')} (${q} u.)`).join(', ') });
  }
  return out;
}
const m30 = modas(D30), m90 = modas(D90);
const buscar = code => m30.has(code) ? { ...m30.get(code), periodo: '30 días' } : m90.has(code) ? { ...m90.get(code), periodo: '90 días' } : null;
const confianza = t => t.unid >= 5 && t.pct >= 0.5 ? 'Alta' : 'Baja';

const carta = must(await sb.from('carta').select('id, nombre, categoria, tipo_carta, codigo_toteat, precio_carta, activo'));
const actualizados = [], sinVentas = [], diferencias = [];
for (const c of carta) {
  const code = (c.codigo_toteat ?? '').trim();
  if (!code) continue;
  const t = buscar(code);
  const tiene = Number(c.precio_carta) > 0;
  if (!tiene) {
    if (!t) { sinVentas.push(c); continue; }
    actualizados.push({ c, t });
    if (!DRY) must(await sb.from('carta').update({ precio_carta: t.precio }).eq('id', c.id));
  } else if (t && Math.abs(t.precio - Number(c.precio_carta)) >= 1) {
    // --actualizar-distintos: también pisa el precio existente con el de Toteat, solo si la confianza es Alta.
    const aplicar = ACTUALIZAR_DISTINTOS && confianza(t) === 'Alta';
    diferencias.push({ c, t, aplicado: aplicar });
    if (aplicar && !DRY) must(await sb.from('carta').update({ precio_carta: t.precio }).eq('id', c.id));
  }
}
const sinCodigo = carta.filter(c => !(c.codigo_toteat ?? '').trim() && !(Number(c.precio_carta) > 0));

console.log(`${DRY ? '[dry-run] ' : ''}precios rellenados: ${actualizados.length} (baja confianza: ${actualizados.filter(x => confianza(x.t) === 'Baja').length}) · sin ventas en 90 días: ${sinVentas.length} · sin código Toteat y sin precio: ${sinCodigo.length} · con precio distinto a Toteat: ${diferencias.length} (actualizados: ${diferencias.filter(d => d.aplicado).length})`);
for (const d of diferencias) console.log(`  ${d.aplicado ? '✓' : '·'} ${d.c.codigo_toteat} ${d.c.nombre}: ${d.c.precio_carta} → ${d.t.precio} (${d.t.unid} u., ${Math.round(d.t.pct * 100)}%)${d.aplicado ? '' : ' NO TOCADO'}`);

// ── Excel ────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
const money = '"$"#,##0';
const hoja = (nombre, cols) => {
  const ws = wb.addWorksheet(nombre);
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  ws.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF31869B' } }; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } };
  return ws;
};
const amarillo = r => r.eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; });

const w1 = hoja('Precios rellenados', [['Cód. Toteat', 12], ['Plato', 44], ['Categoría', 28], ['Tipo carta', 12], ['Precio cargado', 14], ['Periodo', 10], ['Unid. vendidas', 13], ['% ventas a ese precio', 12], ['Confianza', 10], ['Otros precios vistos', 46]]);
for (const { c, t } of actualizados.sort((a, b) => a.c.categoria.localeCompare(b.c.categoria))) {
  const r = w1.addRow([c.codigo_toteat, c.nombre, c.categoria, c.tipo_carta, t.precio, t.periodo, t.unid, t.pct, confianza(t), t.otros]);
  r.getCell(5).numFmt = money; r.getCell(8).numFmt = '0%';
  if (confianza(t) === 'Baja') amarillo(r);
}
const w2 = hoja('Precio distinto', [['Cód. Toteat', 12], ['Plato', 44], ['Categoría', 28], ['Tipo carta', 12], ['Precio anterior', 15], ['Precio Toteat', 14], ['Diferencia', 12], ['Unid. vendidas', 13], ['Confianza', 10], ['Acción', 26], ['Otros precios vistos', 46]]);
for (const { c, t, aplicado } of diferencias) {
  const accion = aplicado ? 'Actualizado al de Toteat' : ACTUALIZAR_DISTINTOS ? 'NO tocado (baja confianza)' : 'NO tocado';
  const r = w2.addRow([c.codigo_toteat, c.nombre, c.categoria, c.tipo_carta, Number(c.precio_carta), t.precio, t.precio - Number(c.precio_carta), t.unid, confianza(t), accion, t.otros]);
  for (const i of [5, 6, 7]) r.getCell(i).numFmt = money;
  if (confianza(t) === 'Baja') amarillo(r);
}
const w3 = hoja('Sin precio (sin ventas)', [['Cód. Toteat', 12], ['Plato', 44], ['Categoría', 28], ['Tipo carta', 12], ['Motivo', 50]]);
for (const c of sinVentas) w3.addRow([c.codigo_toteat, c.nombre, c.categoria, c.tipo_carta, `Sin ventas con precio en Toteat entre ${D90} y ${HASTA}`]);
for (const c of sinCodigo) w3.addRow(['', c.nombre, c.categoria, c.tipo_carta, 'Sin código Toteat: no se puede cruzar']);

// Todos los platos con código Toteat: precio actual vs Toteat (sirve para revisar aunque el script ya se haya corrido)
const w4 = hoja('Todos vs Toteat', [['Cód. Toteat', 12], ['Plato', 44], ['Categoría', 28], ['Tipo carta', 12], ['Precio actual', 14], ['Precio Toteat', 14], ['Coincide', 10], ['Periodo', 10], ['Unid. vendidas', 13], ['% ventas a ese precio', 12], ['Confianza', 10], ['Otros precios vistos', 46]]);
const precioFinal = c => actualizados.find(x => x.c.id === c.id)?.t.precio ?? diferencias.find(x => x.c.id === c.id && x.aplicado)?.t.precio ?? (Number(c.precio_carta) || null);
for (const c of carta.filter(x => (x.codigo_toteat ?? '').trim()).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre))) {
  const t = buscar(c.codigo_toteat.trim());
  const actual = DRY ? (Number(c.precio_carta) || null) : precioFinal(c);
  const r = w4.addRow([c.codigo_toteat, c.nombre, c.categoria, c.tipo_carta, actual, t?.precio ?? null, t ? (actual === t.precio ? 'SÍ' : 'NO') : 'Sin ventas', t?.periodo ?? '', t?.unid ?? '', t?.pct ?? '', t ? confianza(t) : '', t?.otros ?? '']);
  r.getCell(5).numFmt = money; r.getCell(6).numFmt = money; r.getCell(10).numFmt = '0%';
  if (t && confianza(t) === 'Baja') amarillo(r);
}

const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'America/Santiago' }).slice(0, 16).replace(/[-: ]/g, '');
const salida = `../Precios_carta_toteat_${stamp}.xlsx`;
await wb.xlsx.writeFile(salida);
console.log('Excel:', salida);
