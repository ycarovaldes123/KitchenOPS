// Catálogo del módulo Alertas: reglas de validación y etiquetas por categoría.
// Las reglas las ejecuta lib/alertas/analizador.ts sobre los datos reales (solo lectura).

import type { CategoriaAlerta, GrupoCategoria, ReglaValidacion } from './types';

// El módulo se implementa desde septiembre 2026: solo se generan alertas (y conteos por usuario)
// de registros desde esta fecha. El historial anterior se usa únicamente como referencia de lo "habitual".
export const INICIO_MODULO = '2026-09-01';

export const CATEGORIA_LABEL: Record<CategoriaAlerta, string> = {
  UNIDAD: 'Unidad',
  CANTIDAD_ATIPICA: 'Cantidad atípica',
  FECHA: 'Fecha',
  RENDIMIENTO: 'Rendimiento',
  COSTO: 'Costo',
  PRODUCTO_SIN_COSTO: 'Sin costo',
  PP_SIN_RECETA: 'PP sin producto',
  PP_SIN_EQUIVALENCIA: 'PP sin equivalencia',
  DATOS_INCOMPLETOS: 'Datos incompletos',
  DUPLICADO: 'Duplicado',
  INVENTARIO: 'Inventario',
  IMPORTACION: 'Importación',
  MERMA_ANORMAL: 'Merma atípica',
  RELACION_OPERACIONAL: 'Merma vs producción',
};

export const CATEGORIA_GRUPO: Record<CategoriaAlerta, GrupoCategoria> = {
  UNIDAD: 'Cantidad / Unidad',
  CANTIDAD_ATIPICA: 'Cantidad / Unidad',
  MERMA_ANORMAL: 'Cantidad / Unidad',
  RENDIMIENTO: 'Cantidad / Unidad',
  RELACION_OPERACIONAL: 'Cantidad / Unidad',
  FECHA: 'Fechas',
  COSTO: 'Datos maestros',
  PRODUCTO_SIN_COSTO: 'Datos maestros',
  PP_SIN_RECETA: 'Datos maestros',
  PP_SIN_EQUIVALENCIA: 'Datos maestros',
  DATOS_INCOMPLETOS: 'Otros',
  DUPLICADO: 'Otros',
  INVENTARIO: 'Otros',
  IMPORTACION: 'Otros',
};

// Icono (components/layout/NavIcon) por categoría
export const CATEGORIA_ICONO: Record<CategoriaAlerta, string> = {
  UNIDAD: 'scale',
  CANTIDAD_ATIPICA: 'sigma',
  FECHA: 'calendar-clock',
  RENDIMIENTO: 'trending',
  COSTO: 'badge-dollar',
  PRODUCTO_SIN_COSTO: 'badge-dollar',
  PP_SIN_RECETA: 'database',
  PP_SIN_EQUIVALENCIA: 'database',
  DATOS_INCOMPLETOS: 'file-warning',
  DUPLICADO: 'copy',
  INVENTARIO: 'package',
  IMPORTACION: 'file-warning',
  MERMA_ANORMAL: 'trending',
  RELACION_OPERACIONAL: 'hash',
};

