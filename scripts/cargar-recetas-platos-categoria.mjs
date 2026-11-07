// Costos: carga ../recetas_platos_por_categoria.xlsx (hoja "Recetas", 2026-11-07). Una fila por insumo, agrupado por Plato.
// Reglas acordadas con la usuaria:
// - Plato que YA existe (mismo código Toteat, mismo código Softland, o mismo nombre en un plato sin código Toteat):
//   no se duplica ni se toca su receta; solo se mueve a la categoría del Excel.
//   Si una fila del sistema coincide con varios platos del Excel, manda la coincidencia por código Toteat.
// - Categorías con nombre del sistema: SANDWICH Y HAMBURGUESAS → SANDWICH & BURGERS, AGREGADOS Y ACOMPAÑAMIENTOS → AGREGADOS Y PORCIONES.
// - tipo_carta: categorías "... PEDIDOS YA" → PEDIDOSYA; el resto → NUEVA (Carta actual).
// - Cantidad en la U/M del producto; costo desde productos.costo_promedio.
// Genera ../Platos_carga_2026-11-07.xlsx con el detalle. Uso: node scripts/cargar-recetas-platos-categoria.mjs [--dry-run]
import fs from 'node:fs/promises';
import X from 'xlsx';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const RUTA = '../recetas_platos_por_categoria.xlsx';
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/)
  .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = r => { if (r.error) throw r.error; return r.data; };
const norm = s => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[.\-]+$/, '').replace(/\s+/g, ' ');

const CATEGORIA = {
  'AGREGADOS Y ACOMPANAMIENTOS': 'AGREGADOS Y PORCIONES',
  'CATERING': 'CATERING',
  'ENSALADAS': 'ENSALADAS',
  'ENSALADAS PEDIDOS YA': 'ENSALADAS PEDIDOS YA',
  'PICADAS': 'PICADAS',
  'PICADAS EVENTO': 'PICADAS EVENTO',
  'PICADAS PEDIDOS YA': 'PICADAS PEDIDOS YA',
  'PICADAS PROMOCION': 'PICADAS PROMOCIÓN',
  'PLATOS': 'PLATOS',
  'POSTRES': 'POSTRES',
  'POSTRES PEDIDOS YA': 'POSTRES PEDIDOS YA',
  'SANDWICH PERSONAL': 'SANDWICH PERSONAL',
  'SANDWICH Y HAMBURGUESAS': 'SANDWICH & BURGERS',
  'SANDWICH Y HAMBURGUESAS PEDIDOS YA': 'SANDWICH & BURGERS PEDIDOS YA',
};
const tipoCarta = cat => cat.endsWith('PEDIDOS YA') ? 'PEDIDOSYA' : 'NUEVA';

// ── Excel → platos ───────────────────────────────────────
const wb = X.readFile(RUTA);
const filas = X.utils.sheet_to_json(wb.Sheets['Recetas'] ?? wb.Sheets[wb.SheetNames[0]]);
const platos = new Map();
for (const f of filas) {
  const nombre = String(f['Plato'] ?? '').trim();
  if (!nombre) continue;
  const cat = CATEGORIA[norm(f['Categoría'])];
  if (!cat) throw new Error(`Categoría no reconocida: ${f['Categoría']} (${nombre})`);
  const key = `${nombre}|${f['Código Toteat'] ?? ''}`;
  if (!platos.has(key)) platos.set(key, {
    nombre, catExcel: String(f['Categoría']).trim(), categoria: cat,
    cod_softland: String(f['Código Softland'] ?? '').trim() || null,
    codigo_toteat: String(f['Código Toteat'] ?? '').trim() || null,
    lineas: [], obs: new Set(),
  });
  const p = platos.get(key);
  p.lineas.push({ codigo: String(f['Código insumo']).trim(), cantidad: Number(f['Cantidad']) });
  if (String(f['Observación'] ?? '').trim()) p.obs.add(String(f['Observación']).trim());
}

// ── Cruce con la carta actual ────────────────────────────
const carta = must(await sb.from('carta').select('id, nombre, categoria, tipo_carta, cod_softland, codigo_toteat'));
const byT = new Map(carta.filter(c => c.codigo_toteat).map(c => [c.codigo_toteat, c]));
const byS = new Map(carta.filter(c => c.cod_softland).map(c => [String(c.cod_softland), c]));
const byN = new Map(carta.filter(c => !c.codigo_toteat).map(c => [norm(c.nombre), c]));
for (const p of platos.values()) {
  if (p.codigo_toteat && byT.has(p.codigo_toteat)) { p.existe = byT.get(p.codigo_toteat); p.por = 'Código Toteat'; }
  else if (p.cod_softland && byS.has(p.cod_softland)) { p.existe = byS.get(p.cod_softland); p.por = 'Código Softland'; }
  else if (byN.has(norm(p.nombre))) { p.existe = byN.get(norm(p.nombre)); p.por = 'Nombre (sin código Toteat)'; }
}
// Categoría destino por fila existente: manda la coincidencia por Toteat
const destino = new Map();
for (const p of platos.values()) if (p.existe) {
  const d = destino.get(p.existe.id);
  if (!d || (p.por === 'Código Toteat' && d.por !== 'Código Toteat')) destino.set(p.existe.id, { categoria: p.categoria, por: p.por, plato: p.nombre });
}

