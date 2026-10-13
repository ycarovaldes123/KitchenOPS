import { NextRequest, NextResponse } from 'next/server';
import { requireRol } from '@/lib/auth-server';
import { createClient } from '@/utils/supabase/server';
import { fetchToteatSales } from '@/lib/toteat';
import { mapaCodigosDefontana } from '@/lib/codigos-defontana';
import { ingredientesVigentes, versionReceta } from '@/lib/carta-vigencias';
import {
  esPP, estadoHomologacion, explotarPP, grupoVentaDefontana, lineasConsumo, normalizarCodigoToteat,
  type GrupoVentaDefontana, type IngredienteDefontana, type LineaConsumo, type RecetaPPDefontana,
} from '@/lib/defontana-consumo';

// GET /api/carta/defontana?desde&hasta — homologacion Toteat/Defontana por plato y consumo
// calculado con las ventas del rango. Solo lectura: no genera movimientos de stock.

type CartaRow = {
  id: string;
  cod_softland: string | null;
  codigo_toteat?: string | null;
  nombre: string;
  categoria: string;
  carta_ingredientes?: IngredienteDefontana[] | null;
};

function isIsoDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function acumular(destino: Map<string, LineaConsumo>, lineas: LineaConsumo[]) {
  for (const l of lineas) {
    const key = `${l.codigo_producto ?? l.nombre}||${l.unidad_medida ?? ''}`;
    const actual = destino.get(key);
    if (actual) actual.total = Number((actual.total + l.total).toFixed(6));
    else destino.set(key, { ...l });
  }
}

