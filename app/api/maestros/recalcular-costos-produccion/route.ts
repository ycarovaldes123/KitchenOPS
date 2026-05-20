import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';

// Mapeo manual: nombre en tabla pp → nombre en pp_recetas
// Cubre variaciones de sufijo, abreviaturas y typos históricos
const NOMBRE_MAP: Record<string, string> = {
  'PP CHAMPIÑON RELLENO (UND)':         'PP CHAMPIÑONES RELLENOS',
  'PP CHAMPIÑON RELLENO':               'PP CHAMPIÑONES RELLENOS',
  'PP CHAMPIÑONES HIDRATADOS':          'PP. CHAMPIÑONES HIDRATADOS',
  'PP CHUPE CENTOLLA PORC':             'PP CHUPE DE CENTOLLA',
  'PP CHUPE CENTOLLA TABLA PORCION':    'PP CHUPE DE CENTOLLA',
  'PP CIERVO SIN PEPINILLOS':           'PP CIERVO S/ PEPINILLOS',
  'PP CIERVO PORC':                     'PP CIERVO DE LA CASA',
  'PP FETUCINI  PORC':                  'PP FETUCCINE',
  'PP FILETE DE POLLO':                 'PP FILETE DE POLLO SANDWICH',
  'PP JARABE LAGER CC':                 'PP JARABE DE LAGER',
  'PP JUGO DE FRAMBUESA CC':            'PP JUGO FRAMBUESA',
  'PP JUGO DE MANGO (CC) CC':           'PP JUGO MANGO',
  'PP JUGO DE PIÑA (CC) CC':            'PP JUGO PIÑA',
  'PP LIMONETA DE CERVEZA CC':          'PP LIMONETA DE CEREVEZA',
  'PP MAYO AJO CABRA (STRONG) GRS':     'PP MAYONESA AJI CACHO CABRA',
  'PP PANCETAS 13 GRS C/U UND':         'PP PANCETA (1 UND = 13GR)',
  'PP PANQUEQUES UND':                  'PP PANQUEQUE',
  'PP PASTA AJI CACHO CABRA':           'PP PASTA DE AJI CACHO DE CABRA',
  'PP PASTA AJI CACHO CABRA GRS':       'PP PASTA DE AJI CACHO DE CABRA',
  'PP PEBRE GR':                        'PP SALSA PEBRE',
  'PP PESTO DE ALMENDRAS GRS':          'PP PESTO DE ACEITUNAS Y ALMENDRAS',
  'PP PURE DE CAMOTE':                  'PP PURE CAMOTE',
  'PP CARNE TABLA (UND)':               'PP CARNE TABLA',
  'PP ENTRAÑA KG':                      'PP ENTRAÑA KG',
  'PP ENTRAÑA PR':                      'PP ENTRAÑA KG',
  'PP MALAYA GR':                       'PP MALAYA KG',
  'PP PAPAS TABLA GR':                  'PP PAPAS TABLA',
  'PP POLLO TABLA GR':                  'PP POLLO TABLA',
  'PP QUESO TABLA (UND)':               'PP QUESO TABLA',
  'PP SALMON TROZO GR':                 'PP SALMON TROZO',
  'PP MIX CHAMPIÑON GR':                'PP MIX CHAMPIÑONES',
  'PP MIX TABLA  CRIOLLA GR':           'PP MIX TABLA CRIOLA',
  'PP BROCHETAS (UND)':                 'PP BROCHETA MORRON , CHAMPIÑONES , CEBOLLA',
  'PP BROCHETAS':                       'PP BROCHETA MORRON , CHAMPIÑONES , CEBOLLA',
  'PP SORRENTINO PORC':                 'PP SORRENTINO DE SALMON',
  'PP MECHADA 100G':                    'PP MECHADA 100GR',
  'PP MECHADA 150G':                    'PP MECHADA 150GR',
  'PP BECHAMEL DE QUESO MANTECOSO GRS': 'PP BECHAMEL DE QUESO',
  'PP PLATEADAS UND':                   'PP PLATEADA',
  'PP SIRUP DE MIEL CC GRS':            'PP SIRUP DE MIEL',
  'PP HAMBURGUESA DE GARBANZO UND':     'PP HAMBURGUESA DE GARBANZOS',
  'PP SPATZLER GRS':                    'PP SPATZLE',
  'PP TRIGO MOTE (GRS)':                'PP TRIGO MOTE',
};