// ── Productos ────────────────────────────────────────────
const cods = [...new Set([...platos.values()].flatMap(p => p.lineas.map(l => l.codigo)))];
const prods = new Map();
for (let i = 0; i < cods.length; i += 200)
  for (const p of must(await sb.from('productos').select('codigo, nombre, unidad_medida, costo_promedio').in('codigo', cods.slice(i, i + 200)))) prods.set(p.codigo, p);
const faltan = cods.filter(c => !prods.has(c));
if (faltan.length) throw new Error('Faltan productos: ' + faltan.join(', '));
const nombresCarta = new Set(carta.map(c => norm(c.nombre)));

// ── Aplicar ──────────────────────────────────────────────
const movidos = [], igual = [], nuevos = [];
for (const [id, d] of destino) {
  const c = carta.find(x => x.id === id);
  if (c.categoria === d.categoria) { igual.push({ c, d }); continue; }
  movidos.push({ c, d });
  if (!DRY) must(await sb.from('carta').update({ categoria: d.categoria }).eq('id', id));
}
for (const p of platos.values()) {
  if (p.existe) continue;
  const ings = p.lineas.map(l => {
    const pr = prods.get(l.codigo);
    const precio = Number(pr.costo_promedio) || 0;
    return { codigo_producto: l.codigo, nombre: pr.nombre, cantidad: l.cantidad, unidad_medida: pr.unidad_medida, precio_unitario: precio, costo_total: precio * l.cantidad, precio_manual: false, pp_id: null };
  });
  p.total = ings.reduce((s, i) => s + i.costo_total, 0);
  p.sinCosto = ings.filter(i => !i.precio_unitario).map(i => i.nombre);
  p.nombreRepetido = nombresCarta.has(norm(p.nombre));
  nuevos.push(p);
  if (DRY) continue;
  const id = must(await sb.from('carta').insert({ nombre: p.nombre, categoria: p.categoria, tipo_carta: tipoCarta(p.categoria), cod_softland: p.cod_softland, codigo_toteat: p.codigo_toteat, activo: true }).select('id').single()).id;
  must(await sb.from('carta_ingredientes').insert(ings.map(i => ({ ...i, carta_id: id }))));
}

// ── Resumen ──────────────────────────────────────────────
const porCat = {};
for (const p of nuevos) porCat[`${p.categoria} [${tipoCarta(p.categoria)}]`] = (porCat[`${p.categoria} [${tipoCarta(p.categoria)}]`] ?? 0) + 1;
console.log(`${DRY ? '[dry-run] ' : ''}platos en Excel: ${platos.size} · ya existían: ${[...platos.values()].filter(p => p.existe).length} (filas sistema: ${destino.size}; movidas de categoría: ${movidos.length}, ya estaban bien: ${igual.length}) · nuevos: ${nuevos.length}`);
console.log(porCat);
console.log('nuevos con nombre igual a uno existente:', nuevos.filter(p => p.nombreRepetido).map(p => `${p.nombre} ${p.codigo_toteat}`).join(' · ') || '—');
console.log('nuevos con insumos sin costo:', nuevos.filter(p => p.sinCosto.length).length);

// ── Excel de detalle ─────────────────────────────────────
const out = new ExcelJS.Workbook();
const head = ws => ws.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF31869B' } }; });
const w1 = out.addWorksheet('Ya existían');
w1.columns = [
  { header: 'Plato en Excel', width: 44 }, { header: 'Cód. Toteat Excel', width: 15 }, { header: 'Cód. Softland Excel', width: 16 }, { header: 'Coincide por', width: 24 },
  { header: 'Plato en sistema', width: 40 }, { header: 'Cód. Toteat sistema', width: 16 }, { header: 'Categoría anterior', width: 26 }, { header: 'Categoría nueva', width: 30 }, { header: 'Acción', width: 34 },
];
head(w1);
for (const p of [...platos.values()].filter(x => x.existe)) {
  const d = destino.get(p.existe.id);
  const manda = d.plato === p.nombre;
  const accion = !manda ? `Sin cambio (manda "${d.plato}")` : p.existe.categoria === d.categoria ? 'Ya estaba en la categoría correcta' : 'Movido de categoría (receta sin cambios)';
  w1.addRow([p.nombre, p.codigo_toteat, p.cod_softland, p.por, p.existe.nombre, p.existe.codigo_toteat, p.existe.categoria, manda ? d.categoria : p.existe.categoria, accion]);
}
const w2 = out.addWorksheet('Nuevos');
w2.columns = [
  { header: 'Plato', width: 44 }, { header: 'Categoría', width: 30 }, { header: 'Tipo carta', width: 12 }, { header: 'Cód. Toteat', width: 12 }, { header: 'Cód. Softland', width: 13 },
  { header: 'Costo', width: 12 }, { header: 'Insumos sin costo', width: 40 }, { header: 'Nombre ya usado en otro plato', width: 16 }, { header: 'Observación del Excel', width: 80 },
];
head(w2);
for (const p of nuevos) {
  const r = w2.addRow([p.nombre, p.categoria, tipoCarta(p.categoria), p.codigo_toteat, p.cod_softland, Math.round(p.total), p.sinCosto.join(', '), p.nombreRepetido ? 'SÍ' : '', [...p.obs].join(' | ')]);
  r.getCell(6).numFmt = '"$"#,##0';
}
for (const ws of [w1, w2]) { ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columnCount } }; ws.views = [{ state: 'frozen', ySplit: 1 }]; }
if (!DRY) { await out.xlsx.writeFile('../Platos_carga_2026-11-07.xlsx'); console.log('Excel: ../Platos_carga_2026-11-07.xlsx'); }
