// Analizador de calidad de datos: reglas puras sobre los datos cargados (lib/alertas/datos.ts).
// No modifica nada. Cada alerta tiene un id determinístico (regla + registro) para que su
// revisión se conserve entre cargas.

import { INICIO_MODULO, REGLAS } from './catalogo';
import type { DatosSistema } from './datos';
import type { Alerta, Evidencia, ModuloAlerta, MovimientoOrigen, NivelAlerta, VolumenUsuario } from './types';

// ── Utilidades ────────────────────────────────────────────────────────
const REGLA = new Map(REGLAS.map(r => [r.codigo, r]));

function um(u: string | null | undefined): string {
  const v = String(u ?? '').trim().toUpperCase().replace(/\.$/, '');
  if (v === 'UND' || v === 'UNID' || v === 'U') return 'UN';
  if (v === 'GRS' || v === 'G') return 'GR';
  if (v === 'LTS' || v === 'L') return 'LT';
  if (v === 'KGS') return 'KG';
  return v;
}
const esMasaChica = (u: string) => u === 'GR' || u === 'CC';
const esMasaGrande = (u: string) => u === 'KG' || u === 'LT';

function fmtN(n: number): string {
  return (Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 });
}
function fmtF(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000);
}
const idCorto = (prefijo: string, uuid: string) => `${prefijo}-${uuid.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

// Fecha dd/mm(/aa) mencionada en un texto que difiere 1–45 días de la fecha del registro
function fechaEnTexto(texto: string | null, fecha: string): string | null {
  if (!texto) return null;
  const re = /(?:^|[^\d])(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?(?!\d)/g;
  const año = Number(fecha.slice(0, 4));
  for (const m of texto.matchAll(re)) {
    const d = Number(m[1]), mes = Number(m[2]);
    if (d < 1 || d > 31 || mes < 1 || mes > 12) continue;
    let y = m[3] ? Number(m[3]) : año;
    if (y < 100) y += 2000;
    const candidatos = m[3] ? [y] : [y, y - 1, y + 1];
    for (const yy of candidatos) {
      const iso = `${yy}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (Number.isNaN(Date.parse(iso))) continue;
      const dif = Math.abs(diasEntre(iso, fecha));
      if (dif >= 1 && dif <= 45) return iso;
    }
  }
  return null;
}

interface NuevaAlerta {
  regla: string;
  clave: string;               // id del registro origen (determinístico)
  modulo: ModuloAlerta;
  registro: string;
  codigo?: string | null;
  detalle: string;
  titulo?: string;
  explicacion: string;
  evidencia: Evidencia[];
  fecha: string;
  movimiento: MovimientoOrigen;
  nivel?: NivelAlerta;
  origen?: string | null;      // id del registro de cabecera que originó la alerta
}

function crear(p: NuevaAlerta): Alerta {
  const r = REGLA.get(p.regla)!;
  return {
    id: `${p.regla}:${p.clave}`,
    regla: r.codigo,
    categoria: r.categoria,
    nivel: p.nivel ?? r.nivel,
    modulo: p.modulo,
    registro: p.registro,
    codigo: p.codigo ?? undefined,
    detalle: p.detalle,
    titulo: p.titulo ?? r.nombre,
    explicacion: p.explicacion,
    evidencia: p.evidencia,
    movimiento: p.movimiento,
    fecha: p.fecha.slice(0, 10),
    estado: 'PENDIENTE',
    historial: [{ estado: 'PENDIENTE', fecha: p.movimiento.created_at || p.fecha, usuario: 'Sistema', nota: 'Detectada por el análisis' }],
    origen: p.origen ?? undefined,
  };
}

// Diferencia mínima (en la unidad de la línea) para considerar atípica una merma
const DIFERENCIA_MINIMA: Record<string, number> = { KG: 1, LT: 1, GR: 1000, CC: 1000, UN: 5, PR: 5, PQ: 3 };

// ── Análisis ──────────────────────────────────────────────────────────
export interface ResultadoAnalisis {
  alertas: Alerta[];
  volumen: VolumenUsuario[];
  registrosAnalizados: number;
}

