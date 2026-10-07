// Modelo del módulo Alertas y Validaciones. La UI consume DatosModulo desde lib/alertas/fuente.ts,
// que hoy obtiene el análisis real (solo lectura) de GET /api/alertas.

export type NivelAlerta = 'ALTA' | 'REVISAR' | 'INFO';

export type EstadoRevision = 'PENDIENTE' | 'ERROR_CONFIRMADO' | 'DATO_CORRECTO' | 'CORREGIDO';

export type ModoRegla = 'OBSERVAR' | 'ADVERTIR' | 'BLOQUEAR';

export type ModuloAlerta =
  | 'Producción' | 'Mermas' | 'Colación' | 'Frutas' | 'Inventario'
  | 'Control Cárnicos' | 'Costos' | 'Maestros' | 'Importaciones';

export type CategoriaAlerta =
  | 'UNIDAD' | 'CANTIDAD_ATIPICA' | 'FECHA' | 'RENDIMIENTO' | 'COSTO' | 'PRODUCTO_SIN_COSTO'
  | 'PP_SIN_RECETA' | 'PP_SIN_EQUIVALENCIA' | 'DATOS_INCOMPLETOS' | 'DUPLICADO' | 'INVENTARIO'
  | 'IMPORTACION' | 'MERMA_ANORMAL' | 'RELACION_OPERACIONAL';

// Agrupación de los KPIs superiores
export type GrupoCategoria = 'Cantidad / Unidad' | 'Fechas' | 'Datos maestros' | 'Otros';

export interface ReglaValidacion {
  codigo: string;          // VAL-MER-001
  nombre: string;
  descripcion: string;
  modulo: ModuloAlerta | 'Todos';
  categoria: CategoriaAlerta;
  nivel: NivelAlerta;
  modo: ModoRegla;         // ADVERTIR = aviso al guardar; OBSERVAR = solo en la pantalla de Alertas
  activa: boolean;
}

export interface Evidencia {
  label: string;
  valor: string;
  destacado?: boolean;
}

// Movimiento que originó la alerta. fecha_movimiento = fecha operacional;
// created_at = cuándo se registró en KitchenOps (que difieran no es por sí solo un error).
export interface MovimientoOrigen {
  id: string;
  fecha_movimiento: string;   // YYYY-MM-DD
  created_at: string;         // ISO local
  created_by: string;
  cantidad?: string;
  motivo?: string;
  observacion?: string;
}

export interface CambioEstado {
  estado: EstadoRevision;
  fecha: string;             // ISO
  usuario: string;
  nota?: string;
}

export interface Alerta {
  id: string;
  regla: string;             // código de ReglaValidacion
  categoria: CategoriaAlerta;
  nivel: NivelAlerta;
  modulo: ModuloAlerta;
  registro: string;          // producto / PP / plato afectado
  codigo?: string;           // código del producto
  detalle: string;           // resumen corto para la tabla
  titulo: string;            // POSIBLE ERROR DE UNIDAD
  explicacion: string;
  evidencia: Evidencia[];
  movimiento: MovimientoOrigen;
  fecha: string;             // YYYY-MM-DD en que se generó la alerta
  estado: EstadoRevision;
  historial: CambioEstado[];
  origen?: string;           // id del registro (producción / merma / colación) que originó la alerta
}

// Volumen de movimientos por usuario en el período (contexto para la tasa de alertas)
export interface VolumenUsuario {
  usuario: string;
  movimientos: number;
}

// Lo que recibe la UI de la fuente de datos
export interface DatosModulo {
  alertas: Alerta[];
  reglas: ReglaValidacion[];
  volumen: VolumenUsuario[];
  hoy: string;                  // YYYY-MM-DD (Chile) para los filtros de fecha
  generadoEn: string;           // ISO local de cuándo corrió el análisis
  registrosAnalizados: number;
}
