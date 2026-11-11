# Conciliación Control Cárnicos — Octubre 2026: ajustes posteriores

Complemento de `conciliacion-carnicos-octubre-2026.json` (commit 2210ac0). Cambios aplicados directamente
en Supabase el 2026-11-11 según indicación de la usuaria, sobre los pendientes de la sección 7 de
`Cambios_Octubre_2026_Claude_Code.md`. Movimientos nuevos con `created_by = conciliacion-octubre-2026-b` y
responsable "AJUSTE CONCILIACIÓN OCT-2026"; los editados llevan la nota en `observacion`.
Respaldos de lo editado/eliminado en `scripts/backups/` (no versionado).

## Control Cárnicos (`carnicos_movimientos`)

| Producto | Campo | Cambio | Motivo |
|---|---|---|---|
| HAMBURGUESA DE CLIENTE UNID (ANGUS) | Colación | + 18 UN el 30-10 | En Colación se registró como "HAMBURGUESA DE PERSONAL (UN)"; es Angus |
| HAMBURGUESA DE CLIENTE UNID (ANGUS) | Colación | Eliminado 1 de 2 movimientos de 70 UN del 20-10 (el de Javiera) | Duplicado; Colación = 50 + 70 + 18 = 138 |
| ASADO CARNICERO KG | Colación | Eliminado 10,72 kg del 09-10 (queda el del 10-10) | Duplicado |
| CARNE ABASTERO/SOBRECOSTILLA KG. | Colación | 30-09: 20,1 → 22,1 kg | Colación 01-10 = 22,10 kg (afecta septiembre) |
| SALMÓN SLICE (100 GRS) (UND). | Merma | + 3 UN el 18-10 | Registrada en Mermas como 0,315 UN |
| LOMITO KASSLER LAMINADO 125grs c/u | Producción | 250 → 1.800 g (13-10 600, 21-10 700, 27-10 250→500) | 18 porciones PP LOMITO KASSLER (PP) de 100 g del módulo Producción |
| CARNE DE CRUDO (GRS). | Ingresos | 13-10 40.000 g: Ingreso PP → Recepción bodega | Mal clasificado (no cambia el total) |
| SALCHICHAS HOT DOG (UND). | Colación | 24-10: 66 → 60 UN | Oficial: módulo Colación |
| FILETE DE PECHUGA (KGS). | Colación | + 01-10 1 kg, 14-10 0,4 kg, 17-10 0,2 kg; 20 kg del 24-10 → 23-10 | Oficial: módulo Colación |

Se mantienen los valores de Joel (cuadran con el inventario final): Chuleta personal 12,7 kg (11-10),
Trutro pollo 48,79 kg (15-10), Not chorizo vegano 4 UN (06-10) y Filete de pechuga 20 kg (28-10).
Costillas baby ribs 147 UN del 30-10 se mantienen en octubre (llegaron antes del conteo final).

## Módulo Mermas (`detalle_mermas`)

- 18-10, Tanlla Herrera, SALMÓN LAMINADO X 100 GRS (UN): 0,315 → 3 UN (costo total $598 → $5.691).

## Resultado

Diferencia $ octubre: $1.256.432 (tras 2210ac0) → **$1.146.497** (sobrantes $4.577.091 / faltantes −$3.430.594).
Septiembre: $26.462 → $39.957 (Abastero 30-09).

## Pendiente

- Cruzar módulo Producción con Control Cárnicos: pares materia prima sobrante / PP faltante
  (Pechuga +37,8 kg vs PP Filete de pollo −200; Ciervo +25 kg vs PP Ciervo cazadora −108;
  Plateada +63,6 kg vs PP Plateada/Mechada; Entraña +18,2 kg vs PP Malaya 400 −35).
- Centolla +15 kg y PP Chupe centolla +113 (evento K55xxx 22-10: ¿bandejas o personas?).
- PP Salmón trozo −58 vs PP Salmón ceviche +27.
- Mermas del reporte mayores que el historial; costo de schnitzel; ítems "REVISAR" del documento.
