import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { semaforo, calcMargen } from '@/lib/calculos';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';
import { TIPOS_CARTA } from '@/lib/carta';

let cartaTipoCartaColumnExists: boolean | null = null;

type IngredientePayload = {
  id?: string;
  codigo_producto?: string | null;
  nombre?: string | null;
  cantidad: number;
  unidad_medida?: string | null;
  precio_unitario?: number | null;
  pp_id?: string | null;
};

const CARTA_SELECT_WITH_TIPO: string = `
      *,
      carta_ingredientes (
        id, nombre, cantidad, unidad_medida, precio_unitario, costo_total,
        codigo_producto, pp_id
      )
    `;

const CARTA_SELECT_WITHOUT_TIPO: string = `
      *,
      carta_ingredientes (
        id, nombre, cantidad, unidad_medida, precio_unitario, costo_total,
        codigo_producto, pp_id
      )
    `;

function isMissingTipoCartaColumn(error: { message?: string } | null | undefined) {
  const message = (error?.message ?? '').toLowerCase();
  return message.includes('tipo_carta') && (
    message.includes('does not exist') ||
    message.includes('column') ||
    message.includes('could not find')
  );
}

function isMissingCodigoToteatColumn(error: { message?: string } | null | undefined) {
  const message = (error?.message ?? '').toLowerCase();
  return message.includes('codigo_toteat') && (
    message.includes('does not exist') ||
    message.includes('column') ||
    message.includes('could not find')
  );
}

function sinCodigoToteat<T extends { codigo_toteat?: unknown }>(row: T) {
  const next = { ...row };
  delete next.codigo_toteat;
  return next;
}

function normalizarUM(um: string | null | undefined) {
  const val = (um ?? '').trim().toUpperCase();
  return val === 'UND' ? 'UN' : val;
}

function precioUnitarioPorUnidad(
  unidadIngrediente: string,
  unidadProducto: string,
  costoPromedio: number,
) {
  const iUM = normalizarUM(unidadIngrediente);
  const pUM = normalizarUM(unidadProducto);
  if (iUM === pUM) return costoPromedio;
  if (iUM === 'GR' && pUM === 'KG') return costoPromedio / 1000;
  if (iUM === 'CC' && pUM === 'LT') return costoPromedio / 1000;
  if (iUM === 'KG' && pUM === 'GR') return costoPromedio * 1000;
  if (iUM === 'LT' && pUM === 'CC') return costoPromedio * 1000;
  return costoPromedio;
}

async function prepararIngredientes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cartaId: string,
  ingredientes: IngredientePayload[] | undefined,
) {
  const rows = (ingredientes ?? [])
    .map(i => ({
      ...i,
      codigo_producto: i.codigo_producto?.trim() || null,
      nombre: i.nombre?.trim() || null,
      unidad_medida: normalizarUM(i.unidad_medida),
      cantidad: Number(i.cantidad),
      precio_unitario: i.precio_unitario == null ? null : Number(i.precio_unitario),
    }))
    .filter(i => i.cantidad > 0 && (i.codigo_producto || i.nombre));

  const codigos = [...new Set(rows.map(i => i.codigo_producto).filter(Boolean))] as string[];
  const { data: productos, error } = codigos.length
    ? await supabase
        .from('productos')
        .select('codigo,nombre,unidad_medida,costo_promedio')
        .in('codigo', codigos)
    : { data: [], error: null };
  if (error) throw new Error(error.message);

  const prodMap = new Map((productos ?? []).map(p => [p.codigo, p]));

  return rows.map(i => {
    const prod = i.codigo_producto ? prodMap.get(i.codigo_producto) : null;
    const unidad = i.unidad_medida || prod?.unidad_medida || null;
    const precioUnitario = prod
      ? precioUnitarioPorUnidad(unidad ?? prod.unidad_medida, prod.unidad_medida, prod.costo_promedio ?? 0)
      : (i.precio_unitario ?? 0);

    return {
      carta_id: cartaId,
      codigo_producto: i.codigo_producto,
      pp_id: i.pp_id ?? null,
      nombre: prod?.nombre ?? i.nombre,
      cantidad: i.cantidad,
      unidad_medida: unidad,
      precio_unitario: precioUnitario,
      costo_total: i.cantidad * precioUnitario,
    };
  });
}

