import { convertirCantidad } from '@/lib/unidades-carnicos';
import type { CarnicoPlato, CarnicoProducto, ConsumoCalculado, PendienteVenta } from '@/types/carnicos';

export interface VentaLike {
  fecha: string;
  product_code: string | null;
  product_name: string;
  quantity: number;
}

export interface CalculoConsumoResultado {
  consumos: ConsumoCalculado[];
  pendientes: PendienteVenta[];
}

/**
 * Calcula el consumo de productos carnicos a partir de ventas Toteat, cruzando
 * directamente por codigo_toteat contra carnicos_platos (sin fuzzy matching:
 * la relacion ya viene resuelta desde el importador de Excel).
 */
export function calcularConsumoCarnicos(
  ventas: VentaLike[],
  platos: CarnicoPlato[],
  productos: CarnicoProducto[],
): CalculoConsumoResultado {
  const platosByCode = new Map<string, CarnicoPlato[]>();
  for (const plato of platos) {
    if (!plato.activo) continue;
    const list = platosByCode.get(plato.codigo_toteat) ?? [];
    list.push(plato);
    platosByCode.set(plato.codigo_toteat, list);
  }

  const productosById = new Map(productos.map(p => [p.id, p]));
  const consumos = new Map<string, ConsumoCalculado>();
  const pendientes: PendienteVenta[] = [];

  if (ventas.length === 0) {
    pendientes.push({ tipo: 'dia_sin_ventas', codigo_toteat: null, plato_nombre: null, observacion: 'No se encontraron ventas para la fecha seleccionada.' });
    return { consumos: [], pendientes };
  }

  for (const venta of ventas) {
    const codigo = venta.product_code ?? '';
    const cantidadVendida = Number(venta.quantity) || 0;
    const matches = platosByCode.get(codigo);

    if (!matches || matches.length === 0) {
      pendientes.push({
        tipo: 'codigo_toteat_sin_relacion',
        codigo_toteat: codigo || null,
        plato_nombre: venta.product_name,
        observacion: `El codigo Toteat "${codigo || 'sin codigo'}" (${venta.product_name}) no tiene relacion en BASE DE DATOS PLATOS CARNES.`,
      });
      continue;
    }

    for (const plato of matches) {
      if (!plato.producto_id) {
        pendientes.push({
          tipo: 'producto_relacionado_inexistente',
          codigo_toteat: plato.codigo_toteat,
          plato_nombre: plato.plato_nombre,
          observacion: plato.advertencia ?? `El producto "${plato.producto_nombre}" no existe en BASE DE DATOS CARNES.`,
        });
        continue;
      }

      const producto = productosById.get(plato.producto_id);
      if (!producto) {
        pendientes.push({
          tipo: 'producto_relacionado_inexistente',
          codigo_toteat: plato.codigo_toteat,
          plato_nombre: plato.plato_nombre,
          observacion: `El producto asociado a "${plato.plato_nombre}" ya no existe en el catalogo de carnicos.`,
        });
        continue;
      }

      const cantidadPorPlato = Number(plato.cantidad);
      if (!Number.isFinite(cantidadPorPlato) || cantidadPorPlato <= 0) {
        pendientes.push({
          tipo: 'cantidad_por_plato_invalida',
          codigo_toteat: plato.codigo_toteat,
          plato_nombre: plato.plato_nombre,
          observacion: `La cantidad por plato para "${producto.nombre}" en "${plato.plato_nombre}" no es valida.`,
        });
        continue;
      }

      const consumoEnUnidadReceta = cantidadPorPlato * cantidadVendida;
      const consumoConvertido = convertirCantidad(consumoEnUnidadReceta, plato.unidad_medida, producto.unidad_medida);
      if (consumoConvertido === null) {
        pendientes.push({
          tipo: 'unidad_no_reconocida',
          codigo_toteat: plato.codigo_toteat,
          plato_nombre: plato.plato_nombre,
          observacion: `No se pudo convertir ${plato.unidad_medida} a ${producto.unidad_medida} para "${producto.nombre}".`,
        });
        continue;
      }

      const current = consumos.get(producto.id) ?? {
        producto_id: producto.id,
        producto_nombre: producto.nombre,
        unidad_medida: producto.unidad_medida,
        cantidad_calculada: 0,
        platos_origen: [],
        cantidad_platos_vendidos_total: 0,
      };
      current.cantidad_calculada += consumoConvertido;
      current.cantidad_platos_vendidos_total += cantidadVendida;

      // Si Toteat entrega mas de una fila de venta para el mismo plato el mismo dia (ej. por
      // turno u orden), se suman en la misma entrada de platos_origen en vez de crear una nueva.
      // Sin esto, al registrar se generaba una fila por entrada (todas con la misma clave
      // fecha+codigo_toteat+producto) y solo la ultima quedaba guardada, perdiendo el resto.
      const origenExistente = current.platos_origen.find(o => o.codigo_toteat === plato.codigo_toteat);
      if (origenExistente) {
        origenExistente.cantidad_vendida += cantidadVendida;
      } else {
        current.platos_origen.push({
          codigo_toteat: plato.codigo_toteat,
          plato_nombre: plato.plato_nombre,
          cantidad_vendida: cantidadVendida,
          cantidad_por_plato: cantidadPorPlato,
          unidad_receta: plato.unidad_medida,
        });
      }
      consumos.set(producto.id, current);
    }
  }

  return { consumos: Array.from(consumos.values()).sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre)), pendientes };
}
