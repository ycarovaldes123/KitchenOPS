export type BodegaCarnico = 'CAMARA CONGELADOS' | 'CAMARA MANTENCION' | 'COCINA' | 'CAMARA FRIO' | 'BODEGAS CONSOLIDADAS';
export type TipoMovimientoCarnico = 'INGRESO' | 'SALIDA';
export type SubtipoCarnico = 'RECEPCION_BODEGA' | 'INGRESO_PP' | 'PRODUCCION' | 'MERMAS' | 'COLACION' | 'VENTAS';
export type TipoInventarioCarnico = 'INICIAL' | 'FINAL';
export type UnidadCarnico = 'KG' | 'GR' | 'UN' | 'PQ' | 'PR';

export interface CarnicoProducto {
  id: string;
  tipo: string;
  codigo: string;
  nombre: string;
  unidad_medida: UnidadCarnico;
  es_pp: boolean;
  activo: boolean;
}

export interface CarnicoPlato {
  id: string;
  categoria: string;
  codigo_toteat: string;
  plato_nombre: string;
  producto_id: string | null;
  codigo_producto: string | null;
  producto_nombre: string;
  unidad_medida: string;
  cantidad: number;
  advertencia: string | null;
  activo: boolean;
}

export interface CarnicoMovimiento {
  id: string;
  fecha: string;
  responsable_id: string | null;
  responsable_nombre: string;
  turno: 'AM' | 'PM' | null;
  observacion: string | null;
  bodega: BodegaCarnico;
  movimiento: TipoMovimientoCarnico;
  subtipo: SubtipoCarnico;
  producto_id: string;
  producto_nombre: string;
  unidad_medida: string;
  cantidad: number;
  origen: 'manual' | 'venta_toteat';
  created_at: string;
}

export interface CarnicoInventarioRow {
  id: string;
  fecha: string;
  responsable_id: string | null;
  responsable_nombre: string;
  turno: 'AM' | 'PM' | null;
  bodega: BodegaCarnico;
  tipo: TipoInventarioCarnico;
  producto_id: string;
  producto_nombre: string;
  unidad_medida: string;
  cantidad: number;
}

export interface PlatoOrigenConsumo {
  codigo_toteat: string;
  plato_nombre: string;
  cantidad_vendida: number;
  cantidad_por_plato: number;
  unidad_receta: string;
}

export interface ConsumoCalculado {
  producto_id: string;
  producto_nombre: string;
  unidad_medida: string;
  cantidad_calculada: number;
  platos_origen: PlatoOrigenConsumo[];
  cantidad_platos_vendidos_total: number;
  ya_registrado?: boolean;
}

export type TipoPendienteVenta =
  | 'codigo_toteat_sin_relacion'
  | 'producto_relacionado_inexistente'
  | 'cantidad_por_plato_invalida'
  | 'unidad_no_reconocida'
  | 'dia_sin_ventas'
  | 'api_sin_respuesta';

export interface PendienteVenta {
  tipo: TipoPendienteVenta;
  codigo_toteat: string | null;
  plato_nombre: string | null;
  observacion: string;
}

export interface ResumenFila {
  producto_id: string;
  producto_nombre: string;
  producto_codigo: string;
  categoria: string;
  unidad_medida: string;
  inv_inicial: number;
  ingresos: number;
  ventas: number;
  produccion: number;
  mermas: number;
  colacion: number;
  calculo: number;
  inv_final: number;
  diferencia: number | null;
  estado: 'ok' | 'alerta' | 'sin_conteo';
  inv_inicial_fuente: 'conteo_hoy' | 'carry_forward' | 'cero';
}