// GET /api/carta — todos los platos activos con costos calculados
export async function GET() {
  // cocina: acceso de solo lectura a la pestaña Carta de Costos
  const s = await requireRol(['admin', 'finanzas', 'jefatura', 'cocina']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const includeTipoCarta = cartaTipoCartaColumnExists !== false;

  const query = supabase
    .from('carta')
    .select(includeTipoCarta ? (CARTA_SELECT_WITH_TIPO as string) : (CARTA_SELECT_WITHOUT_TIPO as string))
    .eq('activo', true)
    .order('categoria')
    .order('nombre');

  let { data: platos, error } = await query;

  if (error && includeTipoCarta && isMissingTipoCartaColumn(error)) {
    cartaTipoCartaColumnExists = false;
    ({ data: platos, error } = await supabase
      .from('carta')
      .select(CARTA_SELECT_WITHOUT_TIPO as string)
      .eq('activo', true)
      .order('categoria')
      .order('nombre'));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type CartaRow = {
    id: string;
    cod_softland: string | null;
    codigo_toteat?: string | null;
    nombre: string;
    categoria: string;
    tipo_carta?: string | null;
    precio_carta: number | null;
    activo: boolean;
    foto_url: string | null;
    updated_at: string;
    carta_ingredientes?: { id: string; nombre: string | null; cantidad: number; unidad_medida: string | null; precio_unitario: number | null; costo_total: number | null; codigo_producto: string | null; pp_id: string | null; }[] | null;
  };

  const resultado = ((platos ?? []) as unknown as CartaRow[]).map((p) => {
    const costo_neto   = (p.carta_ingredientes ?? []).reduce((s: number, i: { costo_total: number | null }) => s + (i.costo_total ?? 0), 0);
    const costo_bruto  = costo_neto * 1.19;
    const margen_pct   = calcMargen(costo_neto, p.precio_carta);
    const color        = semaforo(costo_neto, p.precio_carta);
    return { ...p, tipo_carta: p.tipo_carta ?? 'ANTIGUA', costo_neto, costo_bruto: Math.round(costo_bruto), margen_pct, semaforo: color };
  });

  return NextResponse.json(resultado);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const body = await req.json();
  const { cod_softland, codigo_toteat, nombre, categoria, tipo_carta, precio_carta, foto_url, ingredientes } = body;
  const tipoCartaValor = TIPOS_CARTA.includes(tipo_carta) ? tipo_carta : 'ANTIGUA';

  if (!nombre?.trim() || !categoria?.trim())
    return NextResponse.json({ error: 'Nombre y categoria son requeridos' }, { status: 400 });
  if (tipo_carta && !TIPOS_CARTA.includes(tipo_carta)) {
    return NextResponse.json({ error: 'Tipo de carta inválido' }, { status: 400 });
  }

  const baseRow = {
    cod_softland: cod_softland?.trim() || null,
    codigo_toteat: codigo_toteat?.trim() || null,
    nombre: nombre.trim().toUpperCase(),
    categoria: categoria.trim().toUpperCase(),
    precio_carta: precio_carta == null || precio_carta === '' ? null : Number(precio_carta),
    foto_url: foto_url?.trim() || null,
    activo: true,
    updated_at: new Date().toISOString(),
  };
  const rowConTipo = {
    ...baseRow,
    tipo_carta: tipoCartaValor,
  };
  const rowSinTipo = baseRow;

  let { data: plato, error: platoErr } = await supabase
    .from('carta')
    .insert(cartaTipoCartaColumnExists === false ? rowSinTipo : rowConTipo)
    .select('id')
    .single();

  if (platoErr && cartaTipoCartaColumnExists !== false && isMissingTipoCartaColumn(platoErr)) {
    cartaTipoCartaColumnExists = false;
    ({ data: plato, error: platoErr } = await supabase
      .from('carta')
      .insert(rowSinTipo)
      .select('id')
      .single());
  }
  if (platoErr && isMissingCodigoToteatColumn(platoErr)) {
    const baseSinCodigo = sinCodigoToteat(baseRow);
    const rowConTipoSinCodigo = { ...baseSinCodigo, tipo_carta: tipoCartaValor };
    cartaTipoCartaColumnExists = cartaTipoCartaColumnExists === false ? false : cartaTipoCartaColumnExists;
    ({ data: plato, error: platoErr } = await supabase
      .from('carta')
      .insert(cartaTipoCartaColumnExists === false ? baseSinCodigo : rowConTipoSinCodigo)
      .select('id')
      .single());
  }

  if (platoErr) return NextResponse.json({ error: platoErr.message }, { status: 500 });
  if (!plato) return NextResponse.json({ error: 'No se pudo crear el plato' }, { status: 500 });

  try {
    const ingRows = await prepararIngredientes(supabase, plato.id, ingredientes);
    if (ingRows.length) {
      const { error: ingErr } = await supabase.from('carta_ingredientes').insert(ingRows);
      if (ingErr) return NextResponse.json({ error: ingErr.message }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error preparando ingredientes' }, { status: 500 });
  }

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario: s.rol,
    accion: 'crear_plato_carta',
    tabla: 'carta',
    registro_id: plato.id,
    datos_nuevos: { nombre, categoria, tipo_carta: tipoCartaValor, codigo_toteat: codigo_toteat?.trim() || null, ingredientes: ingredientes?.length ?? 0 },
  });

  return NextResponse.json({ id: plato.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const body = await req.json();
  const { id, cod_softland, codigo_toteat, nombre, categoria, tipo_carta, precio_carta, foto_url, activo, ingredientes } = body;
  const tipoCartaValor = TIPOS_CARTA.includes(tipo_carta) ? tipo_carta : 'ANTIGUA';

  if (!id || !nombre?.trim() || !categoria?.trim())
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  if (tipo_carta && !TIPOS_CARTA.includes(tipo_carta)) {
    return NextResponse.json({ error: 'Tipo de carta inválido' }, { status: 400 });
  }

  if (activo === false && s.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo admin puede desactivar platos de carta' }, { status: 403 });
  }

  const baseRow = {
      cod_softland: cod_softland?.trim() || null,
      codigo_toteat: codigo_toteat?.trim() || null,
      nombre: nombre.trim().toUpperCase(),
      categoria: categoria.trim().toUpperCase(),
      precio_carta: precio_carta == null || precio_carta === '' ? null : Number(precio_carta),
      foto_url: foto_url?.trim() || null,
      activo: activo === false ? false : true,
      updated_at: new Date().toISOString(),
  };
  const rowConTipo = {
    ...baseRow,
    tipo_carta: tipoCartaValor,
  };
  const rowSinTipo = baseRow;

  let { error: platoErr } = await supabase
    .from('carta')
    .update(cartaTipoCartaColumnExists === false ? rowSinTipo : rowConTipo)
    .eq('id', id);

  if (platoErr && cartaTipoCartaColumnExists !== false && isMissingTipoCartaColumn(platoErr)) {
    cartaTipoCartaColumnExists = false;
    ({ error: platoErr } = await supabase
      .from('carta')
      .update(rowSinTipo)
      .eq('id', id));
  }
  if (platoErr && isMissingCodigoToteatColumn(platoErr)) {
    const baseSinCodigo = sinCodigoToteat(baseRow);
    const rowConTipoSinCodigo = { ...baseSinCodigo, tipo_carta: tipoCartaValor };
    ({ error: platoErr } = await supabase
      .from('carta')
      .update(cartaTipoCartaColumnExists === false ? baseSinCodigo : rowConTipoSinCodigo)
      .eq('id', id));
  }

  if (platoErr) return NextResponse.json({ error: platoErr.message }, { status: 500 });

  try {
    const ingRows = await prepararIngredientes(supabase, id, ingredientes);
    const { error: delErr } = await supabase.from('carta_ingredientes').delete().eq('carta_id', id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    if (ingRows.length) {
      const { error: ingErr } = await supabase.from('carta_ingredientes').insert(ingRows);
      if (ingErr) return NextResponse.json({ error: ingErr.message }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error preparando ingredientes' }, { status: 500 });
  }

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario: s.rol,
    accion: 'editar_plato_carta',
    tabla: 'carta',
    registro_id: id,
    datos_nuevos: { nombre, categoria, tipo_carta: TIPOS_CARTA.includes(tipo_carta) ? tipo_carta : 'ANTIGUA', codigo_toteat: codigo_toteat?.trim() || null, activo, ingredientes: ingredientes?.length ?? 0 },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const supabase = await createClient();
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';

  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const { data: actual, error: getErr } = await supabase
    .from('carta')
    .select('id,nombre,categoria,activo')
    .eq('id', id)
    .single();

  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!actual) return NextResponse.json({ error: 'Plato no encontrado' }, { status: 404 });

  const { error } = await supabase
    .from('carta')
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(supabase, {
    usuario_email: s.email,
    rol_usuario: s.rol,
    accion: 'desactivar_plato_carta',
    tabla: 'carta',
    registro_id: id,
    datos_anteriores: actual,
    datos_nuevos: { activo: false },
  });

  return NextResponse.json({ ok: true });
}