// ADVERTIR: al guardar en Producción, Mermas o Colación se muestra la advertencia y la persona
// decide si corrige o guarda igual (nunca bloquea). OBSERVAR: solo aparece en la pantalla de Alertas
// (reglas de maestros, costos o cárnicos, que no dependen de quien registra).
export const REGLAS: ReglaValidacion[] = [
  { codigo: 'VAL-MER-001', nombre: 'Posible PP ingresado como cantidad física', descripcion: 'Merma de un PP en GR/CC menor al 20% de una porción: probablemente se quiso registrar PP.', modulo: 'Mermas', categoria: 'UNIDAD', nivel: 'REVISAR', modo: 'ADVERTIR', activa: true },
  { codigo: 'VAL-UNI-002', nombre: 'Cantidad fuera de escala para la unidad', descripcion: 'Menos de 5 GR/CC, o 100 o más KG/LT en una sola línea: probable confusión KG ↔ GR.', modulo: 'Todos', categoria: 'UNIDAD', nivel: 'REVISAR', modo: 'ADVERTIR', activa: true },
  { codigo: 'VAL-UNI-001', nombre: 'Unidad distinta a la del maestro', descripcion: 'La unidad de la línea no coincide con la del producto en Maestros.', modulo: 'Todos', categoria: 'UNIDAD', nivel: 'INFO', modo: 'ADVERTIR', activa: true },
  { codigo: 'VAL-FEC-001', nombre: 'Fecha posiblemente inconsistente', descripcion: 'La observación o el menú mencionan una fecha distinta (1 a 45 días) a la del registro.', modulo: 'Todos', categoria: 'FECHA', nivel: 'REVISAR', modo: 'ADVERTIR', activa: true },
  { codigo: 'VAL-PRO-002', nombre: 'Posible error de escala en producción', descripcion: 'La cantidad × o ÷ 10/100/1.000 coincide con un lote habitual del mismo producto y modalidad (ej. 12,1 GR cuando se producen ~12.100 GR). ×1.000 con 10+ registros = crítica.', modulo: 'Producción', categoria: 'UNIDAD', nivel: 'ALTA', modo: 'ADVERTIR', activa: true },
  { codigo: 'VAL-PRO-001', nombre: 'Cantidad atípica de producción', descripcion: 'Cantidad muy inferior o superior a los lotes habituales del mismo producto y modalidad (fuera de P10/5 – P90×5; con 10+ registros, aviso informativo desde P10/2,5 – P90×2,5). Requiere 5+ producciones comparables.', modulo: 'Producción', categoria: 'CANTIDAD_ATIPICA', nivel: 'REVISAR', modo: 'ADVERTIR', activa: true },
  { codigo: 'VAL-MER-002', nombre: 'Merma atípica', descripcion: 'Merma 5 veces o más la mediana histórica del mismo producto (con 6+ registros).', modulo: 'Mermas', categoria: 'MERMA_ANORMAL', nivel: 'REVISAR', modo: 'ADVERTIR', activa: true },
  { codigo: 'VAL-CAR-001', nombre: 'Movimiento cárnico atípico', descripcion: 'Cantidad 5 veces o más la mediana del mismo producto y tipo de movimiento.', modulo: 'Control Cárnicos', categoria: 'CANTIDAD_ATIPICA', nivel: 'REVISAR', modo: 'OBSERVAR', activa: true },
  { codigo: 'VAL-OPE-001', nombre: 'Merma mayor que la producción del día', descripcion: 'La merma de un PP supera lo producido de ese PP el mismo día (misma unidad).', modulo: 'Mermas', categoria: 'RELACION_OPERACIONAL', nivel: 'REVISAR', modo: 'ADVERTIR', activa: true },
  { codigo: 'VAL-REN-001', nombre: 'Rendimiento de verdura imposible o muy bajo', descripcion: 'Rinde más de lo utilizado (>100%) o menos del 30%.', modulo: 'Producción', categoria: 'RENDIMIENTO', nivel: 'REVISAR', modo: 'ADVERTIR', activa: true },
  { codigo: 'VAL-REN-002', nombre: 'Rendimiento de verdura ingresado en GR', descripcion: 'KG utilizados o rendidos de 100 o más: las verduras se registran en KG, probablemente se ingresaron gramos.', modulo: 'Producción', categoria: 'UNIDAD', nivel: 'ALTA', modo: 'ADVERTIR', activa: true },
  { codigo: 'VAL-MAE-001', nombre: 'Líneas valorizadas en $0', descripcion: 'Producto usado con costo 0: los registros quedaron sin valorizar.', modulo: 'Maestros', categoria: 'PRODUCTO_SIN_COSTO', nivel: 'INFO', modo: 'OBSERVAR', activa: true },
  { codigo: 'VAL-MAE-002', nombre: 'PP sin código de producto', descripcion: 'PP que se produce pero no está vinculado a un producto: su producción queda en $0.', modulo: 'Maestros', categoria: 'PP_SIN_RECETA', nivel: 'REVISAR', modo: 'OBSERVAR', activa: true },
  { codigo: 'VAL-MAE-003', nombre: 'PP por porción sin gramos', descripcion: 'PP tipo porción sin gramos por porción: no se puede convertir a GR.', modulo: 'Maestros', categoria: 'PP_SIN_EQUIVALENCIA', nivel: 'REVISAR', modo: 'OBSERVAR', activa: true },
  { codigo: 'VAL-COS-002', nombre: 'Costo o rendimiento de PP sospechoso', descripcion: 'PP en GR/CC con costo sobre $100 por unidad, o receta con rendimiento ≤ 1.', modulo: 'Costos', categoria: 'COSTO', nivel: 'ALTA', modo: 'OBSERVAR', activa: true },
  { codigo: 'VAL-GEN-001', nombre: 'Línea incompleta', descripcion: 'Línea guardada con cantidad 0 o sin producto.', modulo: 'Todos', categoria: 'DATOS_INCOMPLETOS', nivel: 'INFO', modo: 'ADVERTIR', activa: true },
  { codigo: 'VAL-GEN-002', nombre: 'Posible línea duplicada', descripcion: 'Mismo producto y misma cantidad repetidos dentro de un mismo registro.', modulo: 'Todos', categoria: 'DUPLICADO', nivel: 'REVISAR', modo: 'ADVERTIR', activa: true },
];
