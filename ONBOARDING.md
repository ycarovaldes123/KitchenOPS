# KitchenOPS — Guía de Onboarding

Sistema de gestión operacional de cocina para **Cervecería Kunstmann**, restaurante Torobayo, Valdivia, Chile.
Reemplaza el sistema legado en Google Apps Script + Sheets.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend / API routes | Next.js 16.2.6 (App Router, Turbopack) |
| Base de datos + Auth | Supabase (PostgreSQL + Auth + Storage) |
| Deploy | Vercel |
| Lenguaje | TypeScript |

**Fuentes tipográficas:** Syne 700/800 (headings, KPIs) · DM Sans 400/500 (cuerpo)

---

## Estructura de carpetas

```
kitchenops/
├── app/
│   ├── (app)/                  # Layout autenticado (sidebar + header)
│   │   ├── dashboard/          # KPIs con filtro por período
│   │   ├── produccion/         # Registro diario de producción PP
│   │   ├── colacion/           # Colación (inscripciones + costos)
│   │   ├── mermas/             # Rendimiento de verduras
│   │   ├── costos/             # Reportería de costos (semáforo)
│   │   ├── historial/          # Historial de producción
│   │   ├── kpis/               # KPIs detallados
│   │   ├── export/             # Exportación de datos
│   │   └── maestros/           # Datos maestros (PP, productos, personal)
│   ├── (auth)/login/           # Login por email
│   └── api/                    # API routes
│       ├── carta/              # GET platos con costos calculados
│       ├── kpis/               # KPIs aggregados
│       ├── maestros/           # CRUD PP, productos
│       └── ...
├── components/
│   └── costos/
│       ├── FichaTecnicaModal   # Modal con ingredientes + foto de plato
│       └── Semaforo            # Badge de color de margen
├── lib/
│   └── calculos.ts             # Lógica de negocio: semáforo, márgenes, merma
├── scripts/                    # Scripts de migración (Node.js, solo uso único)
│   ├── migrar-datos.mjs        # Datos operacionales 2026
│   ├── migrar-carta.mjs        # Carta + ingredientes desde Excel + HTML
│   └── upload-fotos.mjs        # Fotos de platos → Supabase Storage
├── types/
│   └── database.ts             # Tipos TypeScript
├── utils/supabase/             # Clientes Supabase (server/client/middleware)
└── supabase_schema.sql         # Schema completo
```

---

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=https://fqiqagesrujcmbjnbkqr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

`.env.local` ya configurado en el equipo.

---

## Base de datos — tablas principales

```sql
productos       -- Insumos del inventario Softland (codigo TEXT PK)
pp              -- Pre-producciones (salsas, fondos, bases)
responsables    -- Personal de cocina (11 pre-cargados)
produccion      -- Registro diario de producción PP
rendimiento     -- Rendimiento de verduras (merma kg)
colacion        -- Registro de colación (inscripciones + costo)
detalle_colacion    -- Detalle por plato de colación
detalle_mermas      -- Detalle de mermas por producto
carta           -- Carta del restaurante (76 platos)
carta_ingredientes  -- Ingredientes por plato (256 líneas)
```

**Supabase Storage:** bucket `fotos-platos` (público) — 30 fotos de platos subidas.

---

## Reglas de negocio críticas

```
precio_carta  → SIEMPRE incluye IVA (19%). NUNCA recalcular.
costo_bruto   = costo_neto × 1.19
margen        = (precio_carta − costo_bruto) / precio_carta × 100

Semáforo:
  ≥ 30%  → verde  (óptimo)
  25–30% → amarillo
  < 25%  → rojo
  sin datos → gris
```

**Zona horaria:** `America/Santiago` — usar `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' })`.

**productos.codigo** es siempre `TEXT` (puede tener ceros iniciales: "0301032").

---

## Módulos implementados

### Reportería de Costos (`/costos`)
- Tabla agrupada por categoría con semáforo de margen
- 4 tarjetas resumen clicables (filtran por color)
- Dropdown de categoría + pills de semáforo
- Al hacer click en un plato → `FichaTecnicaModal` con foto de portada (200px), ingredientes y costos

### Maestros (`/maestros`)
- Tab **PPs**: listado con edición inline, tipo badge, producto asociado
- Tab **Productos**: listado con búsqueda, activar/desactivar
- Tab **Personal**: responsables con avatar de color + iniciales

### Producción, Colación, Mermas, Dashboard, KPIs, Historial, Export
- Todos funcionales con datos reales migrados

---

## Autenticación

- Login por email (Supabase Auth)
- Middleware en `proxy.ts` (no `middleware.ts` — convención del proyecto)
- Roles: `admin`, `finanzas`, `jefatura`, `cocina`
- Múltiples responsables de cocina comparten el email `chefstorobayo@cerveceriakunstmann.cl`

---

## Estado de los datos

Todos los datos históricos 2026 migrados desde el sistema legado:
- **76 platos** en carta con precios, categorías y semáforo
- **256 líneas** de ingredientes por plato
- **Producción y mermas** del año en curso
- **30 fotos** de platos subidas a Storage

---

## Pendiente

- **Email automático con Resend** — diferido explícitamente por el usuario al final del desarrollo

---

## Cómo correr en local

```bash
cd kitchenops
npm install
npm run dev
# → http://localhost:3000
```

Requiere `.env.local` con las variables de Supabase (ya configurado en el equipo del usuario).

---

## Contexto de negocio

- **Cliente:** Cervecería Kunstmann, Valdivia, Chile
- **Responsable:** Yonatan Caro (ycaro@cerveceriakunstmann.cl) — Finanzas
- **Usuarios:** Equipo de cocina Torobayo + jefatura + finanzas
- **Objetivo:** Reemplazar sistema manual en Google Sheets con trazabilidad completa de producción, costos y mermas