// `desde`: solo se emiten alertas de registros desde esa fecha; lo anterior sirve de referencia (medianas, habituales)
export function analizarDatos(d: DatosSistema, desde: string = INICIO_MODULO): ResultadoAnalisis {
  const alertas: Alerta[] = [];
  const prod = new Map(d.productos.map(p => [p.codigo, p]));
  // Gramos por PP por código de producto (desde pp y desde nombres tipo "(1PP = 120GR)")
  const gramosPP = new Map<string, number>();
  for (const p of d.pp) if (p.codigo_producto && Number(p.gramos_por_pp) >= 20) gramosPP.set(p.codigo_producto, Math.max(gramosPP.get(p.codigo_producto) ?? 0, Number(p.gramos_por_pp)));

  const cabProd = new Map(d.produccion.map(c => [c.id, c]));
  const cabMer = new Map(d.mermas.map(c => [c.id, c]));
  const cabCol = new Map(d.colacion.map(c => [c.id, c]));

  // ── Líneas normalizadas de mermas / colación (para reglas comunes) ──
  type Linea = { id: string; cab: string; modulo: ModuloAlerta; prefijo: string; codigo: string | null; nombre: string; cantidad: number; um: string; costo: number | null; fecha: string; creado: string; por: string; motivo?: string | null; obs?: string | null };
  const lineas: Linea[] = [];
  for (const l of d.detalleMermas) {
    const c = cabMer.get(l.merma_id); if (!c) continue;
    lineas.push({ id: l.id, cab: l.merma_id, modulo: 'Mermas', prefijo: 'MER', codigo: l.codigo_producto, nombre: l.nombre_producto ?? '', cantidad: Number(l.cantidad), um: um(l.unidad_medida), costo: l.costo_unitario, fecha: c.fecha, creado: c.created_at, por: c.responsable_nombre ?? '—', motivo: l.motivo, obs: c.observacion });
  }
  for (const l of d.detalleColacion) {
    const c = cabCol.get(l.colacion_id); if (!c) continue;
    lineas.push({ id: l.id, cab: l.colacion_id, modulo: 'Colación', prefijo: 'COL', codigo: l.codigo_producto, nombre: l.nombre_producto ?? '', cantidad: Number(l.cantidad), um: um(l.unidad_medida), costo: l.costo_unitario, fecha: c.fecha, creado: c.created_at, por: c.responsable_nombre ?? '—', obs: c.menu });
  }
  const mov = (l: Linea): MovimientoOrigen => ({
    id: idCorto(l.prefijo, l.cab), fecha_movimiento: l.fecha, created_at: l.creado?.slice(0, 19) ?? l.fecha, created_by: l.por,
    cantidad: `${fmtN(l.cantidad)} ${l.um || ''}`.trim(), motivo: l.motivo ?? undefined, observacion: l.obs ?? undefined,
  });

  for (const l of lineas) {
    const p = l.codigo ? prod.get(l.codigo) : undefined;
    const umMaestro = um(p?.unidad_medida);
    const nombre = l.nombre || p?.nombre || l.codigo || 'Sin producto';

    // VAL-MER-001 · PP registrado como GR/CC
    const g = l.codigo ? (gramosPP.get(l.codigo) ?? Number(/1\s*PP\s*=\s*(\d+)\s*GR/i.exec(l.nombre)?.[1] ?? 0)) : 0;
    if (l.modulo === 'Mermas' && g >= 20 && esMasaChica(l.um) && l.cantidad > 0 && l.cantidad < g * 0.2) {
      alertas.push(crear({
        regla: 'VAL-MER-001', clave: l.id, modulo: l.modulo, registro: nombre, codigo: l.codigo,
        detalle: `${fmtN(l.cantidad)} ${l.um} ingresado · 1 PP = ${fmtN(g)} ${l.um}`, titulo: 'Posible error de unidad',
        explicacion: `${nombre} tiene un rendimiento de ${fmtN(g)} ${l.um} por PP. Se registró una merma de ${fmtN(l.cantidad)} ${l.um}.`,
        evidencia: [
          { label: 'Dato ingresado', valor: `${fmtN(l.cantidad)} ${l.um}`, destacado: true },
          { label: 'Referencia', valor: `1 PP = ${fmtN(g)} ${l.um}` },
          { label: 'Te referías a esto:', valor: `${fmtN(l.cantidad * g)} ${l.um}` },
        ],
        fecha: l.fecha, movimiento: mov(l), origen: l.cab,
      }));
    } else if (l.cantidad > 0 && ((esMasaChica(l.um) && l.cantidad < 5) || (esMasaGrande(l.um) && l.cantidad >= 100))) {
      // VAL-UNI-002 · escala sospechosa (KG ↔ GR)
      const chico = esMasaChica(l.um);
      alertas.push(crear({
        regla: 'VAL-UNI-002', clave: l.id, modulo: l.modulo, registro: nombre, codigo: l.codigo,
        detalle: `${fmtN(l.cantidad)} ${l.um} · ¿${chico ? (l.um === 'GR' ? 'KG' : 'LT') : (l.um === 'KG' ? 'GR' : 'CC')}?`,
        explicacion: chico
          ? `Se registraron solo ${fmtN(l.cantidad)} ${l.um}. Puede que la cantidad estuviera en ${l.um === 'GR' ? 'KG' : 'LT'} (${fmtN(l.cantidad * 1000)} ${l.um}).`
          : `Se registraron ${fmtN(l.cantidad)} ${l.um} en una sola línea. Puede que la cantidad estuviera en ${l.um === 'KG' ? 'GR' : 'CC'}.`,
        evidencia: [
          { label: 'Dato ingresado', valor: `${fmtN(l.cantidad)} ${l.um}`, destacado: true },
          { label: 'Te referías a esto:', valor: chico ? `${fmtN(l.cantidad)} ${l.um === 'GR' ? 'KG' : 'LT'}` : `${fmtN(l.cantidad / 1000)} ${l.um}` },
        ],
        fecha: l.fecha, movimiento: mov(l), origen: l.cab,
      }));
    }

    // VAL-UNI-001 · unidad distinta al maestro
    if (p && l.um && umMaestro && l.um !== umMaestro) {
      alertas.push(crear({
        regla: 'VAL-UNI-001', clave: l.id, modulo: l.modulo, registro: nombre, codigo: l.codigo,
        detalle: `Línea en ${l.um} · maestro en ${umMaestro}`,
        explicacion: `La línea se registró en ${l.um} pero el producto se maneja en ${umMaestro} en Maestros; el costo se calcula con la unidad del maestro.`,
        evidencia: [{ label: 'Unidad en la línea', valor: l.um, destacado: true }, { label: 'Unidad en Maestros', valor: umMaestro }, { label: 'Cantidad', valor: `${fmtN(l.cantidad)} ${l.um}` }],
        fecha: l.fecha, movimiento: mov(l), origen: l.cab,
      }));
    }

    // VAL-GEN-001 · línea incompleta
    if (!(l.cantidad > 0) || (!l.codigo && !l.nombre.trim())) {
      alertas.push(crear({
        regla: 'VAL-GEN-001', clave: l.id, modulo: l.modulo, registro: l.nombre.trim() || 'Línea sin producto', codigo: l.codigo,
        detalle: !(l.cantidad > 0) ? 'Cantidad 0' : 'Sin producto',
        explicacion: 'La línea se guardó incompleta y no aporta al registro.',
        evidencia: [{ label: 'Producto', valor: l.nombre.trim() || l.codigo || 'Vacío', destacado: !l.nombre.trim() }, { label: 'Cantidad', valor: fmtN(l.cantidad), destacado: !(l.cantidad > 0) }],
        fecha: l.fecha, movimiento: mov(l), origen: l.cab,
      }));
    }
  }

  const conAlertaEscala = new Set(alertas.filter(a => a.regla === 'VAL-MER-001' || a.regla === 'VAL-UNI-002').map(a => a.id.slice(a.id.indexOf(':') + 1)));

  // VAL-GEN-002 · líneas duplicadas dentro del mismo registro
  const grupos = new Map<string, Linea[]>();
  for (const l of lineas) {
    if (!(l.cantidad > 0)) continue;
    const k = `${l.modulo}|${l.cab}|${l.codigo || l.nombre.toUpperCase()}|${l.cantidad}|${l.um}|${l.motivo ?? ''}`;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    const l = g[0];
    alertas.push(crear({
      regla: 'VAL-GEN-002', clave: `${l.cab}:${l.codigo || l.nombre}:${l.cantidad}${l.um}:${l.motivo ?? ''}`, modulo: l.modulo, registro: l.nombre || l.codigo || '—', codigo: l.codigo,
      detalle: `${g.length} líneas iguales de ${fmtN(l.cantidad)} ${l.um}`,
      explicacion: `El mismo producto con la misma cantidad aparece ${g.length} veces en un solo registro. Puede ser una carga repetida.`,
      evidencia: [{ label: 'Repeticiones', valor: String(g.length), destacado: true }, { label: 'Cada línea', valor: `${fmtN(l.cantidad)} ${l.um}` }, { label: 'Total cargado', valor: `${fmtN(l.cantidad * g.length)} ${l.um}` }],
      fecha: l.fecha, movimiento: mov(l), origen: l.cab,
    }));
  }

  // VAL-MER-002 · merma atípica por producto
  const porProducto = new Map<string, Linea[]>();
  for (const l of lineas) if (l.modulo === 'Mermas' && l.cantidad > 0) {
    const k = `${l.codigo || l.nombre.toUpperCase()}|${l.um}`;
    porProducto.set(k, [...(porProducto.get(k) ?? []), l]);
  }
  for (const g of porProducto.values()) {
    if (g.length < 10) continue;
    const med = mediana(g.map(l => l.cantidad));
    if (!(med > 0)) continue;
    for (const l of g) {
      if (l.cantidad < med * 8 || l.cantidad - med < DIFERENCIA_MINIMA[l.um]) continue;
      // Si la línea ya tiene alerta de escala/unidad, es el mismo problema: no se repite
      if (conAlertaEscala.has(l.id)) continue;
      alertas.push(crear({
        regla: 'VAL-MER-002', clave: l.id, modulo: 'Mermas', registro: l.nombre || l.codigo || '—', codigo: l.codigo,
        detalle: `${fmtN(l.cantidad)} ${l.um} · habitual ${fmtN(med)} ${l.um}`, nivel: l.cantidad >= med * 20 ? 'ALTA' : undefined,
        explicacion: `La merma es ${fmtN(l.cantidad / med)} veces la merma habitual de este producto (${g.length} registros).`,
        evidencia: [{ label: 'Merma registrada', valor: `${fmtN(l.cantidad)} ${l.um}`, destacado: true }, { label: 'Mediana histórica', valor: `${fmtN(med)} ${l.um}` }, { label: 'Registros comparados', valor: String(g.length) }],
        fecha: l.fecha, movimiento: mov(l), origen: l.cab,
      }));
    }
  }

  // VAL-MAE-001 · líneas en $0 (una alerta por producto y módulo)
  type Cero = { modulo: ModuloAlerta; nombre: string; codigo: string | null; n: number; ult: { fecha: string; mov: MovimientoOrigen }; desde: string };
  const ceros = new Map<string, Cero>();
  const sumarCero = (modulo: ModuloAlerta, codigo: string | null, nombre: string, fecha: string, m: MovimientoOrigen) => {
    if (fecha < desde) return;
    const k = `${modulo}|${codigo || nombre.toUpperCase()}`;
    const c = ceros.get(k) ?? { modulo, nombre, codigo, n: 0, ult: { fecha, mov: m }, desde: fecha };
    c.n++;
    if (fecha > c.ult.fecha) c.ult = { fecha, mov: m };
    if (fecha < c.desde) c.desde = fecha;
    ceros.set(k, c);
  };
  for (const l of lineas) if (l.cantidad > 0 && !(Number(l.costo) > 0) && (l.codigo || l.nombre)) sumarCero(l.modulo, l.codigo, l.nombre || l.codigo || '', l.fecha, mov(l));

  // ── Producción ──
  const lineasProd = d.detalleProduccion.map(l => ({ l, c: cabProd.get(l.produccion_id) })).filter(x => x.c) as { l: DatosSistema['detalleProduccion'][number]; c: DatosSistema['produccion'][number] }[];
  const movProd = (l: DatosSistema['detalleProduccion'][number], c: DatosSistema['produccion'][number]): MovimientoOrigen => ({
    id: idCorto('PRO', c.id), fecha_movimiento: c.fecha, created_at: c.created_at?.slice(0, 19) ?? c.fecha, created_by: c.responsable_nombre ?? '—',
    cantidad: `${fmtN(Number(l.cantidad))} ${l.tipo_pp === 'PORCION' ? 'PR' : l.tipo_pp ?? ''}`.trim(), observacion: c.observacion ?? undefined,
  });
  const porPP = new Map<string, typeof lineasProd>();
  for (const x of lineasProd) {
    if (Number(x.l.cantidad) > 0 && !(Number(x.l.costo_unitario) > 0)) sumarCero('Producción', x.l.codigo_producto, x.l.nombre_pp ?? '', x.c.fecha, movProd(x.l, x.c));
    const k = x.l.pp_id || (x.l.nombre_pp ?? '').toUpperCase();
    if (Number(x.l.cantidad) > 0) porPP.set(k, [...(porPP.get(k) ?? []), x]);
  }
  // VAL-PRO-001 · cantidad atípica
  for (const g of porPP.values()) {
    if (g.length < 8) continue;
    const med = mediana(g.map(x => Number(x.l.cantidad)));
    if (!(med > 0)) continue;
    for (const { l, c } of g) {
      const q = Number(l.cantidad);
      if (q < med * 5) continue;
      // PP por porción: si la cantidad, leída como gramos, da una cantidad de PP cercana a lo habitual,
      // lo más probable es que se ingresaron los GR directo en vez de las porciones.
      const gr = Number(l.gramos_por_pp) || 0;
      const enPP = gr > 0 ? q / gr : 0;
      const posibleGR = l.tipo_pp === 'PORCION' && gr > 0 && q >= gr && enPP < med * 5;
      alertas.push(crear({
        regla: 'VAL-PRO-001', clave: l.id, modulo: 'Producción', registro: l.nombre_pp ?? '—', codigo: l.codigo_producto,
        titulo: posibleGR ? 'Posible ingreso en GR en vez de PP' : undefined,
        detalle: posibleGR ? `${fmtN(q)} PP · ¿eran ${fmtN(q)} GR = ${fmtN(enPP)} PP?` : `${fmtN(q)} · habitual ${fmtN(med)}`,
        nivel: q >= med * 10 ? 'ALTA' : undefined,
        explicacion: posibleGR
          ? `Se ingresaron ${fmtN(q)} directo, posiblemente como GR. Este PP se registra en porciones (1 PP = ${fmtN(gr)} GR): ${fmtN(q)} GR equivalen a ${fmtN(enPP)} PP. Lo habitual es ${fmtN(med)} PP (${g.length} registros).`
          : `Se registró ${fmtN(q / med)} veces la producción habitual de este PP (${g.length} registros).`,
        evidencia: posibleGR
          ? [
              { label: 'Cantidad ingresada', valor: `${fmtN(q)} PP`, destacado: true },
              { label: 'Equivalencia', valor: `1 PP = ${fmtN(gr)} GR` },
              { label: 'Te referías a esto:', valor: `${fmtN(enPP)} PP` },
              { label: 'Mediana histórica', valor: `${fmtN(med)} PP` },
            ]
          : [{ label: 'Cantidad registrada', valor: fmtN(q), destacado: true }, { label: 'Mediana histórica', valor: fmtN(med) }, { label: 'Tipo PP', valor: l.tipo_pp ?? '—' }],
        fecha: c.fecha, movimiento: movProd(l, c), origen: c.id,
      }));
    }
  }

  // VAL-OPE-001 · merma de PP mayor que lo producido ese día (misma unidad)
  const producidoDia = new Map<string, number>();
  for (const { l, c } of lineasProd) {
    if (!l.codigo_producto || !(Number(l.total_producido) > 0)) continue;
    const k = `${c.fecha}|${l.codigo_producto}`;
    producidoDia.set(k, (producidoDia.get(k) ?? 0) + Number(l.total_producido));
  }
  const mermaDia = new Map<string, Linea[]>();
  for (const l of lineas) if (l.modulo === 'Mermas' && l.codigo?.startsWith('0502') && l.cantidad > 0 && l.um === um(prod.get(l.codigo)?.unidad_medida)) {
    const k = `${l.fecha}|${l.codigo}`;
    mermaDia.set(k, [...(mermaDia.get(k) ?? []), l]);
  }
  for (const [k, g] of mermaDia) {
    const producido = producidoDia.get(k);
    const merma = g.reduce((s, l) => s + l.cantidad, 0);
    if (!producido || merma <= producido) continue;
    const l = g[0];
    alertas.push(crear({
      regla: 'VAL-OPE-001', clave: k, modulo: 'Mermas', registro: l.nombre || l.codigo || '—', codigo: l.codigo,
      detalle: `Merma ${fmtN(merma)} ${l.um} > producción ${fmtN(producido)} ${l.um}`,
      explicacion: 'La merma del día supera lo producido del mismo PP ese día. Puede ser merma de producción de días anteriores o un error de cantidad.',
      evidencia: [{ label: 'Producido ese día', valor: `${fmtN(producido)} ${l.um}` }, { label: 'Merma ese día', valor: `${fmtN(merma)} ${l.um}`, destacado: true }],
      fecha: l.fecha, movimiento: mov(l), origen: l.cab,
    }));
  }

  // VAL-FEC-001 · fecha en observación / menú distinta a la del registro
  const revisarFecha = (modulo: ModuloAlerta, prefijo: string, id: string, fecha: string, texto: string | null, creado: string, por: string | null, etiqueta: string) => {
    const f = fechaEnTexto(texto, fecha);
    if (!f) return;
    alertas.push(crear({
      regla: 'VAL-FEC-001', clave: id, modulo, registro: etiqueta,
      detalle: `Registro ${fmtF(fecha).slice(0, 5)} · ${modulo === 'Colación' ? 'menú' : 'observación'} dice ${fmtF(f).slice(0, 5)}`,
      explicacion: `El texto menciona el ${fmtF(f)} y el registro tiene fecha ${fmtF(fecha)}. Puede ser correcto (registro al día siguiente) o un error de fecha.`,
      evidencia: [{ label: 'Fecha del registro', valor: fmtF(fecha), destacado: true }, { label: 'Fecha en el texto', valor: fmtF(f) }, { label: modulo === 'Colación' ? 'Menú' : 'Observación', valor: `“${texto}”` }],
      fecha, movimiento: { id: idCorto(prefijo, id), fecha_movimiento: fecha, created_at: creado?.slice(0, 19) ?? fecha, created_by: por ?? '—', observacion: texto ?? undefined }, origen: id,
    }));
  };
  for (const c of d.produccion) revisarFecha('Producción', 'PRO', c.id, c.fecha, c.observacion, c.created_at, c.responsable_nombre, 'Producción del día');
  for (const c of d.mermas) revisarFecha('Mermas', 'MER', c.id, c.fecha, c.observacion, c.created_at, c.responsable_nombre, 'Registro de mermas');
  for (const c of d.colacion) revisarFecha('Colación', 'COL', c.id, c.fecha, c.menu, c.created_at, c.responsable_nombre, c.menu?.trim() || 'Colación');

  // VAL-REN-001 · rendimiento de verdura: imposible (>100%) o menos de la mitad de lo habitual de esa verdura
  const pctHabitual = new Map<string, number>();
  const pctPorVerdura = new Map<string, number[]>();
  for (const r of d.rendimiento) {
    const kg = Number(r.kg_utilizados), rin = Number(r.rendimiento_kg);
    if (kg > 0 && rin > 0 && rin <= kg) pctPorVerdura.set(r.verdura, [...(pctPorVerdura.get(r.verdura) ?? []), rin / kg]);
  }
  for (const [v, arr] of pctPorVerdura) if (arr.length >= 5) pctHabitual.set(v, mediana(arr));
  // VAL-REN-002 · verduras se registran en KG: 100 KG o más en un registro es casi seguro gramos
  const LIMITE_KG_VERDURA = 100;
  const movRen = (r: DatosSistema['rendimiento'][number], kg: number, rin: number): MovimientoOrigen => ({
    id: idCorto('REN', r.id), fecha_movimiento: r.fecha, created_at: r.fecha, created_by: r.responsable_nombre ?? '—', cantidad: `${fmtN(kg)} KG → ${fmtN(rin)} KG`,
  });
  for (const r of d.rendimiento) {
    const kg = Number(r.kg_utilizados), rin = Number(r.rendimiento_kg);
    if (!(kg > 0) || !(rin > 0)) continue;
    if (kg >= LIMITE_KG_VERDURA || rin >= LIMITE_KG_VERDURA) {
      alertas.push(crear({
        regla: 'VAL-REN-002', clave: r.id, modulo: 'Producción', registro: r.verdura, titulo: 'Posible ingreso en GR en vez de KG',
        detalle: `${fmtN(kg)} KG → ${fmtN(rin)} KG · ¿eran GR?`,
        explicacion: `Las verduras se registran en KG. Se ingresaron ${fmtN(kg)} KG utilizados y ${fmtN(rin)} KG de rendimiento, posiblemente en gramos: equivale a ${fmtN(kg / 1000)} KG utilizados y ${fmtN(rin / 1000)} KG de rendimiento.`,
        evidencia: [
          { label: 'KG utilizados', valor: `${fmtN(kg)} KG`, destacado: kg >= LIMITE_KG_VERDURA },
          { label: 'KG rendidos', valor: `${fmtN(rin)} KG`, destacado: rin >= LIMITE_KG_VERDURA },
          { label: 'Te referías a esto:', valor: `${fmtN(kg / 1000)} KG → ${fmtN(rin / 1000)} KG` },
        ],
        fecha: r.fecha, movimiento: movRen(r, kg, rin), origen: r.produccion_id,
      }));
      continue; // mismo problema: no se suma la alerta de rendimiento porcentual
    }
    const pct = rin / kg;
    const habitual = pctHabitual.get(r.verdura);
    if (pct <= 1 && !(habitual && pct < habitual * 0.5)) continue;
    alertas.push(crear({
      regla: 'VAL-REN-001', clave: r.id, modulo: 'Producción', registro: r.verdura,
      detalle: `Rinde ${fmtN(pct * 100)}% (${fmtN(rin)} de ${fmtN(kg)} KG)`, nivel: pct > 1 ? 'ALTA' : undefined,
      explicacion: pct > 1 ? 'El rendimiento es mayor que lo utilizado: probablemente se invirtieron los valores o hay un error de cantidad.' : `El rendimiento es menos de la mitad de lo habitual para ${r.verdura} (${fmtN((habitual ?? 0) * 100)}%).`,
      evidencia: [{ label: 'KG utilizados', valor: fmtN(kg) }, { label: 'KG rendidos', valor: fmtN(rin), destacado: true }, { label: 'Rendimiento', valor: `${fmtN(pct * 100)}%` }, ...(habitual ? [{ label: 'Habitual', valor: `${fmtN(habitual * 100)}%` }] : [])],
      fecha: r.fecha, movimiento: movRen(r, kg, rin), origen: r.produccion_id,
    }));
  }

  // VAL-CAR-001 · movimiento cárnico atípico
  const porCarne = new Map<string, DatosSistema['carnicos']>();
  for (const m of d.carnicos) if (Number(m.cantidad) > 0 && m.origen !== 'venta_toteat') {
    const k = `${m.producto_id || m.producto_nombre}|${m.movimiento}|${m.subtipo ?? ''}|${um(m.unidad_medida)}`;
    porCarne.set(k, [...(porCarne.get(k) ?? []), m]);
  }
  for (const g of porCarne.values()) {
    if (g.length < 8) continue;
    const med = mediana(g.map(m => Number(m.cantidad)));
    if (!(med > 0)) continue;
    for (const m of g) {
      const q = Number(m.cantidad);
      if (q < med * 5) continue;
      const u = um(m.unidad_medida);
      alertas.push(crear({
        regla: 'VAL-CAR-001', clave: m.id, modulo: 'Control Cárnicos', registro: m.producto_nombre ?? '—',
        detalle: `${m.movimiento ?? ''} ${fmtN(q)} ${u} · habitual ${fmtN(med)} ${u}`.trim(), nivel: q >= med * 10 ? 'ALTA' : undefined,
        explicacion: `El movimiento es ${fmtN(q / med)} veces lo habitual para este producto y tipo de movimiento (${g.length} registros).`,
        evidencia: [{ label: 'Cantidad', valor: `${fmtN(q)} ${u}`, destacado: true }, { label: 'Mediana', valor: `${fmtN(med)} ${u}` }, { label: 'Movimiento', valor: [m.movimiento, m.subtipo].filter(Boolean).join(' · ') }],
        fecha: m.fecha, movimiento: { id: idCorto('CAR', m.id), fecha_movimiento: m.fecha, created_at: m.created_at?.slice(0, 19) ?? m.fecha, created_by: m.responsable_nombre ?? '—', cantidad: `${fmtN(q)} ${u}`, observacion: m.observacion ?? undefined },
      }));
    }
  }

  // Emitir VAL-MAE-001 agrupadas
  for (const c of ceros.values()) {
    alertas.push(crear({
      regla: 'VAL-MAE-001', clave: `${c.modulo}:${c.codigo || c.nombre}`, modulo: c.modulo, registro: c.nombre || c.codigo || '—', codigo: c.codigo,
      detalle: `${c.n} línea${c.n !== 1 ? 's' : ''} en $0`, nivel: c.n >= 10 ? 'REVISAR' : undefined,
      explicacion: `${c.n} línea${c.n !== 1 ? 's' : ''} de este producto quedaron valorizadas en $0 entre el ${fmtF(c.desde)} y el ${fmtF(c.ult.fecha)}. Se corrige cargando su costo en Maestros → Productos.`,
      evidencia: [{ label: 'Líneas en $0', valor: String(c.n), destacado: true }, { label: 'Costo en Maestros', valor: c.codigo && prod.get(c.codigo) ? `$${fmtN(Number(prod.get(c.codigo)!.costo_promedio) || 0)}` : 'Sin código' }, { label: 'Período', valor: `${fmtF(c.desde)} – ${fmtF(c.ult.fecha)}` }],
      fecha: c.ult.fecha, movimiento: c.ult.mov,
    }));
  }

  // ── Maestros ──
  const usoPP = new Map<string, { n: number; ult: string }>();
  for (const { l, c } of lineasProd) if (l.pp_id && c.fecha >= desde) {
    const u = usoPP.get(l.pp_id) ?? { n: 0, ult: c.fecha };
    u.n++; if (c.fecha > u.ult) u.ult = c.fecha;
    usoPP.set(l.pp_id, u);
  }
  const hoyMaestro = [...d.produccion.map(c => c.fecha)].sort().at(-1) ?? new Date().toISOString().slice(0, 10);
  for (const p of d.pp) {
    if (p.activo === false) continue;
    const u = usoPP.get(p.id);
    const maestro: MovimientoOrigen = { id: idCorto('PP', p.id), fecha_movimiento: u?.ult ?? hoyMaestro, created_at: u?.ult ?? hoyMaestro, created_by: 'Maestros' };
    if (!p.codigo_producto && u) {
      alertas.push(crear({
        regla: 'VAL-MAE-002', clave: p.id, modulo: 'Maestros', registro: p.nombre, detalle: `Usado en ${u.n} producciones · sin producto`,
        explicacion: 'El PP se produce pero no tiene un producto vinculado en Maestros → PPs, por lo que su producción queda sin costo.',
        evidencia: [{ label: 'Producciones', valor: String(u.n), destacado: true }, { label: 'Última', valor: fmtF(u.ult) }, { label: 'Producto vinculado', valor: 'Ninguno' }],
        fecha: u.ult, movimiento: maestro,
      }));
    }
    if (p.tipo_pp === 'PORCION' && !(Number(p.gramos_por_pp) > 0)) {
      alertas.push(crear({
        regla: 'VAL-MAE-003', clave: p.id, modulo: 'Maestros', registro: p.nombre, codigo: p.codigo_producto, detalle: 'Porción sin gramos definidos',
        explicacion: 'El PP es por porción pero no tiene gramos por porción: no se puede convertir a gramos ni costear bien.',
        evidencia: [{ label: 'Tipo', valor: 'Porción' }, { label: 'Gramos por porción', valor: 'Sin definir', destacado: true }, { label: 'Producciones', valor: String(u?.n ?? 0) }],
        fecha: u?.ult ?? hoyMaestro, movimiento: maestro,
      }));
    }
  }
  // VAL-COS-002 · costo/rendimiento de PP sospechoso
  const recetaPorPP = new Map(d.recetas.filter(r => r.activo !== false && r.codigo_pp).map(r => [r.codigo_pp as string, r]));
  for (const p of d.productos) {
    if (!p.codigo.startsWith('0502') || p.activo === false) continue;
    const r = recetaPorPP.get(p.codigo);
    const u = um(p.unidad_medida);
    const costo = Number(p.costo_promedio) || 0;
    const motivos: string[] = [];
    if (esMasaChica(u) && costo > 100) motivos.push(`costo $${fmtN(costo)} por ${u}`);
    if (r && Number(r.rendimiento) <= 1) motivos.push(`receta rinde ${fmtN(Number(r.rendimiento))} ${um(r.unidad_rendimiento)}`);
    if (!motivos.length) continue;
    alertas.push(crear({
      regla: 'VAL-COS-002', clave: p.codigo, modulo: 'Costos', registro: p.nombre, codigo: p.codigo, detalle: motivos.join(' · '),
      explicacion: 'El costo o el rendimiento del PP no es coherente con su unidad: los costos de producción, mermas y colación que lo usan quedan distorsionados.',
      evidencia: [
        { label: 'Costo en Maestros', valor: `$${fmtN(costo)} / ${u || '—'}`, destacado: esMasaChica(u) && costo > 100 },
        ...(r ? [{ label: 'Receta', valor: `${r.codigo_receta} · rinde ${fmtN(Number(r.rendimiento))} ${um(r.unidad_rendimiento)}`, destacado: Number(r.rendimiento) <= 1 }] : []),
      ],
      fecha: hoyMaestro, movimiento: { id: p.codigo, fecha_movimiento: hoyMaestro, created_at: hoyMaestro, created_by: 'Maestros' },
    }));
  }

  // ── Volumen por usuario (registros de cabecera) ──
  const vol = new Map<string, number>();
  for (const c of [...d.produccion, ...d.mermas, ...d.colacion]) if (c.responsable_nombre && c.fecha >= desde) vol.set(c.responsable_nombre, (vol.get(c.responsable_nombre) ?? 0) + 1);
  // Movimientos cárnicos manuales (las salidas automáticas por venta Toteat no son de una persona)
  for (const m of d.carnicos) if (m.responsable_nombre && m.origen !== 'venta_toteat' && m.fecha >= desde) vol.set(m.responsable_nombre, (vol.get(m.responsable_nombre) ?? 0) + 1);

  const registrosAnalizados = d.produccion.length + d.detalleProduccion.length + d.rendimiento.length + d.mermas.length + d.detalleMermas.length
    + d.colacion.length + d.detalleColacion.length + d.carnicos.length + d.productos.length + d.pp.length + d.recetas.length;

  // Solo el período del módulo; más reciente primero
  const delPeriodo = alertas.filter(a => a.fecha >= desde).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return { alertas: delPeriodo, volumen: [...vol].map(([usuario, movimientos]) => ({ usuario, movimientos })), registrosAnalizados };
}
