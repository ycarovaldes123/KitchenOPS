# KitchenOPS Project Memory

Fecha de memoria: 2026-06-10
Proyecto: KitchenOPS, Cerveceria Kunstmann, cocina Torobayo.
Deploy principal: https://kitchenops-chi.vercel.app

Esta memoria resume la sesion reciente para poder retomar el proyecto sin reconstruir contexto. No se guardan tokens, passwords ni claves privadas en este archivo; esas credenciales quedan solo como variables de entorno o en Supabase/Vercel.

## Preferencias del Usuario

- Responder y trabajar en espanol.
- El usuario espera implementacion directa cuando pide cambios, y deploy a Vercel cuando corresponde.
- Cuando pida SQL para Supabase, prefiere SQL directo para pegar en el SQL Editor, no scripts externos.
- Para diagnosticos tipo "premortem", entregar analisis y recomendaciones; no implementar paneles nuevos salvo que lo pida explicitamente.
- Evitar guardar secretos en archivos de contexto. Los tokens TOTEAT, credenciales Supabase y passwords no deben repetirse aqui.

## Stack y Estado Actual

- App Next.js 16.2.6 con App Router.
- Supabase para PostgreSQL/Auth.
- Vercel para deploy.
- Alias de produccion: `kitchenops-chi.vercel.app`.
- Variables relevantes en `.env.local` y Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `TOTEAT_XIR`
  - `TOTEAT_XIL`
  - `TOTEAT_XIU`
  - `TOTEAT_XAPITOKEN`

## Modulos Relevantes

- `/produccion`: registro diario de PP y rendimiento.
- `/frutas`: registro diario de rendimiento de frutas/snacks, independiente de PP.
- `/colacion`: registro de colacion personal.
- `/mermas`: registro de mermas por producto y por plato preparado.
- `/historial`: consulta, edicion y borrado admin de produccion, colacion y mermas.
- `/dashboard`: vista ejecutiva con filtros desde/hasta, KPIs y graficos de costos diarios.
- `/kpis`: KPIs operativos.
- `/bodega`: control diario de productos criticos de cocina, separado de ventas.
- `/ventas`: consulta TOTEAT de comida y cruce con recetas para costo, margen y `% costo`.
- `/maestros`: productos, PP, recetas PP, carta, responsables.

## Produccion y Maestros

- En `/produccion` se corrigio la validacion para permitir guardar un informe si existe al menos un rendimiento de frutas valido, aunque no haya ningun PP.
- El backend de produccion ahora acepta y persiste `rendimiento` aun cuando `detalle_produccion` venga vacio.
- En `/maestros` pestaña Productos se agrego edicion de nombre de producto existente.
- Para productos, `admin` puede editar codigo y nombre; `finanzas` puede editar solo el nombre.
- En la API de productos se mantuvo la restriccion de que el cambio de codigo sigue siendo exclusivo de `admin`.

Archivos relevantes:
- `app/(app)/produccion/page.tsx`
- `app/api/produccion/route.ts`
- `app/(app)/maestros/page.tsx`
- `app/api/maestros/productos/[codigo]/route.ts`

## Frutas

- Se agrego el modulo `/frutas` para registrar rendimiento de frutas/snacks sin exigir PP.
- El backend de frutas guarda encabezado y detalle con costo total, responsable y observacion.
- La exportacion y el historial se ampliaron para incluir frutas.
- Se agregaron tablas y RLS en Supabase para `frutas` y `detalle_frutas`.

Archivos relevantes:
- `app/(app)/frutas/page.tsx`
- `app/api/frutas/route.ts`
- `app/(app)/historial/page.tsx`
- `app/api/historial/route.ts`
- `app/api/export/route.ts`
- `scripts/supabase_frutas.sql`

## Roles Actuales

Archivo fuente: `lib/roles.ts`.

- `admin`: ycaro, jsepulveda.
- `finanzas`: ddelgado, caravena.
- `jefatura`: fcaro.
- `economo`: jmendez.
- `cocina`: chefstorobayo.

Nota: roles siguen hardcodeados en codigo. Mejora futura recomendada: mover roles a tabla Supabase.

## Autenticacion Supabase

- Login con Supabase Auth.
- Password reset implementado en login con redirect a `/auth/callback?next=/auth/update-password`.
- Redirect URLs en Supabase deben incluir localhost y dominio productivo.
- Los links de invitacion/reset expiran y Supabase tiene limites de recuperacion.

## TOTEAT

