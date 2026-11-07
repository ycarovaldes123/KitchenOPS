// Forma de una receta PP tal como la entrega GET /api/maestros/recetas-pp

export interface PPRecetaIngrediente {
  id: string;
  orden: number;
  codigo_ingrediente: string | null;
  nombre_ingrediente: string;
  cantidad: number;
  unidad_medida: string;
  costo_unitario_snap: number;
  costo_linea_calculado: number;
  sin_codigo: boolean;
  sin_costo: boolean;
}

export interface PPReceta {
  id: string;
  codigo_receta: string;
  codigo_pp: string | null;
  nombre: string;
  rendimiento: number;
  unidad_rendimiento: string;
  costo_total_calculado: number;
  costo_unitario_calculado: number;
  estado: string;
  activo: boolean;
  /** Sección de la receta en Maestros → Recetas PP. Sin columna (antes del SQL) se trata como COCINA. */
  area?: 'COCINA' | 'SALON' | null;
  importado_at: string | null;
  calculado_at: string | null;
  ingredientes: PPRecetaIngrediente[];
}
