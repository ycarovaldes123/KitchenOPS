// ============================================================
// KitchenOps — Tipos TypeScript — Schema definitivo
// REGLAS CRÍTICAS:
//   - productos.codigo: TEXT (nunca number — "0301032" tiene cero inicial)
//   - precio_carta: siempre incluye IVA — nunca recalcular
//   - total_producido = cantidad × gramos_por_pp (recetas_ref NO entra)
//   - responsables: UUID pk, nombre único, email puede ser compartido (cocina)
// ============================================================

export type TipoPP        = 'PORCION' | 'CC' | 'UND' | 'DIRECTO';
export type TurnoType     = 'AM' | 'PM';
export type RolType       = 'cocina' | 'jefatura' | 'finanzas' | 'admin';
export type EstadoType    = 'REGISTRADO';
export type MotivoMerma   = 'Vencimiento' | 'Daño físico' | 'Sobra producción' | 'Contaminación';
export type CategoriaCarta = 'PICADAS' | 'CLÁSICOS' | 'SANDWICH & BURGERS' | 'ENSALADAS' | 'POSTRES' | 'CATERING';
export type ColorSemaforo = 'green' | 'yellow' | 'red' | 'gray';

// ─── Maestros ────────────────────────────────────────────────

export interface Responsable {
  id:         string;           // UUID
  nombre:     string;           // UNIQUE — "PAULINA TRONCOSO", "JAVIERA SEPULVEDA"
  email:      string | null;    // auth email — varios cocina comparten chefstorobayo@
  rol:        RolType;
  activo:     boolean;
  color_hex:  string | null;    // color avatar UI
  iniciales:  string | null;    // "PT", "JS"
  created_at: string;
}

export interface Producto {
  codigo:         string;   // TEXT — "0301032" con cero inicial, NUNCA number
  nombre:         string;
  unidad_medida:  string;   // KG | GR | LT | UN | CC | PR
  costo_promedio: number;   // CLP entero sin decimales
  activo:         boolean;
  updated_at:     string;
}

export interface PP {
  id:              string;           // UUID
  nombre:          string;           // UNIQUE
  tipo_pp:         TipoPP;
  gramos_por_pp:   number | null;    // cantidad insumo por PP producido
  codigo_producto: string | null;    // FK → productos.codigo (TEXT)
  activo:          boolean;
}

export interface PPIngrediente {
  id:              string;
  pp_id:           string;
  orden:           number;
  codigo_producto: string | null;    // TEXT
  nombre_producto: string | null;
  gramos:          number | null;
  unidad_medida:   string | null;
}

export interface Verdura {
  id:         string;
  nombre:     string;
  activo:     boolean;
  created_at: string;
}

// ─── Producción ──────────────────────────────────────────────

export interface Produccion {
  id:                 string;
  fecha:              string;       // 'YYYY-MM-DD'
  responsable_id:     string | null;
  responsable_nombre: string;       // snapshot — preserva nombre en historial
  turno:              TurnoType;
  observacion:        string;       // OBLIGATORIO
  estado:             EstadoType;
  correo_enviado:     boolean;
  created_at:         string;
}

export interface DetalleProduccion {
  id:              string;
  produccion_id:   string;
  pp_id:           string | null;
  nombre_pp:       string;          // snapshot
  tipo_pp:         TipoPP | null;
  cantidad:        number;
  gramos_por_pp:   number | null;
  total_producido: number | null;   // = cantidad × gramos_por_pp
  recetas_ref:     number | null;   // SOLO referencia histórica — NO entra en cálculo
  codigo_producto: string | null;   // TEXT — snapshot
  costo_unitario:  number;          // snapshot al momento del registro
  costo_total:     number;          // snapshot al momento del registro
}

export interface Rendimiento {
  id:                 string;
  produccion_id:      string;
  fecha:              string;
  verdura:            string;
  kg_utilizados:      number;
  rendimiento_kg:     number;
  // Calculados en app (NO almacenados):
  // merma_kg = kg_utilizados - rendimiento_kg
  // merma_pct = merma_kg / kg_utilizados × 100
  responsable_nombre: string | null;  // snapshot
}