- Se cambio la integracion desde credenciales Gambrinus/Conce a credenciales Torobayo.
- TOTEAT se usa solo para ventas de comida por defecto.
- Parser en `lib/toteat.ts`:
  - `product_code` puede venir como `id`.
  - `category` puede venir como `hierarchyName`.
  - `gross_amount` puede venir como `payed`.
- Catalogo TOTEAT local en `lib/toteat-catalog.ts`, usado para normalizar codigo, categoria y nombre canonico.
- `/ventas` muestra:
  - codigo TOTEAT
  - categoria TOTEAT
  - venta bruta
  - costo receta bruto
  - `% costo = costo receta bruto / venta bruta`
  - margen estimado
  - productos sin receta vinculada
- Riesgo actual: el mapeo TOTEAT vs carta sigue dependiendo de catalogo hardcodeado y matching por nombre/codigo. Mejora recomendada: tabla `toteat_producto_map`.

## Bodega Cocina

- Se separo Bodega de Ventas:
  - `/bodega`: control de productos criticos.
  - `/ventas`: ventas TOTEAT y costo receta.
- Bodega se basa en Excel `05. Planilla Control Carnes Mayo 2026.xlsx`.
- Tablas agregadas via SQL:
  - `productos_criticos_bodega`
  - `control_bodega_cocina`
  - `ventas_toteat`
- Scripts SQL relevantes:
  - `scripts/supabase_toteat_bodega.sql`
  - `scripts/fix_rls_toteat_bodega.sql`
  - `scripts/supabase_productos_criticos_excel_control.sql`
- Recomendacion pendiente: mostrar diferencia absoluta ademas de diferencia neta, porque positivos y negativos se pueden compensar.

## Mermas de Platos Preparados

- Se implemento flujo para mermar platos preparados.
- En `/mermas`, el usuario puede buscar platos de carta y registrar merma del plato.
- Backend en `app/api/mermas/route.ts` expande el plato a sus insumos:
  - `detalle_mermas` recibe una linea agregada `PLATO PREPARADO: ...`.
  - `detalle_mermas_platos` guarda detalle del plato.
  - `detalle_mermas_platos_insumos` guarda los insumos consumidos por esa merma.
- SQL requerido:
  - `scripts/supabase_mermas_platos.sql`

## Dashboard

- Se agrego filtro por rango `desde` / `hasta`.
- Se reemplazo el grafico de "Produccion registrada por dia" por graficos de costos:
  - costo produccion
  - costo colacion
  - costo mermas
  - costo total diario
- Importante: se intento agregar un panel llamado "Premortem operativo y decisiones", pero el usuario aclaro que no queria implementarlo. Ya fue eliminado y redeployado.
- No volver a crear panel de premortem salvo que el usuario lo pida explicitamente.

## Historial

- Admin puede editar registros de produccion, colacion y mermas.
- Admin puede eliminar productos/lineas dentro de registros.
- Admin puede cambiar la fecha de produccion, merma y colacion desde Historial.
- Cocina tiene historial limitado a hoy.
- Se corrigio logica al agregar nuevos PP desde Historial:
  - Antes calculaba `cantidad * costo_unitario` para PP nuevos.
  - Ahora respeta conversion de `gramos_por_pp` y unidad del producto (`KG`/`LT`) usando total producido.

Archivos relevantes:
- `app/(app)/historial/page.tsx`
- `app/api/produccion/route.ts`
- `app/api/colacion/route.ts`
- `app/api/mermas/route.ts`

## Migracion de Mayo 2026

- El usuario entrego Excel `PEDIDOS PRODUCCION EN PROCESO 2026 actualizar.xlsx`.
- Se generaron queries SQL para insertar faltantes de produccion, detalle, rendimiento, mermas y detalle de mermas.
- Hubo un error inicial por proyecto Supabase equivocado; luego se ejecuto en el proyecto correcto.
- Resultado reportado por el usuario:
  - `staged_produccion`: 20
  - `inserted_produccion`: 20
  - `staged_detalle_produccion`: 102
  - `inserted_detalle_produccion`: 106
  - `staged_rendimiento`: 20
  - `inserted_rendimiento`: 21
  - `staged_mermas`: 17
  - `inserted_mermas`: 17
  - `staged_detalle_mermas`: 45
  - `inserted_detalle_mermas`: 87
- Se detectaron duplicados aparentes:
  - mermas 2026-05-23 de PAULINA TRONCOSO.
  - produccion 2026-05-18 PM de PAMELA COLIHUINCA.

## Correccion PP FILETE DE POLLO