function stripSuffix(name: string): string {
  return name
    .replace(/\s+(GRS?|UND|CC|PORC|KG|GR|PR|\(UND\)|\(CC\)|PORCION)\s*$/i, '')
    .trim();
}

// POST /api/maestros/recalcular-costos-produccion
// 1. Actualiza pp.codigo_producto para PPs que tienen pp_recetas con código 0502xxx
// 2. Rellena costo_unitario y costo_total en detalle_produccion donde costo_unitario = 0
export async function POST() {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();

  // Cargar pp_recetas con costos calculados
  const { data: recetas, error: rErr } = await supabase
    .from('pp_recetas')
    .select('nombre, codigo_pp, costo_unitario_calculado')
    .eq('activo', true);

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  // Mapa nombre_receta_upper → { codigo_pp, costo }
  const recetaMap = new Map<string, { codigo_pp: string | null; costo: number }>();
  for (const r of recetas ?? []) {
    recetaMap.set(r.nombre.toUpperCase(), {
      codigo_pp: r.codigo_pp ?? null,
      costo: r.costo_unitario_calculado ?? 0,
    });
  }

  function buscarReceta(nombrePP: string): { codigo_pp: string | null; costo: number } | null {
    // 1. Override manual
    const override = NOMBRE_MAP[nombrePP];
    if (override) {
      const r = recetaMap.get(override.toUpperCase());
      if (r) return r;
    }
    // 2. Coincidencia exacta
    const direct = recetaMap.get(nombrePP.toUpperCase());
    if (direct) return direct;
    // 3. Sin sufijo de unidad
    const stripped = stripSuffix(nombrePP).toUpperCase();
    for (const [k, v] of recetaMap) {
      if (k === stripped || stripSuffix(k) === stripped) return v;
    }
    return null;
  }

  // ── 1. Actualizar pp.codigo_producto ──────────────────────────────────────
  const { data: ppList } = await supabase
    .from('pp')
    .select('id, nombre, codigo_producto');

  let ppActualizados = 0;
  for (const pp of ppList ?? []) {
    if (pp.codigo_producto) continue;
    const receta = buscarReceta(pp.nombre);
    if (receta?.codigo_pp) {
      const { error } = await supabase
        .from('pp')
        .update({ codigo_producto: receta.codigo_pp })
        .eq('id', pp.id);
      if (!error) ppActualizados++;
    }
  }

  // ── 2. Rellenar costos históricos en detalle_produccion ───────────────────
  const { data: lineas, error: lErr } = await supabase
    .from('detalle_produccion')
    .select('id, nombre_pp, cantidad')
    .eq('costo_unitario', 0);

  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

  let detalleActualizados = 0;
  let detalleSinReceta    = 0;
  const errores: string[] = [];

  for (const linea of lineas ?? []) {
    const receta = buscarReceta(linea.nombre_pp);
    if (!receta || receta.costo <= 0) { detalleSinReceta++; continue; }

    const costoUnitario = receta.costo;
    const costoTotal    = Math.round(linea.cantidad * costoUnitario);

    const { error } = await supabase
      .from('detalle_produccion')
      .update({ costo_unitario: costoUnitario, costo_total: costoTotal })
      .eq('id', linea.id);

    if (error) errores.push(`${linea.nombre_pp}: ${error.message}`);
    else detalleActualizados++;
  }

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario:   s.rol,
    accion:        'recalcular_costos_produccion_historico',
    tabla:         'detalle_produccion',
    datos_nuevos:  { pp_actualizados: ppActualizados, detalle_actualizados: detalleActualizados, detalle_sin_receta: detalleSinReceta },
  });

  return NextResponse.json({
    pp_actualizados:      ppActualizados,
    detalle_actualizados: detalleActualizados,
    detalle_sin_receta:   detalleSinReceta,
    errores:              errores.slice(0, 10),
  });
}
