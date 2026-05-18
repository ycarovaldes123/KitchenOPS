// ============================================================
// KitchenOps — Tipos TypeScript de la base de datos Supabase
// CRÍTICO: códigos Softland siempre TEXT, nunca number
// ============================================================

export type TipoPP = 'PORCION' | 'CC' | 'UND' | 'DIRECTO';
export type TurnoType = 'AM' | 'PM';
export type RolType = 'cocina' | 'jefatura' | 'finanzas';
export type EstadoType = 'REGISTRADO';
export type MotivoMerma = 'Vencimiento' | 'Daño físico' | 'Sobra producción' | 'Contaminación';
export type CategoriaCarta = 'PICADAS' | 'CLÁSICOS' | 'SANDWICH & BURGERS' | 'ENSALADAS' | 'POSTRES' | 'CATERING';
export type ColorSemaforo = 'green' | 'yellow' | 'red' | 'gray';

// ─── Maestros ────────────────────────────────────────────────

export interface Producto {
  codigo: string;           // TEXT — "0301032" puede tener cero inicial
  nombre: string;
  unidad_medida: string;    // KG | GR | LT | UN | CC | PR
  costo_promedio: number;   // CLP sin decimales
  activo: boolean;
  updated_at: string;
}

export interface PP {
  id: string;
  nombre: string;
  tipo_pp: TipoPP;
  gramos_por_pp: number | null;
  codigo_producto: string | null;  // FK → productos.codigo (TEXT)
  activo: boolean;
}

export interface PPIngrediente {
  id: string;
  pp_id: string;
  orden: number;
  codigo_producto: string | null;  // TEXT
  nombre_producto: string | null;
  gramos: number | null;
  unidad_medida: string | null;
}

export interface Responsable {
  email: string;
  nombre: string;
  rol: RolType;
}

export interface Verdura {
  id: string;
  nombre: string;
}

// ─── Producción ──────────────────────────────────────────────

export interface Produccion {
  id: string;
  fecha: string;            // DATE → ISO string 'YYYY-MM-DD'
  responsable: string | null;  // FK → responsables.email
  turno: TurnoType;
  observacion: string;      // OBLIGATORIO
  estado: EstadoType;
  created_at: string;
}

export interface DetalleProduccion {
  id: string;
  produccion_id: string;
  nombre_pp: string;
  tipo_pp: TipoPP | null;
  cantidad: number;
  gramos_por_pp: number | null;
  total_producido: number | null;   // = cantidad × gramos_por_pp (RECETAS no entra)
  recetas_ref: number | null;       // SOLO referencia histórica
  codigo_producto: string | null;   // TEXT
  costo_unitario: number;
  costo_total: number;
}

export interface Rendimiento {
  id: string;
  produccion_id: string;
  fecha: string;
  verdura: string;
  kg_utilizados: number;
  rendimiento_kg: number;
  // Calculados: merma_kg = kg_utilizados - rendimiento_kg
  // merma_pct = merma_kg / kg_utilizados × 100
  responsable: string | null;
}

// ─── Colación ────────────────────────────────────────────────

export interface Colacion {
  id: string;
  fecha: string;
  responsable: string | null;
  menu: string;             // OBLIGATORIO
  n_inscritos: number;      // OBLIGATORIO desde abril 2026; histórico = 0
  costo_total: number;
  // Calculado: costo_por_plato = costo_total / n_inscritos
  created_at: string;
}

export interface DetalleColacion {
  id: string;
  colacion_id: string;
  codigo_producto: string | null;  // TEXT
  nombre_producto: string | null;
  cantidad: number;
  unidad_medida: string | null;
  costo_unitario: number;
  costo_total: number;
}

// ─── Mermas ──────────────────────────────────────────────────

export interface Merma {
  id: string;
  fecha: string;
  responsable: string | null;
  observacion: string;      // OBLIGATORIO
  estado: EstadoType;
  created_at: string;
}

export interface DetalleMerma {
  id: string;
  merma_id: string;
  codigo_producto: string | null;  // TEXT
  nombre_producto: string | null;
  cantidad: number;
  unidad_medida: string | null;
  motivo: MotivoMerma | null;
  costo_unitario: number;
  costo_total: number;
}

// ─── Carta / Costos ──────────────────────────────────────────

export interface Carta {
  id: string;
  cod_softland: string | null;  // TEXT — puede tener cero inicial
  nombre: string;
  categoria: CategoriaCarta;
  precio_carta: number | null;  // CON IVA incluido — jamás recalcular
  activo: boolean;
  foto_url: string | null;
  updated_at: string;
}

export interface CartaIngrediente {
  id: string;
  carta_id: string;
  codigo_producto: string | null;  // TEXT
  pp_id: string | null;
  nombre: string | null;
  cantidad: number;
  unidad_medida: string | null;
  precio_unitario: number | null;
  costo_total: number | null;
}

// ─── Tipos derivados / extendidos ────────────────────────────

export interface ProduccionConDetalle extends Produccion {
  detalle_produccion: DetalleProduccion[];
  rendimiento: Rendimiento[];
  responsable_info?: Responsable;
}

export interface ColacionConDetalle extends Colacion {
  detalle_colacion: DetalleColacion[];
}

export interface MermaConDetalle extends Merma {
  detalle_mermas: DetalleMerma[];
}

export interface CartaConCostos extends Carta {
  carta_ingredientes: CartaIngrediente[];
  costo_neto?: number;
  costo_bruto?: number;  // costo_neto × 1.19
  margen_pct?: number;   // (precio_carta - costo_bruto) / precio_carta × 100
  semaforo?: ColorSemaforo;
}

// ─── Payloads de API ─────────────────────────────────────────

export interface ProduccionPayload {
  fecha: string;
  responsable: string;
  turno: TurnoType;
  observacion: string;
  detalle: Omit<DetalleProduccion, 'id' | 'produccion_id'>[];
  rendimiento: Omit<Rendimiento, 'id' | 'produccion_id'>[];
}

export interface ColacionPayload {
  fecha: string;
  responsable: string;
  menu: string;
  n_inscritos: number;
  detalle: Omit<DetalleColacion, 'id' | 'colacion_id'>[];
}

export interface MermaPayload {
  fecha: string;
  responsable: string;
  observacion: string;
  detalle: Omit<DetalleMerma, 'id' | 'merma_id'>[];
}

// ─── KPIs ────────────────────────────────────────────────────

export interface KPIResumen {
  total_informes: number;
  total_produccion_kg: number;
  total_mermas_clp: number;
  total_colacion_clp: number;
  costo_por_plato_promedio: number;
}