export async function GET(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas', 'jefatura']);
  if (!s.ok) return s.response;

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  if (!isIsoDate(desde) || !isIsoDate(hasta)) {
    return NextResponse.json({ error: 'Debes enviar desde y hasta en formato YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: cartaData, error: cartaError } = await supabase
      .from('carta')
      .select('*, carta_ingredientes(codigo_producto,pp_id,nombre,cantidad,unidad_medida)')
      .eq('activo', true)
      .order('categoria')
      .order('nombre');
    if (cartaError) throw new Error(cartaError.message);
    const carta = (cartaData ?? []) as unknown as CartaRow[];

    const codigosRecetas = carta.flatMap(p => (p.carta_ingredientes ?? []).map(i => i.codigo_producto));
    const posiblesPP = Array.from(new Set(codigosRecetas.map(c => (c ?? '').trim()).filter(Boolean)));

    // Recetas PP existentes (Maestros → Recetas PP), para mostrar sus materias primas.
    const recetasPP = new Map<string, RecetaPPDefontana>();
    for (let i = 0; i < posiblesPP.length; i += 200) {
      const { data, error } = await supabase
        .from('pp_recetas')
        .select('codigo_pp,nombre,rendimiento,unidad_rendimiento,pp_receta_ingredientes(codigo_ingrediente,nombre_ingrediente,cantidad,unidad_medida,orden)')
        .eq('activo', true)
        .in('codigo_pp', posiblesPP.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        if (!r.codigo_pp || recetasPP.has(r.codigo_pp)) continue;
        const ings = [...(r.pp_receta_ingredientes ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
        recetasPP.set(r.codigo_pp, {
          codigo_pp: r.codigo_pp,
          nombre: r.nombre,
          rendimiento: Number(r.rendimiento) || 0,
          unidad_rendimiento: r.unidad_rendimiento,
          ingredientes: ings.map(i => ({
            codigo_ingrediente: i.codigo_ingrediente,
            nombre_ingrediente: i.nombre_ingrediente,
            cantidad: Number(i.cantidad) || 0,
            unidad_medida: i.unidad_medida,
          })),
        });
      }
    }
    const codigosConRecetaPP = new Set(recetasPP.keys());
    const codigosMP = Array.from(recetasPP.values()).flatMap(r => r.ingredientes.map(i => i.codigo_ingrediente));
    const defontana = await mapaCodigosDefontana(supabase, [...codigosRecetas, ...codigosMP]);

    const porCodigo = new Map<string, number>();
    for (const p of carta) {
      const code = normalizarCodigoToteat(p.codigo_toteat);
      if (code) porCodigo.set(code, (porCodigo.get(code) ?? 0) + 1);
    }

    // Ventas Toteat del rango que entran a Defontana (Alimentos, Cafeteria y jugos naturales; ver
    // grupoVentaDefontana), por codigo y version de receta (lib/carta-vigencias.ts).
    let ventasError: string | null = null;
    const ventas = new Map<string, { code: string; fecha: string; vendidos: number }>();
    const productosVendidos = new Map<string, { codigo: string; nombre: string; categoria: string | null; grupo: GrupoVentaDefontana; vendidos: number; monto: number }>();
    try {
      const result = await fetchToteatSales(desde, hasta, { soloComida: false });
      for (const item of result.items) {
        const code = normalizarCodigoToteat(item.product_code);
        if (!code) continue;
        const grupo = grupoVentaDefontana({ ...item, hierarchyId: item.hierarchy_id });
        if (!grupo) continue;
        const cantidad = Number(item.quantity) || 0;
        const key = `${code}||${versionReceta(code, item.fecha)}`;
        const actual = ventas.get(key) ?? { code, fecha: item.fecha, vendidos: 0 };
        actual.vendidos += cantidad;
        ventas.set(key, actual);

        const producto = productosVendidos.get(code) ?? { codigo: code, nombre: item.product_name, categoria: item.category, grupo, vendidos: 0, monto: 0 };
        producto.vendidos += cantidad;
        producto.monto += Number(item.gross_amount) || 0;
        productosVendidos.set(code, producto);
      }
    } catch (e) {
      ventasError = e instanceof Error ? e.message : 'No se pudieron leer las ventas Toteat';
    }

    const platos = carta.map(p => {
      const code = normalizarCodigoToteat(p.codigo_toteat);
      const ingredientes = p.carta_ingredientes ?? [];
      const duplicado = !!code && (porCodigo.get(code) ?? 0) > 1;
      const estado = estadoHomologacion(code, ingredientes, defontana, duplicado);

      const consumo = new Map<string, LineaConsumo>();
      let vendidos = 0;
      // Con codigo duplicado no se sabe a que receta corresponde la venta: no se calcula.
      if (code && !duplicado) {
        for (const v of ventas.values()) {
          if (v.code !== code) continue;
          vendidos += v.vendidos;
          acumular(consumo, lineasConsumo(ingredientesVigentes(code, v.fecha, ingredientes), v.vendidos, defontana, codigosConRecetaPP));
        }
      }

      const lineas = Array.from(consumo.values());
      const receta = lineasConsumo(ingredientes, 1, defontana, codigosConRecetaPP);
      return {
        id: p.id,
        codigo_toteat: code || null,
        cod_softland: p.cod_softland,
        nombre: p.nombre,
        categoria: p.categoria,
        estado,
        codigo_duplicado: duplicado,
        pp: receta.filter(l => l.tipo === 'pp').length,
        directos: receta.filter(l => l.tipo === 'directo').length,
        con_defontana: receta.filter(l => l.codigo_defontana).length,
        lineas_receta: receta.length,
        vendidos: Number(vendidos.toFixed(3)),
        receta,
        consumo: lineas.map(l => ({
          ...l,
          materias_primas: l.tipo === 'pp' && l.codigo_producto && recetasPP.has(l.codigo_producto)
            ? explotarPP(l.total, l.unidad_medida, recetasPP.get(l.codigo_producto)!, defontana)
            : null,
        })),
      };
    });

    // Cada producto vendido enlazado por codigo Toteat con los platos de la carta.
    const platosPorCodigo = new Map<string, typeof platos>();
    for (const p of platos) {
      if (!p.codigo_toteat) continue;
      platosPorCodigo.set(p.codigo_toteat, [...(platosPorCodigo.get(p.codigo_toteat) ?? []), p]);
    }
    const ventasProductos = Array.from(productosVendidos.values())
      .map(v => {
        const asociados = platosPorCodigo.get(v.codigo) ?? [];
        const conReceta = asociados.some(p => p.lineas_receta > 0);
        return {
          ...v,
          vendidos: Number(v.vendidos.toFixed(3)),
          monto: Math.round(v.monto),
          platos: asociados.map(p => ({ id: p.id, nombre: p.nombre, lineas_receta: p.lineas_receta })),
          vinculo: (conReceta ? 'con_receta' : asociados.length ? 'sin_receta' : 'sin_plato') as 'con_receta' | 'sin_receta' | 'sin_plato',
        };
      })
      .sort((a, b) => b.vendidos - a.vendidos);

    const ppDistintos = new Set<string>();
    const directosDistintos = new Set<string>();
    for (const p of carta) {
      for (const ing of p.carta_ingredientes ?? []) {
        const codigo = (ing.codigo_producto ?? ing.nombre ?? '').trim();
        if (!codigo) continue;
        (esPP(ing, codigosConRecetaPP) ? ppDistintos : directosDistintos).add(codigo);
      }
    }

    return NextResponse.json({
      desde,
      hasta,
      ventasError,
      resumen: {
        vinculados: platos.filter(p => p.estado === 'vinculado').length,
        sin_vincular: platos.filter(p => p.estado === 'sin_codigo').length,
        pendientes: platos.filter(p => p.estado === 'pendiente' || p.estado === 'incompleto').length,
        pp_utilizados: ppDistintos.size,
        productos_directos: directosDistintos.size,
      },
      platos,
      ventas: ventasProductos,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error calculando homologacion Defontana' }, { status: 500 });
  }
}
