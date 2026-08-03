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
export type RolType       = 'cocina' | 'economo' | 'bodega' | 'jefatura' | 'finanzas' | 'admin';
export type EstadoType    = 'REGISTRADO';
export type MotivoMerma   =
  // Nuevos (desde may-2026):
  | 'Vencimiento' | 'Mala manipulación' | 'Sobreproducción'
  | 'Devolución' | 'Corte / limpieza' | 'Error de producción'
  | 'Hongos' | 'Mal estado' | 'Prueba de plato' | 'Caída' | 'Crudo'
  | 'Roto' | 'Sellado al vacio'
  | 'Error Garzón' | 'Devolución Cliente' | 'Quemado'
  | 'Pelo / contaminación' | 'Mal preparado'
  // Históricos (registros anteriores):
  | 'Daño físico' | 'Sobra producción' | 'Contaminación'
  | 'Otro' | 'Cliente no recibe' | 'Caida' | 'Pelo / contaminacion';
export type CategoriaCarta = 'PICADAS' | 'CLÁSICOS' | 'SANDWICH & BURGERS' | 'ENSALADAS' | 'POSTRES' | 'CATERING';
export type ColorSemaforo = 'green' | 'yellow' | 'red' | 'gray';
export type TipoCarta = 'ANTIGUA' | 'NUEVA';

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
  costo_promedio: number;   // CLP; puede tener decimales para PP por GR/CC
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
  codigo_producto?: string | null;
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
  costo_unitario:  number;          // snapshot al momento del registro; puede ser decimal
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

export interface Fruta {
  id:                 string;
  fecha:              string;
  responsable_id:     string | null;
  responsable_nombre: string;
  observacion:        string | null;
  costo_total:        number;
  created_at:         string;
}

export interface DetalleFruta {
  id:              string;
  fruta_id:        string;
  codigo_producto: string | null;
  nombre_producto: string | null;
  cantidad:        number;
  unidad_medida:   string | null;
  costo_unitario:  number;
  costo_total:     number;
}

export interface Inventario {
  id:                 string;
  fecha:              string;
  responsable_id:     string | null;
  responsable_nombre: string;
  observacion:        string | null;
  created_at:         string;
}

export interface DetalleInventario {
  id:              string;
  inventario_id:   string;
  ubicacion:       string;
  codigo_producto: string | null;
  nombre_producto: string | null;
  cantidad:        number;
  unidad_medida:   string | null;
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

export interface DetalleMermaPlato {
  id:             string;
  merma_id:       string;
  carta_id:       string | null;
  nombre_plato:   string;
  cantidad:       number;
  motivo:         MotivoMerma | null;
  costo_unitario: number;
  costo_total:    number;
  observacion:    string | null;
  created_at:     string;
}

export interface DetalleMermaPlatoInsumo {
  id:                       string;
  detalle_merma_plato_id:   string;
  carta_ingrediente_id:     string | null;
  codigo_producto:          string | null;
  pp_id:                    string | null;
  nombre:                   string;
  cantidad_unitaria:        number;
  cantidad_total:           number;
  unidad_medida:            string | null;
  precio_unitario:          number;
  costo_total:              number;
  created_at:               string;
}

// ─── Carta / Costos ──────────────────────────────────────────

export interface Carta {
  id:           string;
  cod_softland: string | null;    // TEXT — puede tener cero inicial
  nombre:       string;
  categoria:    CategoriaCarta;
  tipo_carta:   TipoCarta;
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

export interface FrutaConDetalle extends Fruta {
  detalle_frutas: DetalleFruta[];
}

export interface InventarioConDetalle extends Inventario {
  detalle_inventario: DetalleInventario[];
}

export interface MermaConDetalle extends Merma {
  detalle_mermas: DetalleMerma[];
  detalle_mermas_platos?: DetalleMermaPlato[];
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

export interface FrutaPayload {
  fecha:              string;
  responsable_id:     string;
  responsable_nombre: string;
  observacion?:       string | null;
  detalle:            Omit<DetalleFruta, 'id' | 'fruta_id'>[];
}

export interface InventarioPayload {
  fecha:              string;
  responsable_id:     string;
  responsable_nombre: string;
  observacion?:       string | null;
  detalle:            Omit<DetalleInventario, 'id' | 'inventario_id'>[];
}

export interface MermaPayload {
  fecha:              string;
  responsable_id:     string;
  responsable_nombre: string;
  observacion:        string;
  detalle:            Omit<DetalleMerma, 'id' | 'merma_id'>[];
  platos?:            Omit<DetalleMermaPlato, 'id' | 'merma_id' | 'costo_unitario' | 'costo_total' | 'created_at'>[];
}

// ─── KPIs ────────────────────────────────────────────────────

export interface KPIResumen {
  total_informes:            number;
  total_produccion_unidades: number;
  total_mermas_clp:          number;
  total_colacion_clp:        number;
  costo_por_plato_promedio:  number;
}