Problema detectado:
- Registro 2026-05-20 PM, responsable PAMELA COLIHUINCA.
- `PP FILETE DE POLLO` mostraba costo gigante, aprox. `$13.614.000`.
- Causa:
  - El PP estaba asociado a codigo `0301002`, producto `CHURRASCO PORCIONADO (UND)`, unidad `UN`, costo `2269`.
  - El sistema calculo `30 * 200g = 6000`; al ver unidad `UN`, hizo `6000 * 2269`.

Correccion aplicada en Supabase:
- `PP FILETE DE POLLO` ahora apunta a:
  - codigo producto `0302001`
  - producto `FILETE DE PECHUGA (KG)`
  - unidad `KG`
  - costo promedio `3393`
  - `gramos_por_pp = 200`
- Se corrigieron solo las 3 lineas historicas infladas con codigo `0301002`.
- Para 2026-05-20 PM:
  - antes: `30 x 200g = 6000`, costo `$13.614.000`
  - despues: `6 kg x $3.393 = $20.358`
- Verificacion posterior:
  - `bad_count` para `PP FILETE DE POLLO` con `codigo_producto = 0301002`: 0.

Archivos de codigo corregidos:
- `app/(app)/historial/page.tsx`
- `app/api/produccion/route.ts`

## Premortem / Diagnostico del Sistema

Fortalezas:
- Modulos operativos ya estan bien separados.
- Roles basicos funcionan.
- Historial y exportacion entregan trazabilidad operativa.
- TOTEAT + recetas permite llegar a `% costo`.
- Bodega critica agrega control al economo.

Riesgos actuales:
- Roles hardcodeados en `lib/roles.ts`.
- Hay duplicacion entre permisos de frontend/backend; conviene centralizar y testear.
- Algunos endpoints hacen insert de encabezado y detalle sin transaccion SQL, lo que puede dejar encabezados vacios si falla el detalle.
- Mapeo TOTEAT-carta aun no es una tabla editable.
- Bodega muestra diferencia neta; debe mostrar tambien diferencia absoluta/top descuadres.
- TOTEAT no tiene sync automatico ni reintentos/timeouts robustos.
- Hay advertencias de lint no bloqueantes:
  - uso de `<img>` en costos/modal.
  - `title` no usado en `TopBar`.
  - variables no usadas en scripts antiguos.

## Deploys Recientes

- Alias productivo usado siempre: `https://kitchenops-chi.vercel.app`.
- Ultimo deploy de esta sesion incluyo:
  - correccion de guardado en `/produccion` para aceptar rendimiento sin PP.
  - edicion de nombre de producto desde `/maestros`.
  - exposicion y despliegue del modulo `/frutas`.
- Se agrego `.vercelignore` para excluir logs, memoria local, excels y artefactos no necesarios del deploy.

## Supabase

- La base productiva ya tenia aplicadas las tablas de `frutas` y la vista `v_pp_recetas_activas`.
- La precision de costos PP ya estaba aplicada en produccion antes de intentar una nueva migracion.
- Validado en esquema real:
  - `productos.costo_promedio` = `numeric(14,6)`
  - `pp_recetas.costo_unitario_calculado` = `numeric(14,6)`
  - `pp_recetas.costo_total_calculado` = `numeric(14,6)`
  - `pp_receta_ingredientes.costo_unitario_snap` = `numeric(14,6)`
  - `pp_receta_ingredientes.costo_linea_calculado` = `numeric(14,6)`
  - `detalle_produccion.costo_unitario` = `numeric(14,6)`
- Se uso la Management API de Supabase para consultar el esquema remoto y confirmar ese estado.

## Comandos de Verificacion Usados

```bash
npm run lint
npm run build
npx eslint --no-warn-ignored -- "app/(app)/historial/page.tsx" "app/api/produccion/route.ts"
npx vercel --prod --yes
```

## Siguientes Mejoras Recomendadas

1. Crear tabla Supabase para usuarios/roles y dejar de editar `lib/roles.ts` para cada usuario.
2. Crear tabla de mapeo `toteat_producto_map` editable desde Maestros/Ventas.
3. Crear funciones SQL transaccionales para guardar produccion, colacion y mermas.
4. Agregar auditoria completa en ediciones y borrados de Historial.
5. Agregar sync programado diario de TOTEAT.
6. Agregar alertas de calidad de datos:
   - ventas sin receta
   - productos sin costo
   - producciones sin detalle
   - diferencias absolutas en bodega
   - PP con unidad inconsistente.
