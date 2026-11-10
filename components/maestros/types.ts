/** Secciones de Maestros → Recetas PP (columna pp_recetas.area). */
export const AREAS_RECETA_PP = [
  { value: 'COCINA', label: 'Cocina' },
  { value: 'SALON', label: 'Salón' },
  { value: 'PASTELERIA', label: 'Pastelería' },
] as const;
export type AreaRecetaPP = typeof AREAS_RECETA_PP[number]['value'];
/** Recetas sin sección (o valor desconocido) quedan en Cocina. */
export const areaRecetaPP = (v: unknown): AreaRecetaPP => {
  const a = String(v ?? '').toUpperCase();
  return (AREAS_RECETA_PP.find(x => x.value === a)?.value ?? 'COCINA') as AreaRecetaPP;
};

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
  area?: AreaRecetaPP | null;
  importado_at: string | null;
  calculado_at: string | null;
  ingredientes: PPRecetaIngrediente[];
}