// ─── Colación ────────────────────────────────────────────────

export interface Colacion {
  id:                 string;
  fecha:              string;
  responsable_id:     string | null;
  responsable_nombre: string;         // snapshot
  menu:               string;         // OBLIGATORIO
  n_inscritos:        number;         // 0 en históricos pre-abril 2026
  costo_total:        number;
  // Calculado en app: costo_por_plato = costo_total / n_inscritos
  created_at:         string;
}

export interface DetalleColacion {
  id:              string;
  colacion_id:     string;
  codigo_producto: string | null;   // TEXT
  nombre_producto: string | null;   // snapshot
  cantidad:        number;
  unidad_medida:   string | null;
  costo_unitario:  number;          // snapshot
  costo_total:     number;          // snapshot
}

// ─── Mermas ──────────────────────────────────────────────────

export interface Merma {
  id:                 string;
  fecha:              string;
  responsable_id:     string | null;
  responsable_nombre: string;         // snapshot
  observacion:        string;         // OBLIGATORIO
  estado:             EstadoType;
  created_at:         string;
}

export interface DetalleMerma {
  id:              string;
  merma_id:        string;
  codigo_producto: string | null;    // TEXT
  nombre_producto: string | null;    // snapshot
  cantidad:        number;
  unidad_medida:   string | null;
  motivo:          MotivoMerma | null;
  costo_unitario:  number;           // snapshot
  costo_total:     number;           // snapshot
}

// ─── Carta / Costos ──────────────────────────────────────────

export interface Carta {
  id:           string;
  cod_softland: string | null;    // TEXT — puede tener cero inicial
  nombre:       string;
  categoria:    CategoriaCarta;
  precio_carta: number | null;    // SIEMPRE CON IVA — jamás recalcular
  activo:       boolean;
  foto_url:     string | null;
  updated_at:   string;
}

export interface CartaIngrediente {
  id:              string;
  carta_id:        string;
  codigo_producto: string | null;   // TEXT
  pp_id:           string | null;
  nombre:          string | null;
  cantidad:        number;
  unidad_medida:   string | null;
  precio_unitario: number | null;
  costo_total:     number | null;
}

// ─── Tipos extendidos (con joins) ────────────────────────────

export interface ProduccionConDetalle extends Produccion {
  detalle_produccion: DetalleProduccion[];
  rendimiento:        Rendimiento[];
}

export interface ColacionConDetalle extends Colacion {
  detalle_colacion: DetalleColacion[];
}

export interface MermaConDetalle extends Merma {
  detalle_mermas: DetalleMerma[];
}

export interface CartaConCostos extends Carta {
  carta_ingredientes: CartaIngrediente[];
  costo_neto?:        number;
  costo_bruto?:       number;     // costo_neto × 1.19
  margen_pct?:        number;     // (precio_carta - costo_bruto) / precio_carta × 100
  semaforo?:          ColorSemaforo;
}

// ─── Payloads API ────────────────────────────────────────────

export interface ProduccionPayload {
  fecha:              string;
  responsable_id:     string;
  responsable_nombre: string;
  turno:              TurnoType;
  observacion:        string;
  detalle:            Omit<DetalleProduccion, 'id' | 'produccion_id'>[];
  rendimiento:        Omit<Rendimiento, 'id' | 'produccion_id'>[];
}

export interface ColacionPayload {
  fecha:              string;
  responsable_id:     string;
  responsable_nombre: string;
  menu:               string;
  n_inscritos:        number;
  detalle:            Omit<DetalleColacion, 'id' | 'colacion_id'>[];
}

export interface MermaPayload {
  fecha:              string;
  responsable_id:     string;
  responsable_nombre: string;
  observacion:        string;
  detalle:            Omit<DetalleMerma, 'id' | 'merma_id'>[];
}

// ─── KPIs ────────────────────────────────────────────────────

export interface KPIResumen {
  total_informes:            number;
  total_produccion_unidades: number;
  total_mermas_clp:          number;
  total_colacion_clp:        number;
  costo_por_plato_promedio:  number;
}
